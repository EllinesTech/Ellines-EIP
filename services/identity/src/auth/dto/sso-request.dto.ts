import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SsoRequestDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  provider?: string;
}
