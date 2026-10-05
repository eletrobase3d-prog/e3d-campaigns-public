import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { UpdateRulesDto } from './dto/update-rules.dto';
import { CreateRewardDto } from './dto/create-reward.dto';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaigns.create(user.organizationId, user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.campaigns.list(user.organizationId);
  }

  @Get(':id/clicks')
  clicks(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.campaigns.clicks(user.organizationId, id);
  }

  @Get(':id/participants')
  participants(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.campaigns.participants(user.organizationId, id);
  }

  @Get(':id/referrals')
  referrals(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.campaigns.referrals(user.organizationId, id);
  }

  @Put(':id/rules')
  updateRules(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRulesDto,
  ) {
    return this.campaigns.updateRules(user.organizationId, user.sub, id, dto);
  }

  @Post(':id/rewards')
  addReward(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CreateRewardDto,
  ) {
    return this.campaigns.addReward(user.organizationId, user.sub, id, dto);
  }

  @Delete(':id/rewards/:rewardId')
  deleteReward(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('rewardId') rewardId: string,
  ) {
    return this.campaigns.deleteReward(
      user.organizationId,
      user.sub,
      id,
      rewardId,
    );
  }

  @Post(':id/duplicate')
  duplicate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.campaigns.duplicate(user.organizationId, user.sub, id);
  }

  @Post(':id/schedule')
  schedule(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.campaigns.changeStatus(user.organizationId, user.sub, id, CampaignStatus.SCHEDULED);
  }

  @Post(':id/activate')
  activate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.campaigns.changeStatus(
      user.organizationId,
      user.sub,
      id,
      CampaignStatus.ACTIVE,
    );
  }

  @Post(':id/pause')
  pause(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.campaigns.changeStatus(
      user.organizationId,
      user.sub,
      id,
      CampaignStatus.PAUSED,
    );
  }

  @Post(':id/finish')
  finish(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.campaigns.changeStatus(
      user.organizationId,
      user.sub,
      id,
      CampaignStatus.FINISHED,
    );
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.campaigns.changeStatus(
      user.organizationId,
      user.sub,
      id,
      CampaignStatus.CANCELLED,
    );
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaigns.update(user.organizationId, user.sub, id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.campaigns.get(user.organizationId, id);
  }
}
