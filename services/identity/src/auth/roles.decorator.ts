import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@ellines-eip/shared';

export const ROLES_KEY = 'roles';

/** Require one of the listed roles (used with RolesGuard). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
