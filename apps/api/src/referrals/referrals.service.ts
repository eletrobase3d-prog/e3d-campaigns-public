import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ReferralStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { serializable } from '../common/serializable';
import { sameContact, validityDeadline } from './referral-policy';
import { ReviewReferralDto } from './dto/review-referral.dto';
import { ReopenReferralDto } from './dto/reopen-referral.dto';

@Injectable()
export class ReferralsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReferralsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  constructor(private readonly prisma: PrismaService) {}
  onApplicationBootstrap() {
    if (process.env.REFERRAL_WORKER_ENABLED === 'false') return;
    const tick = () => {
      if (this.running) return;
      this.running = this.processDue().then(() => undefined)
        .catch(() => this.logger.error('Falha no processamento de indicações; nova tentativa no próximo ciclo.'))
        .finally(() => { this.running = undefined; });
    };
    this.timer = setInterval(tick, 30000);
    this.timer.unref();
    tick();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  async processDue() {
    const pending = await this.prisma.referral.findMany({ where: {
      status: ReferralStatus.PENDING, manualReviewRequired: false, eligibleAt: { lte: new Date() },
      campaign: { status: { in: ['ACTIVE', 'PAUSED', 'FINISHED'] }, organization: { status: 'ACTIVE' },
        OR: [{ rules: { is: { requiresManualApproval: false } } }, { rules: { is: null } }] },
    }, orderBy: [{ eligibleAt: 'asc' }, { id: 'asc' }], take: 100, select: { id: true, campaignId: true, organizationId: true } });
    let changed = 0;
    for (const item of pending) {
      try {
        const result = await this.decide(item.organizationId, item.campaignId, item.id);
        if (result.changed) changed++;
      } catch { this.logger.warn('Uma indicação não foi processada; será tentada novamente.'); }
    }
    return { changed };
  }
  async review(user: CurrentUserPayload, campaignId: string, id: string, dto: ReviewReferralDto) {
    if (dto.reason.trim().length < 3) throw new BadRequestException('Informe um motivo com pelo menos 3 caracteres.');
    return this.decide(user.organizationId, campaignId, id, { user, dto });
  }

  async reopen(user: CurrentUserPayload, campaignId: string, id: string, dto: ReopenReferralDto) {
    const reason = dto.reason.trim();
    if (reason.length < 3) throw new BadRequestException('Informe uma justificativa com pelo menos 3 caracteres.');
    return serializable(this.prisma, async tx => {
      const organizationId = user.organizationId;
      const membership = await tx.organizationUser.findFirst({ where: { organizationId, userId: user.sub,
        role: { in: ['OWNER', 'ADMIN', 'MANAGER'] }, user: { status: 'ACTIVE' }, organization: { status: 'ACTIVE' } } });
      if (!membership) throw new ForbiddenException('Sem permissão para reavaliar indicações.');
      const referral = await tx.referral.findFirst({ where: { id, campaignId, organizationId },
        include: { campaign: { include: { rules: true } } } });
      if (!referral) throw new NotFoundException('Indicação não encontrada.');
      if (dto.expectedVersion !== referral.reviewVersion) throw new ConflictException('A indicação foi alterada. Atualize os resultados antes de continuar.');
      if (referral.status !== ReferralStatus.INVALID) throw new BadRequestException('Somente indicações inválidas podem ser reabertas.');
      if (!['ACTIVE', 'PAUSED', 'FINISHED'].includes(referral.campaign.status)) throw new BadRequestException('A campanha não permite reavaliação neste estado.');
      const limit = referral.campaign.rules?.maxReferralsPerParticipant;
      if (limit) {
        const reserved = await tx.referral.count({ where: { campaignId, referrerParticipantId: referral.referrerParticipantId,
          status: { in: [ReferralStatus.PENDING, ReferralStatus.VALID] } } });
        if (reserved >= limit) throw new BadRequestException('Limite de indicações atingido. Não há vaga para reabrir esta indicação.');
      }
      // Legacy records predating eligibleAt use their creation and the current delay.
      const eligibleAt = referral.eligibleAt ?? validityDeadline(referral.createdAt, referral.campaign.rules?.minValidityHours ?? 0);
      const updated = await tx.referral.update({ where: { id }, data: {
        status: ReferralStatus.PENDING, manualReviewRequired: true, reviewVersion: { increment: 1 }, eligibleAt,
        validatedAt: null, rejectedAt: null, rejectionReason: null,
      } });
      await tx.auditLog.create({ data: { organizationId, userId: user.sub, action: 'referral.reopen', entityType: 'referral', entityId: id,
        metadata: { from: referral.status, to: 'PENDING', reason, previousRejectionReason: referral.rejectionReason,
          previousRejectedAt: referral.rejectedAt?.toISOString() ?? null, version: updated.reviewVersion } } });
      return { changed: true, referral: updated };
    });
  }

  async history(user: CurrentUserPayload, campaignId: string, id: string) {
    const organizationId = user.organizationId;
    const membership = await this.prisma.organizationUser.findFirst({ where: { organizationId, userId: user.sub,
      user: { status: 'ACTIVE' }, organization: { status: 'ACTIVE' } } });
    if (!membership) throw new ForbiddenException('Sem permissão para consultar o histórico.');
    const referral = await this.prisma.referral.findFirst({ where: { id, campaignId, organizationId }, select: { id: true } });
    if (!referral) throw new NotFoundException('Indicação não encontrada.');
    const events = await this.prisma.auditLog.findMany({ where: { organizationId, entityType: 'referral', entityId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
      select: { id: true, action: true, userId: true, createdAt: true, metadata: true } });
    const authors = await this.prisma.user.findMany({ where: { id: { in: events.flatMap(e => e.userId ? [e.userId] : []) } }, select: { id: true, name: true } });
    return events.map(event => ({ ...event, actor: event.userId ? authors.find(a => a.id === event.userId)?.name ?? 'Usuário indisponível' : 'Sistema' }));
  }
  private async decide(organizationId: string, campaignId: string, id: string,
    manual?: { user: CurrentUserPayload; dto: ReviewReferralDto }) {
    return serializable(this.prisma, async tx => {
      if (manual) {
        const membership = await tx.organizationUser.findFirst({ where: { organizationId, userId: manual.user.sub,
          role: { in: ['OWNER', 'ADMIN', 'MANAGER'] }, user: { status: 'ACTIVE' }, organization: { status: 'ACTIVE' } } });
        if (!membership) throw new ForbiddenException('Sem permissão para revisar indicações.');
      }
      const referral = await tx.referral.findFirst({ where: { id, campaignId, organizationId },
        include: { referrer: true, referred: true, campaign: { include: { rules: true, organization: true } } } });
      if (!referral) throw new NotFoundException('Indicação não encontrada.');
      if (manual && ((manual.dto.expectedVersion !== undefined && manual.dto.expectedVersion !== referral.reviewVersion) ||
        (referral.manualReviewRequired && manual.dto.expectedVersion === undefined)))
        throw new ConflictException('A indicação foi alterada. Atualize os resultados antes de continuar.');
      if (manual && referral.status === manual.dto.status) return { changed: false, referral };
      if (!manual && (referral.status !== ReferralStatus.PENDING || referral.manualReviewRequired)) return { changed: false, referral };
      if (manual && referral.status !== ReferralStatus.PENDING && referral.status !== ReferralStatus.VALID)
        throw new BadRequestException('Indicação encerrada. Use Reavaliar para reabrir uma indicação inválida.');
      const campaign = referral.campaign;
      const closedForValidation = !['ACTIVE', 'PAUSED', 'FINISHED'].includes(campaign.status) || campaign.organization.status !== 'ACTIVE';
      let target: ReferralStatus = manual?.dto.status ?? ReferralStatus.VALID;
      let reason = manual?.dto.reason.trim() ?? 'Validação automática após o prazo mínimo.';
      const now = new Date();
      if (target === ReferralStatus.VALID) {
        if (closedForValidation || !referral.eligibleAt || referral.eligibleAt > now || (!manual && campaign.rules?.requiresManualApproval)) {
          if (manual) throw new BadRequestException('Indicação ainda não elegível para validação.');
          return { changed: false, referral };
        }
        let invalid: string | undefined;
        if (referral.referrer.status !== 'ACTIVE' || !referral.referred || referral.referred.status !== 'ACTIVE') invalid = 'Participante ausente ou inativo.';
        else if (referral.referrer.campaignId !== campaignId || referral.referred.campaignId !== campaignId ||
          referral.referrer.organizationId !== organizationId || referral.referred.organizationId !== organizationId) invalid = 'Vínculo de campanha ou organização inválido.';
        else if (!campaign.rules?.allowSelfReferral && (referral.referrerParticipantId === referral.referredParticipantId || sameContact(referral.referrer, referral.referred))) invalid = 'Autoindicação não permitida.';
        if (!invalid && campaign.rules?.maxReferralsPerParticipant) {
          const valid = await tx.referral.count({ where: { campaignId, referrerParticipantId: referral.referrerParticipantId, status: ReferralStatus.VALID, id: { not: id } } });
          if (valid >= campaign.rules.maxReferralsPerParticipant) invalid = 'Limite de indicações válidas atingido.';
        }
        if (invalid) {
          if (manual) throw new BadRequestException(invalid);
          target = ReferralStatus.INVALID;
          reason = invalid;
        }
      }
      const updated = await tx.referral.updateMany({ where: { id, organizationId, campaignId, status: referral.status }, data: {
        status: target, reviewVersion: { increment: 1 }, validatedAt: target === ReferralStatus.VALID ? now : null,
        rejectedAt: target === ReferralStatus.VALID ? null : now, rejectionReason: target === ReferralStatus.VALID ? null : reason,
      } });
      if (!updated.count) return { changed: false, referral };
      await tx.auditLog.create({ data: { organizationId, userId: manual?.user.sub, entityType: 'referral', entityId: id,
        action: manual ? 'referral.review.manual' : 'referral.review.automatic', metadata: { from: referral.status, to: target, reason, version: referral.reviewVersion + 1 } } });
      return { changed: true, referral: await tx.referral.findUniqueOrThrow({ where: { id } }) };
    });
  }
}
