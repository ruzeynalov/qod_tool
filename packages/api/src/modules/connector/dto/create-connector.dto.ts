import { IsString, IsNotEmpty, IsObject, IsOptional, IsIn } from 'class-validator';

export class CreateConnectorDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['GITHUB', 'TESTRAIL', 'JIRA', 'JIRA_STORIES', 'JUNIT_XML', 'TESTNG_XML'])
  connectorType: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsObject()
  credentials: Record<string, any>;

  @IsObject()
  @IsOptional()
  fieldMapping?: Record<string, string>;

  @IsString()
  @IsOptional()
  syncSchedule?: string;

  @IsString()
  @IsOptional()
  syncTimezone?: string;
}
