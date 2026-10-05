import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignsService } from './campaigns.service';

@Injectable()
export class CampaignScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CampaignScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<unknown>;
  constructor(private readonly prisma: PrismaService, private readonly campaigns: CampaignsService) {}

  onApplicationBootstrap() {
    if (process.env.CAMPAIGN_WORKER_ENABLED === 'false') return;
    const tick = () => { void this.processDue().catch(() => this.logger.error('Falha no agendamento; nova tentativa no próximo ciclo.')); };
    this.timer = setInterval(tick, 30000);
    this.timer.unref();
    tick();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  processDue(clock: () => Date = () => new Date()): Promise<unknown> {
    if (this.running) return this.running;
    this.running = this.batch(clock).finally(() => { this.running = undefined; });
    return this.running;
  }
  private async batch(clock: () => Date) {
    const due = await this.prisma.campaign.findMany({ where: {
      status: 'SCHEDULED', startsAt: { lte: clock() }, organization: { status: 'ACTIVE' },
    }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], take: 100, select: { id: true, organizationId: true } });
    let changed = 0;
    for (const item of due) {
      try { if (await this.campaigns.processScheduledCampaign(item.organizationId, item.id, clock)) changed++; }
      catch { this.logger.warn('Uma campanha agendada não foi processada; será tentada novamente.'); }
    }
    return { changed };
  }
}
