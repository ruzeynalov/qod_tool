import { IsString, IsOptional, IsObject, IsInt, IsBoolean, Min, Max } from 'class-validator';

export class UpdateProjectDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, any>;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(3650)
  retentionDays?: number;

  @IsBoolean()
  @IsOptional()
  demoMode?: boolean;
}
