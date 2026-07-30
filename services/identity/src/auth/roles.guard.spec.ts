import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new RolesGuard(reflector);

  function contextWithRole(role?: string) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    } as never;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows when no roles metadata is set', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    expect(guard.canActivate(contextWithRole('member'))).toBe(true);
  });

  it('allows when user has a required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['owner', 'admin']);
    expect(guard.canActivate(contextWithRole('admin'))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('forbids when user lacks required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['owner', 'admin']);
    expect(() => guard.canActivate(contextWithRole('member'))).toThrow(ForbiddenException);
  });

  it('forbids when request has no user', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['owner']);
    expect(() => guard.canActivate(contextWithRole(undefined))).toThrow(ForbiddenException);
  });
});
