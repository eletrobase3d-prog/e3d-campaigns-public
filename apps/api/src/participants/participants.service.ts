import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CampaignStatus, ParticipantStatus, ReferralStatus } from '@prisma/client';
import { publicKey, resolveCampaign } from '../public/public-identity';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../common/serializable';
import { normalizeEmail, normalizePhone, sameContact, validityDeadline } from '../referrals/referral-policy';
import { RegisterParticipantDto } from './dto/register-participant.dto';

@Injectable()
export class ParticipantsService {
  constructor(private readonly prisma: PrismaService) {}

  async register(campaignSlug: string, dto: RegisterParticipantDto) {
    return serializable(this.prisma, async tx => {
      const resolved = await resolveCampaign(tx, campaignSlug);
      const campaigns = await tx.campaign.findMany({ where: { id: resolved.id }, take: 2,
        include: { rules: true, organization: true, _count: { select: { participants: true } } } });
      if (!campaigns.length) throw new NotFoundException('Campaign not found');
      if (campaigns.length !== 1) throw new ConflictException('Identificador público ambíguo.');
      const campaign = campaigns[0];
      const now = new Date();
      if (campaign.organization.status !== 'ACTIVE' || campaign.status !== CampaignStatus.ACTIVE) throw new BadRequestException('Campaign is not active');
      if (campaign.startsAt && campaign.startsAt > now) throw new BadRequestException('Campaign has not started yet');
      if (campaign.endsAt && campaign.endsAt <= now) throw new BadRequestException('Campaign has already ended');
      if (campaign.maxParticipants && campaign._count.participants >= campaign.maxParticipants) throw new BadRequestException('Campaign participant limit reached');
      const name = dto.name.trim();
      const email = normalizeEmail(dto.email);
      const phone = normalizePhone(dto.phone);
      if (name.length < 2) throw new BadRequestException('Informe um nome válido.');
      if (dto.phone?.trim() && !phone) throw new BadRequestException('Informe um telefone válido.');
      if (campaign.rules?.requireUniquePhone && !phone) throw new BadRequestException('Telefone obrigatório nesta campanha.');
      if (campaign.rules?.requireUniqueEmail && !email) throw new BadRequestException('E-mail obrigatório nesta campanha.');
      if (phone && campaign.rules?.requireUniquePhone) {
        // Include legacy formatted numbers without rewriting participant data.
        const matches = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM participants WHERE campaign_id = ${campaign.id}::uuid
          AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = ${phone} LIMIT 1`;
        if (matches.length) throw new ConflictException('Phone already registered in this campaign');
      }
      if (email && campaign.rules?.requireUniqueEmail) {
        const exists = await tx.participant.findFirst({ where: { campaignId: campaign.id, email: { equals: email, mode: 'insensitive' } } });
        if (exists) throw new ConflictException('Email already registered in this campaign');
      }
      const code = dto.referredByCode?.trim().toUpperCase();
      const referrer = code ? await tx.participant.findFirst({ where: {
        campaignId: campaign.id, organizationId: campaign.organizationId, referralCode: code, status: ParticipantStatus.ACTIVE,
      } }) : null;
      if (code && !referrer) throw new BadRequestException('Invalid referral code for this campaign');
      if (referrer && !campaign.rules?.allowSelfReferral && sameContact(referrer, { phone, email })) throw new BadRequestException('Autoindicação não permitida.');
      if (referrer && campaign.rules?.maxReferralsPerParticipant) {
        const reserved = await tx.referral.count({ where: { campaignId: campaign.id, referrerParticipantId: referrer.id,
          status: { in: [ReferralStatus.PENDING, ReferralStatus.VALID] } } });
        if (reserved >= campaign.rules.maxReferralsPerParticipant) throw new BadRequestException('Referrer reached the referral limit');
      }
      const prefix = campaign.referralCodePrefix?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
      let referralCode: string;
      do { referralCode = prefix + randomBytes(8).toString('hex').toUpperCase(); }
      while (await tx.participant.findFirst({ where: { referralCode }, select: { id: true } }));
      const participant = await tx.participant.create({ data: {
        organizationId: campaign.organizationId, campaignId: campaign.id, name, email, phone, referralCode, validatedAt: now,
      } });
      let referralStatus: ReferralStatus | null = null;
      let eligibleAt: Date | null = null;
      if (referrer) {
        eligibleAt = validityDeadline(now, campaign.rules?.minValidityHours ?? 0);
        referralStatus = eligibleAt <= now && !campaign.rules?.requiresManualApproval ? ReferralStatus.VALID : ReferralStatus.PENDING;
        const referral = await tx.referral.create({ data: {
          organizationId: campaign.organizationId, campaignId: campaign.id,
          referrerParticipantId: referrer.id, referredParticipantId: participant.id,
          status: referralStatus, eligibleAt, createdAt: now,
          validatedAt: referralStatus === ReferralStatus.VALID ? now : null, source: 'public_registration',
        } });
        await tx.auditLog.create({ data: {
          organizationId: campaign.organizationId, action: 'referral.create', entityType: 'referral', entityId: referral.id,
          metadata: { status: referralStatus, eligibleAt: eligibleAt.toISOString() },
        } });
      }
      return { participantId: participant.id, referralCode, campaignSlug: campaign.slug,
        participantName: participant.name, referralPath: `/r/${publicKey(participant.id)}`, referralStatus, eligibleAt };
    });
  }
}
