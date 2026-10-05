import { Controller, Get, Param } from '@nestjs/common';
import { RankingService } from './ranking.service';

@Controller('public/campaigns')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get(':slug/ranking')
  get(@Param('slug') slug: string) {
    return this.ranking.publicRanking(slug);
  }
}
