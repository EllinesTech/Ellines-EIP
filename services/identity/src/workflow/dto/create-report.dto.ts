import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReportDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsEnum(['daily', 'weekly'])
  cadence!: 'daily' | 'weekly';
}
