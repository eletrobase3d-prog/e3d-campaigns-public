import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRewardDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  positionStart?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  positionEnd?: number;

  @IsString()
  @MaxLength(30)
  rewardType!: string;

  @IsString()
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monetaryValue?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
