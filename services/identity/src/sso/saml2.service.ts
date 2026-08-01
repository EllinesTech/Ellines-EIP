import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UserRole } from '@prisma/client';

/**
 * SAML2 SSO Service
 * Generates AuthnRequest, parses SAML Response assertion.
 */
@Injectable()
export class Saml2SsoService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate SAML2 AuthnRequest.
   * User clicks "Sign in with SAML" → EIP sends AuthnRequest to IdP.
   */
  async generateAuthNRequest(
    providerId: string,
    state: string,
  ): Promise<{ redirectUrl: string; relayState: string }> {
    const provider = await this.prisma.ssoProvider.findUnique({
      where: { id: providerId },
    });

    if (!provider || provider.type !== 'saml2') {
      throw new Error('SAML2 provider not found');
    }

    // Generate AuthnRequest XML (simplified)
    const id = this.generateId();
    const instant = new Date().toISOString();
    const acsUrl = provider.acsUrl || `${process.env.BASE_URL}/api/v1/auth/sso/saml2/acs`;

    const authnRequest = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" 
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${id}"
  Version="2.0"
  IssueInstant="${instant}"
  Destination="${provider.idpSsoUrl}"
  AssertionConsumerServiceURL="${acsUrl}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${provider.entityId || `${process.env.BASE_URL}/saml`}</saml:Issuer>
</samlp:AuthnRequest>`;

    // Encode to base64 for HTTP-POST binding
    const encoded = Buffer.from(authnRequest).toString('base64');

    return {
      redirectUrl: provider.idpSsoUrl!,
      relayState: state,
    };
  }

  /**
   * Parse SAML Response assertion.
   * IdP POSTs SAML Response here after user authenticates.
   */
  async handleSamlResponse(
    samlResponse: string,
    provider: { idpCertificate?: string; attributeMap?: unknown },
  ): Promise<{ email: string; name: string; externalId: string; groups: string[] }> {
    // Decode base64
    const xml = Buffer.from(samlResponse, 'base64').toString('utf-8');

    // Parse XML (simplified — extract NameID + attributes)
    const nameIdMatch = xml.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
    const nameId = nameIdMatch?.[1] || '';

    // Extract attributes
    const attributes: Record<string, string[]> = {};
    const attrRegex = /<saml:Attribute Name="([^"]+)"[^>]*>[\s\S]*?<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>[\s\S]*?<\/saml:Attribute>/g;

    let match;
    while ((match = attrRegex.exec(xml)) !== null) {
      const [, name, value] = match;
      if (!attributes[name]) attributes[name] = [];
      attributes[name].push(value);
    }

    // Map attributes using provider config
    const attrMap = provider.attributeMap as Record<string, string> | undefined || {};
    const email = this.getAttribute(attributes, attrMap['email'] || 'email') || '';
    const name = this.getAttribute(attributes, attrMap['name'] || 'name') || '';
    const groupsAttr = attrMap['groups'] || 'groups';
    const groups = attributes[groupsAttr] || [];

    if (!email) {
      throw new Error('Email attribute missing from SAML Response');
    }

    return {
      email,
      name,
      externalId: nameId,
      groups,
    };
  }

  /**
   * Find or create user from SAML attributes.
   */
  async findOrCreateUser(
    organizationId: string,
    provider: { id: string; autoProvision: boolean; defaultRole: string; groupRoleMap?: unknown },
    samlAttrs: { email: string; name: string; externalId: string; groups: string[] },
  ): Promise<{ userId: string; role: string }> {
    // Try to find existing user
    let user = await this.prisma.user.findUnique({
      where: { email: samlAttrs.email },
    });

    if (!user) {
      if (!provider.autoProvision) {
        throw new Error('User not found and auto-provisioning disabled');
      }

      // Auto-create user
      user = await this.prisma.user.create({
        data: {
          email: samlAttrs.email,
          fullName: samlAttrs.name || samlAttrs.email,
          passwordHash: '(saml2)',
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
          externalId: samlAttrs.externalId,
        },
      },
    });

    if (!existing) {
      await this.prisma.ssoProviderUser.create({
        data: {
          ssoProviderId: provider.id,
          userId: user.id,
          externalId: samlAttrs.externalId,
          externalEmail: samlAttrs.email,
          attributes: { groups: samlAttrs.groups },
        },
      });
    }

    // Map groups to roles
    let role = user.role;
    if (provider.groupRoleMap && typeof provider.groupRoleMap === 'object') {
      const groupMap = provider.groupRoleMap as Record<string, string>;
      const mappedRole = Object.entries(groupMap).find(([group]) =>
        samlAttrs.groups.includes(group),
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
          externalId: samlAttrs.externalId,
        },
      },
      data: { lastLoginAt: new Date() },
    });

    return { userId: user.id, role };
  }

  private getAttribute(attributes: Record<string, string[]>, name: string): string | undefined {
    return attributes[name]?.[0];
  }

  private generateId(): string {
    return `_${Buffer.from(Math.random().toString()).toString('base64').slice(0, 20)}`;
  }
}
