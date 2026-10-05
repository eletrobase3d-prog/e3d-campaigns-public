import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, Prisma } from '@prisma/client';
import { serializable } from '../common/serializable';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { UpdateRulesDto } from './dto/update-rules.dto';
import { CreateRewardDto } from './dto/create-reward.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}


  private async assertWriter(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
    const membership = await tx.organizationUser.findFirst({ where: {
      organizationId, userId, role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
      user: { status: 'ACTIVE' }, organization: { status: 'ACTIVE' },
    } });
    if (!membership) throw new ForbiddenException('Sem permissão para alterar campanhas.');
  }

  private async lockCampaign(tx: Prisma.TransactionClient, organizationId: string, id: string) {
    // All administrative writers lock the same tenant-scoped row before reading rules/rewards.
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM campaigns WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Campanha não encontrada.');
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private isClosedStatus(status: CampaignStatus): boolean {
    return (
      status === CampaignStatus.FINISHED ||
      status === CampaignStatus.CANCELLED
    );
  }

  private async audit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string | null,
    action: string,
    campaignId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action,
        entityType: 'campaign',
        entityId: campaignId,
        metadata,
      },
    });
  }

  async processScheduledCampaign(organizationId: string, id: string, clock: () => Date = () => new Date()) {
    return serializable(this.prisma, async tx => {
      await this.lockCampaign(tx, organizationId, id);
      const campaign = await tx.campaign.findFirst({ where: { id, organizationId, organization: { status: 'ACTIVE' } } });
      const now = clock();
      if (!campaign || campaign.status !== 'SCHEDULED' || !campaign.startsAt || campaign.startsAt > now) return false;
      const expired = !!campaign.endsAt && campaign.endsAt <= now;
      const target = expired ? CampaignStatus.PAUSED : CampaignStatus.ACTIVE;
      await tx.campaign.update({ where: { id }, data: { status: target } });
      await this.audit(tx, organizationId, null, 'campaign.schedule.processed', id, {
        from: 'SCHEDULED', to: target, reason: expired ? 'scheduled_window_expired' : 'scheduled_start_reached',
      });
      return true;
    });
  }

  async create(organizationId: string, userId: string, dto: CreateCampaignDto) {
    return serializable(this.prisma, async tx => {
      await this.assertWriter(tx, organizationId, userId);
      const base = this.slugify(dto.name) || 'campaign';
      const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

      const campaign = await tx.campaign.create({
        data: {
          organizationId,
          name: dto.name,
          slug,
          title: dto.title,
          subtitle: dto.subtitle,
          description: dto.description,
          maxParticipants: dto.maxParticipants,
          rules: { create: {} },
        },
        include: { rules: true, rewards: true },
      });

      await this.audit(tx, organizationId, userId, 'campaign.create', campaign.id);
      return campaign;
    });
  }

  list(organizationId: string) {
    return this.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        rules: true,
        rewards: true,
        _count: { select: { participants: true, referrals: true } },
      },
    });
  }

  get(organizationId: string, id: string) {
    return this.readCampaign(this.prisma, organizationId, id);
  }

  private async readCampaign(tx: Prisma.TransactionClient, organizationId: string, id: string) {
    const campaign = await tx.campaign.findFirst({
      where: { id, organizationId },
      include: {
        rules: true,
        rewards: { orderBy: [{ positionStart: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { participants: true, referrals: true } },
      },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateCampaignDto,
  ) {
    return serializable(this.prisma, async tx => {
      await this.assertWriter(tx, organizationId, userId);
      await this.lockCampaign(tx, organizationId, id);
      const current = await this.readCampaign(tx, organizationId, id);

      if (this.isClosedStatus(current.status)) {
        throw new BadRequestException('Campanhas finalizadas ou canceladas não podem ser editadas.');
      }

      const startsAt = dto.startsAt ? new Date(dto.startsAt) : undefined;
      const endsAt = dto.endsAt ? new Date(dto.endsAt) : undefined;

      const effectiveStart = startsAt ?? current.startsAt;
      const effectiveEnd = endsAt ?? current.endsAt;
      if (current.status === CampaignStatus.SCHEDULED && (!effectiveStart || effectiveStart <= new Date())) {
        throw new BadRequestException("Campanha agendada exige início futuro. Desfaça o agendamento para editar após o início previsto.");
      }

      if (effectiveStart && effectiveEnd && effectiveEnd <= effectiveStart) {
        throw new BadRequestException('A data de término deve ser posterior à data de início.');
      }

      const updated = await tx.campaign.update({
        where: { id },
        data: {
          name: dto.name,
          title: dto.title,
          subtitle: dto.subtitle,
          description: dto.description,
          startsAt,
          endsAt,
          timezone: dto.timezone,
          referralCodePrefix: dto.referralCodePrefix?.toUpperCase(),
          maxParticipants: dto.maxParticipants,
        },
        include: {
          rules: true,
          rewards: true,
          _count: { select: { participants: true, referrals: true } },
        },
      });

      await this.audit(tx, organizationId, userId, 'campaign.update', id);
      return updated;
    });
  }

  async changeStatus(
    organizationId: string,
    userId: string,
    id: string,
    target: CampaignStatus,
  ) {
    return serializable(this.prisma, async tx => {
      await this.assertWriter(tx, organizationId, userId);
      await this.lockCampaign(tx, organizationId, id);
      const campaign = await this.readCampaign(tx, organizationId, id);

      const allowed: Record<CampaignStatus, CampaignStatus[]> = {
        DRAFT: [CampaignStatus.ACTIVE, CampaignStatus.SCHEDULED, CampaignStatus.CANCELLED],
        SCHEDULED: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED, CampaignStatus.CANCELLED],
        ACTIVE: [CampaignStatus.PAUSED, CampaignStatus.FINISHED, CampaignStatus.CANCELLED],
        PAUSED: [CampaignStatus.ACTIVE, CampaignStatus.SCHEDULED, CampaignStatus.FINISHED, CampaignStatus.CANCELLED],
        FINISHED: [],
        CANCELLED: [],
      };

      if (!allowed[campaign.status].includes(target)) {
        throw new BadRequestException(
          `Transição de campanha não permitida: ${campaign.status} -> ${target}`,
        );
      }

      if (target === CampaignStatus.SCHEDULED) {
        if (!campaign.startsAt || campaign.startsAt <= new Date()) throw new BadRequestException("Salve uma data de início futura antes de agendar.");
        if (campaign.endsAt && campaign.endsAt <= campaign.startsAt) throw new BadRequestException("O término deve ser posterior ao início.");
      }

      if (target === CampaignStatus.ACTIVE) {
        if (campaign.endsAt && campaign.endsAt <= new Date()) {
          throw new BadRequestException('A data de término da campanha já passou.');
        }
      }

      const updated = await tx.campaign.update({
        where: { id },
        data: { status: target },
        include: {
          rules: true,
          rewards: true,
          _count: { select: { participants: true, referrals: true } },
        },
      });

      await this.audit(tx, 
        organizationId,
        userId,
        `campaign.status.${target.toLowerCase()}`,
        id,
        { from: campaign.status, to: target },
      );

      return updated;
    });
  }

  async updateRules(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateRulesDto,
  ) {
    return serializable(this.prisma, async tx => {
      await this.assertWriter(tx, organizationId, userId);
      await this.lockCampaign(tx, organizationId, id);
      const campaign = await this.readCampaign(tx, organizationId, id);

      if (this.isClosedStatus(campaign.status)) {
        throw new BadRequestException('As regras não podem ser alteradas após o encerramento.');
      }

      const rules = await tx.campaignRule.upsert({
        where: { campaignId: id },
        create: { campaignId: id, ...dto },
        update: dto,
      });

      await this.audit(tx, organizationId, userId, 'campaign.rules.update', id);
      return rules;
    });
  }

  async addReward(
    organizationId: string,
    userId: string,
    id: string,
    dto: CreateRewardDto,
  ) {
    return serializable(this.prisma, async tx => {
      await this.assertWriter(tx, organizationId, userId);
      await this.lockCampaign(tx, organizationId, id);
      const campaign = await this.readCampaign(tx, organizationId, id);

      if (this.isClosedStatus(campaign.status)) {
        throw new BadRequestException('Os prêmios não podem ser alterados após o encerramento.');
      }

      if (
        dto.positionStart &&
        dto.positionEnd &&
        dto.positionEnd < dto.positionStart
      ) {
        throw new BadRequestException('positionEnd must be >= positionStart');
      }

      const reward = await tx.campaignReward.create({
        data: {
          campaignId: id,
          positionStart: dto.positionStart,
          positionEnd: dto.positionEnd,
          rewardType: dto.rewardType.toLowerCase(),
          title: dto.title,
          monetaryValue:
            dto.monetaryValue !== undefined
              ? new Prisma.Decimal(dto.monetaryValue)
              : undefined,
          description: dto.description,
        },
      });

      await this.audit(tx, organizationId, userId, 'campaign.reward.create', id, {
        rewardId: reward.id,
      });

      return reward;
    });
  }

  async deleteReward(
    organizationId: string,
    userId: string,
    campaignId: string,
    rewardId: string,
  ) {
    return serializable(this.prisma, async tx => {
      await this.assertWriter(tx, organizationId, userId);
      await this.lockCampaign(tx, organizationId, campaignId);
      const campaign = await this.readCampaign(tx, organizationId, campaignId);

      if (this.isClosedStatus(campaign.status)) {
        throw new BadRequestException('Os prêmios não podem ser alterados após o encerramento.');
      }

      const reward = await tx.campaignReward.findFirst({
        where: { id: rewardId, campaignId },
      });

      if (!reward) throw new NotFoundException('Reward not found');

      await tx.campaignReward.delete({ where: { id: rewardId } });
      await this.audit(tx, organizationId, userId, 'campaign.reward.delete', campaignId, {
        rewardId,
      });

      return { ok: true };
    });
  }

  async duplicate(organizationId: string, userId: string, id: string) {
    return serializable(this.prisma, async tx => {
      await this.assertWriter(tx, organizationId, userId);
      await this.lockCampaign(tx, organizationId, id);
      const source = await this.readCampaign(tx, organizationId, id);

      const base = this.slugify(`${source.name}-copia`) || 'campaign-copy';
      const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

      const copy = await tx.campaign.create({
        data: {
          organizationId,
          name: `${source.name} - Cópia`,
          slug,
          title: source.title,
          subtitle: source.subtitle,
          description: source.description,
          status: CampaignStatus.DRAFT,
          timezone: source.timezone,
          referralCodePrefix: source.referralCodePrefix,
          maxParticipants: source.maxParticipants,
          rules: source.rules
            ? {
                create: {
                  referralRequiresRegistration:
                    source.rules.referralRequiresRegistration,
                  allowSelfReferral: source.rules.allowSelfReferral,
                  minValidityHours: source.rules.minValidityHours,
                  requiresManualApproval: source.rules.requiresManualApproval,
                  maxReferralsPerParticipant:
                    source.rules.maxReferralsPerParticipant,
                  requireUniquePhone: source.rules.requireUniquePhone,
                  requireUniqueEmail: source.rules.requireUniqueEmail,
                },
              }
            : { create: {} },
          rewards: {
            create: source.rewards.map((reward) => ({
              positionStart: reward.positionStart,
              positionEnd: reward.positionEnd,
              rewardType: reward.rewardType,
              title: reward.title,
              monetaryValue: reward.monetaryValue,
              description: reward.description,
            })),
          },
        },
        include: { rules: true, rewards: true },
      });

      await this.audit(tx, organizationId, userId, 'campaign.duplicate', copy.id, {
        sourceCampaignId: source.id,
      });

      return copy;
    });
  }

  async participants(organizationId: string, campaignId: string) {
    await this.get(organizationId, campaignId);

    return this.prisma.participant.findMany({
      where: { organizationId, campaignId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        referralCode: true,
        status: true,
        registeredAt: true,
        validatedAt: true,
        _count: {
          select: { referralsMade: { where: { status: 'VALID' } } },
        },
      },
    });
  }

  async referrals(organizationId: string, campaignId: string) {
    await this.get(organizationId, campaignId);

    return this.prisma.referral.findMany({
      where: { organizationId, campaignId },
      orderBy: { createdAt: 'desc' },
      include: {
        referrer: { select: { id: true, name: true, referralCode: true } },
        referred: { select: { id: true, name: true } },
      },
    });
  }
  async clicks(organizationId: string, campaignId: string) {
    await this.get(organizationId, campaignId);
    const groups = await this.prisma.referralClick.groupBy({ by: ['participantId'], where: { organizationId, campaignId }, _count: { _all: true } });
    return { total: groups.reduce((sum, g) => sum + g._count._all, 0),
      participants: groups.map(g => ({ participantId: g.participantId, clicks: g._count._all })) };
  }
}
