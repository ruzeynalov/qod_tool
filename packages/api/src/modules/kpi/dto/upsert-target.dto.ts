import { IsNumber, Min } from 'class-validator';

export class UpsertTargetDto {
  @IsNumber()
  @Min(0)
  target: number;

  @IsNumber()
  @Min(0)
  greenThreshold: number;

  @IsNumber()
  @Min(0)
  amberThreshold: number;
}
