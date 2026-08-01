import { IsEnum, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateRuleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsEnum(['open_alerts_gte', 'open_decisions_gte', 'health_lt'])
  when!: 'open_alerts_gte' | 'open_decisions_gte' | 'health_lt';

  @IsInt()
  @Min(0)
  @Max(1000)
  threshold!: number;

  @IsEnum(['seed_approval', 'flag_overview'])
  then!: 'seed_approval' | 'flag_overview';
}
