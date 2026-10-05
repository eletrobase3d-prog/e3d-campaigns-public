import { IsIn, IsInt, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
export class ReviewReferralDto {
  @IsIn(['VALID', 'INVALID', 'FRAUD'])
  status!: 'VALID' | 'INVALID' | 'FRAUD';
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}
