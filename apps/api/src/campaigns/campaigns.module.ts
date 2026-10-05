import { CampaignScheduler } from './campaign-scheduler';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CampaignsController],
  providers: [CampaignScheduler, CampaignsService, JwtAuthGuard],
})
export class CampaignsModule {}
