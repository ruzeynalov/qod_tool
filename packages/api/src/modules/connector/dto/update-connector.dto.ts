import { IsString, IsObject, IsOptional, IsIn } from 'class-validator';

export class UpdateConnectorDto {
  @IsString()
  @IsOptional()
  @IsIn(['GITHUB', 'TESTRAIL', 'JIRA', 'JIRA_STORIES', 'JUNIT_XML', 'TESTNG_XML'])
  connectorType?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  credentials?: Record<string, any>;

  @IsObject()
  @IsOptional()
  fieldMapping?: Record<string, string>;

  @IsString()
  @IsOptional()
  syncSchedule?: string;

  @IsString()
  @IsOptional()
  syncTimezone?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'ERROR', 'SYNCING'])
  status?: string;
}
