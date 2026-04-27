import { IsString, IsNumber, IsOptional, IsObject, IsIn } from 'class-validator';

const METRICS = [
  'COVERAGE_PCT', 'PASS_RATE_7D', 'PASS_RATE_30D', 'FLAKY_RATE',
  'MTTD_HOURS', 'MTTR_HOURS', 'ESCAPE_RATE', 'EXEC_VELOCITY',
  'REQ_COVERAGE', 'READINESS_SCORE', 'DEFECT_DENSITY',
];

const CONDITIONS = ['LESS_THAN', 'GREATER_THAN', 'DELTA_PCT'];
const CHANNELS = ['SLACK', 'EMAIL', 'IN_APP'];

export class CreateAlertRuleDto {
  @IsString()
  @IsIn(METRICS)
  metric: string;

  @IsString()
  @IsIn(CONDITIONS)
  condition: string;

  @IsNumber()
  threshold: number;

  @IsString()
  @IsIn(CHANNELS)
  channel: string;

  @IsOptional()
  @IsObject()
  channelConfig?: Record<string, any>;
}
