import { TrackingModule } from './tracking/tracking.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ParticipantsModule } from './participants/participants.module';
import { RankingModule } from './ranking/ranking.module';
import { PublicModule } from './public/public.module';
import { ReferralsModule } from './referrals/referrals.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    CampaignsModule,
    ParticipantsModule,
    RankingModule,
    PublicModule,
    TrackingModule,
    ReferralsModule,
  ],
})
export class AppModule {}
