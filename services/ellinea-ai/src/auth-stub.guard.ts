import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Auth stub for Ellinea Nest service.
 * - Default (MVP): open on localhost; Authorization header accepted but not required.
 * - Set ELLINEA_REQUIRE_AUTH=1 to require `Authorization: Bearer <token>` (token presence only;
 *   full JWT verify lands with Identity integration).
 */
@Injectable()
export class EllineaAuthStubGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      method?: string;
      url?: string;
    }>();
    const path = typeof req.url === 'string' ? req.url : '';
    if (req.method === 'GET' && path.includes('/health')) {
      return true;
    }

    const requireAuth = process.env.ELLINEA_REQUIRE_AUTH === '1';
    const raw = req.headers?.authorization;
    const header = Array.isArray(raw) ? raw[0] : raw;
    const hasBearer =
      typeof header === 'string' && /^Bearer\s+\S+/i.test(header.trim());

    if (requireAuth && !hasBearer) {
      throw new UnauthorizedException(
        'Bearer token required (set ELLINEA_REQUIRE_AUTH=0 to open MVP stub)',
      );
    }
    return true;
  }
}
