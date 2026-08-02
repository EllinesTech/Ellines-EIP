import { IsString, IsOptional, IsBoolean, IsArray, MaxLength, MinLength, Matches } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a valid hex color e.g. #6F2D8D' })
  color?: string;

  @IsOptional()
  @IsString()
  baseRole?: string;

  /** Array of permission entries — validated at service level */
  @IsOptional()
  @IsArray()
  permissions?: unknown[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a valid hex color e.g. #6F2D8D' })
  color?: string;

  @IsOptional()
  @IsString()
  baseRole?: string;

  @IsOptional()
  @IsArray()
  permissions?: unknown[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
