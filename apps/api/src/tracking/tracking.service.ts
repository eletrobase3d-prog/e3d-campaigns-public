import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { readClickTicket } from '../public/click-ticket';
import { serializable } from '../common/serializable';
import { Prisma } from '@prisma/client';
@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}
  async record(eventId: string, ticket: string) {
    const claim = readClickTicket(ticket);
    return serializable(this.prisma, async tx => {
      // A bounded per-campaign gate applies across API replicas without retaining client IPs.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${claim.campaignId}, 0))::text`;
      const previous = await tx.referralClick.findUnique({ where: { eventId } });
      if (previous) {
        if (previous.campaignId !== claim.campaignId || previous.participantId !== claim.participantId) throw new ConflictException('Evento já utilizado.');
        return { recorded: true, duplicate: true };
      }
      const p = await tx.participant.findFirst({ where: { id: claim.participantId, campaignId: claim.campaignId, status: 'ACTIVE',
        organization: { status: 'ACTIVE' }, campaign: { status: 'ACTIVE' } }, include: { campaign: true } });
      const now = new Date();
      if (!p || p.organizationId !== p.campaign.organizationId || (p.campaign.startsAt && p.campaign.startsAt > now) ||
        (p.campaign.endsAt && p.campaign.endsAt <= now)) throw new NotFoundException('Indicação indisponível.');
      const since = new Date(now.getTime() - 60000);
      const total = await tx.referralClick.count({ where: { campaignId: claim.campaignId, createdAt: { gte: since } } });
      const perParticipant = await tx.referralClick.count({ where: { participantId: p.id, createdAt: { gte: since } } });
      if (total >= 600 || perParticipant >= 60) throw new HttpException('Limite temporário de cliques atingido.', 429);
      await tx.referralClick.create({ data: { eventId, organizationId: p.organizationId, campaignId: p.campaignId, participantId: p.id } });
      return { recorded: true, duplicate: false };
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Evento já utilizado.');
      throw error;
    });
  }
}
