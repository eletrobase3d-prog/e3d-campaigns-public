import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateRulesDto {
  @IsOptional()
  @IsBoolean()
  referralRequiresRegistration?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSelfReferral?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(87600)
  minValidityHours?: number;

  @IsOptional()
  @IsBoolean()
  requiresManualApproval?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxReferralsPerParticipant?: number;

  @IsOptional()
  @IsBoolean()
  requireUniquePhone?: boolean;

  @IsOptional()
  @IsBoolean()
  requireUniqueEmail?: boolean;
}
