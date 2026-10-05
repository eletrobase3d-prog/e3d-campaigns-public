import { Controller, Get, Param } from '@nestjs/common';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('campaigns/:slug')
  campaign(@Param('slug') slug: string) {
    return this.publicService.campaign(slug);
  }

  @Get('campaigns/:slug/referrer/:code')
  referrer(@Param('slug') slug: string, @Param('code') code: string) {
    return this.publicService.referrer(slug, code);
  }

  @Get('referrals/:code')
  referral(@Param('code') code: string) {
    return this.publicService.referral(code);
  }
}
