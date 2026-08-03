import { IsString, IsIn } from 'class-validator';

export class ApproveExecutionDto {
  @IsString()
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';
}
