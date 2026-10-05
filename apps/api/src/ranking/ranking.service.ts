import { Injectable, NotFoundException } from '@nestjs/common';
import { ParticipantStatus, ReferralStatus } from '@prisma/client';
import { resolveCampaign } from '../public/public-identity';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  async publicRanking(slug: string) {
    const resolved = await resolveCampaign(this.prisma, slug);
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: resolved.id },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const participants = await this.prisma.participant.findMany({
      where: {
        campaignId: campaign.id,
        status: ParticipantStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const grouped = await this.prisma.referral.groupBy({
      by: ['referrerParticipantId'],
      where: {
        campaignId: campaign.id,
        status: ReferralStatus.VALID,
      },
      _count: {
        _all: true,
      },
    });

    const scoreByParticipant = new Map<string, number>(
      grouped.map((row) => [
        row.referrerParticipantId,
        row._count._all,
      ]),
    );

    const ranking = participants
      .map((participant) => {
        const pieces = participant.name.trim().split(/\s+/);
        const first = pieces[0] ?? participant.name;
        const last = pieces.length > 1 ? pieces[pieces.length - 1] : '';
        const publicName = last
          ? `${first} ${last.charAt(0)}.`
          : first;

        return {
          participantId: participant.id,
          name: publicName,
          score: scoreByParticipant.get(participant.id) ?? 0,
        };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((item, index) => ({
        position: index + 1,
        ...item,
      }));

    return {
      campaign,
      ranking,
      updatedAt: new Date().toISOString(),
    };
  }
}
