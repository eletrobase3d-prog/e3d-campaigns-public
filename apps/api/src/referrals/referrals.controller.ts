import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ReferralsService } from './referrals.service';
import { ReviewReferralDto } from './dto/review-referral.dto';
import { ReopenReferralDto } from './dto/reopen-referral.dto';
@Controller('campaigns/:campaignId/referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Post(':id/reopen')
  reopen(@CurrentUser() user: CurrentUserPayload, @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReopenReferralDto) {
    return this.referrals.reopen(user, campaignId, id, dto);
  }
  @Get(':id/history')
  history(@CurrentUser() user: CurrentUserPayload, @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('id', ParseUUIDPipe) id: string) {
    return this.referrals.history(user, campaignId, id);
  }
  @Post(':id/review')
  review(@CurrentUser() user: CurrentUserPayload, @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewReferralDto) {
    return this.referrals.review(user, campaignId, id, dto);
  }
}
