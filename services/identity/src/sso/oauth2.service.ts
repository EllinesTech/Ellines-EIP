import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UserRole } from '@prisma/client';

/**
 * OAuth2 / OIDC SSO Service
 * Handles authorization flow, token exchange, user provisioning.
 */
@Injectable()
export class OAuth2SsoService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate OAuth2 authorization URL.
   * User clicks "Sign in with Azure AD" → redirected to IdP.
   */
  async generateAuthorizationUrl(
    providerId: string,
    state: string,
    nonce: string,
  ): Promise<string> {
    const provider = await this.prisma.ssoProvider.findUnique({
      where: { id: providerId },
    });

    if (!provider || !provider.isActive) {
      throw new Error('SSO provider not found or disabled');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: provider.clientId!,
      redirect_uri: `${process.env.BASE_URL}/api/v1/auth/sso/oauth2/callback`,
      scope: 'openid profile email',
      state,
      nonce,
    });

    const authzUrl = provider.authzUrl || `${provider.discoveryUrl}?..`;
    return `${authzUrl}?${params.toString()}`;
  }

  /**
   * Handle OAuth2 callback.
   * IdP redirects here with authorization code.
   */
  async handleCallback(
    code: string,
    state: string,
    provider: { clientId: string; clientSecret: string; tokenUrl: string },
  ): Promise<{ accessToken: string; idToken: string; claims: Record<string, unknown> }> {
    // Exchange code for tokens
    const tokenRes = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        redirect_uri: `${process.env.BASE_URL}/api/v1/auth/sso/oauth2/callback`,
      }).toString(),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.statusText}`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      id_token: string;
    };

    // Decode ID token (simple JWT decode, no signature validation for now)
    const claims = this.decodeJwt(tokens.id_token);

    return {
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      claims,
    };
  }

  /**
   * Find or create user from OAuth2 claims.
   */
  async findOrCreateUser(
    organizationId: string,
    provider: { id: string; autoProvision: boolean; defaultRole: string; groupRoleMap?: unknown },
    claims: Record<string, unknown>,
  ): Promise<{ userId: string; role: string }> {
    const email = claims.email as string;
    const name = claims.name as string;
    const sub = claims.sub as string;
    const groups = (claims.groups as string[]) || [];

    if (!email) {
      throw new Error('Email claim missing from OAuth2 response');
    }

    // Try to find existing user
    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      if (!provider.autoProvision) {
        throw new Error('User not found and auto-provisioning disabled');
      }

      // Auto-create user
      user = await this.prisma.user.create({
        data: {
          email,
          fullName: name || email,
          passwordHash: '(oauth2)',
          organizationId,
          role: (provider.defaultRole || 'member') as UserRole,
          isActive: true,
        },
      });
    }

    // Link to SSO provider
    const existing = await this.prisma.ssoProviderUser.findUnique({
      where: {
        ssoProviderId_externalId: {
          ssoProviderId: provider.id,
          externalId: sub,
        },
      },
    });

    if (!existing) {
      await this.prisma.ssoProviderUser.create({
        data: {
          ssoProviderId: provider.id,
          userId: user.id,
          externalId: sub,
          externalEmail: email,
          attributes: { groups },
        },
      });
    }

    // Map groups to roles
    let role = user.role;
    if (provider.groupRoleMap && typeof provider.groupRoleMap === 'object') {
      const groupMap = provider.groupRoleMap as Record<string, string>;
      const mappedRole = Object.entries(groupMap).find(([group]) =>
        groups.includes(group),
      )?.[1];

      if (mappedRole) {
        role = mappedRole as UserRole;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { role },
        });
      }
    }

    // Update last login
    await this.prisma.ssoProviderUser.update({
      where: {
        ssoProviderId_externalId: {
          ssoProviderId: provider.id,
          externalId: sub,
        },
      },
      data: { lastLoginAt: new Date() },
    });

    return { userId: user.id, role };
  }

  /**
   * Simple JWT decode (no signature validation).
   * In production, validate signature using provider's public key.
   */
  private decodeJwt(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');

    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  }
}
