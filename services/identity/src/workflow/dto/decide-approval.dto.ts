import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideApprovalDto {
  @IsEnum(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  actorName?: string;
}
