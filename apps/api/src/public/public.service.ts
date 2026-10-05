import { Injectable, NotFoundException } from '@nestjs/common';
import { ParticipantStatus } from '@prisma/client';
import { publicKey, resolveCampaign, resolveParticipant } from './public-identity';
import { issueClickTicket } from './click-ticket';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async campaign(slug: string) {
    const resolved = await resolveCampaign(this.prisma, slug);
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: resolved.id },
      select: {
        id: true,
        name: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
        status: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        maxParticipants: true,
        rewards: {
          orderBy: [{ positionStart: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            positionStart: true,
            positionEnd: true,
            rewardType: true,
            title: true,
            monetaryValue: true,
            description: true,
          },
        },
        rules: {
          select: {
            referralRequiresRegistration: true,
            minValidityHours: true,
            requiresManualApproval: true,
            maxReferralsPerParticipant: true,
            requireUniquePhone: true,
            requireUniqueEmail: true,
          },
        },
        _count: {
          select: {
            participants: true,
            referrals: { where: { status: 'VALID' } },
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return { ...campaign, publicKey: publicKey(campaign.id), publicPath: `/c/${publicKey(campaign.id)}` };
  }

  async referral(code: string) {
    const p = await resolveParticipant(this.prisma, code);
    return { id: p.id, name: p.name, referralCode: p.referralCode,
      campaign: { slug: p.campaign.slug, publicKey: publicKey(p.campaignId), name: p.campaign.name, status: p.campaign.status } };
  }
  async referrer(key: string, code: string) {
    const campaign = await resolveCampaign(this.prisma, key);
    if (code.length > 40) throw new NotFoundException('Indicação não encontrada nesta campanha.');
    const p = await this.prisma.participant.findFirst({ where: { campaignId: campaign.id, organizationId: campaign.organizationId,
      referralCode: code.trim().toUpperCase(), status: ParticipantStatus.ACTIVE }, select: { id: true, name: true, referralCode: true } });
    if (!p) throw new NotFoundException('Indicação não encontrada nesta campanha.');
    let ticket: string | null = null;
    try { ticket = issueClickTicket(campaign.id, p.id); } catch { /* Attribution must work even if tracking is unavailable. */ }
    return { name: p.name, referralCode: p.referralCode, ticket };
  }
}
