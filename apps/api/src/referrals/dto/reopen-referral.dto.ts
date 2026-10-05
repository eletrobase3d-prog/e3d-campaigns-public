import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class ReopenReferralDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
