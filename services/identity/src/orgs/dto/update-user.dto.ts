import { IsBoolean, IsIn, IsOptional } from 'class-validator';

const EIP_ROLES = ['owner', 'admin', 'executive', 'manager', 'member', 'viewer'] as const;
type UserRole = (typeof EIP_ROLES)[number];

export class UpdateUserDto {
  @IsOptional()
  @IsIn([...EIP_ROLES])
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
