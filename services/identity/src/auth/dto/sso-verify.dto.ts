import { IsString, MinLength } from 'class-validator';

export class SsoVerifyDto {
  @IsString()
  @MinLength(16)
  token!: string;
}
