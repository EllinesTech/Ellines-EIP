import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';

const EIP_ROLES = ['owner', 'admin', 'executive', 'manager', 'member', 'viewer'] as const;
type UserRole = (typeof EIP_ROLES)[number];

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsIn([...EIP_ROLES])
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MinLength(8)
  temporaryPassword?: string;
}
