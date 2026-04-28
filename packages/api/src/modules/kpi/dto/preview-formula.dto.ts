import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class PreviewFormulaDto {
  @IsObject()
  parameters: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  expression?: string | null;
}
