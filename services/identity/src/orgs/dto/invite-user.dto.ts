import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';
import { EIP_ROLES, UserRole } from '@ellines-eip/shared';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsIn(EIP_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MinLength(8)
  temporaryPassword?: string;
}
