import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  /** Compressed data URL, or empty string to clear. */
  @IsOptional()
  @IsString()
  @MaxLength(180000)
  avatarUrl?: string;
}
