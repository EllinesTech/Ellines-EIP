import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApprovalDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;

  @IsEnum(['simple', 'it_then_owner', 'manager_exec_owner'])
  templateId!: 'simple' | 'it_then_owner' | 'manager_exec_owner';

  @IsOptional()
  @IsEnum(['manual', 'template', 'decision-seed'])
  source?: 'manual' | 'template' | 'decision-seed';
}
