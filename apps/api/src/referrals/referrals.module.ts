import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
@Module({ imports: [JwtModule.register({})], controllers: [ReferralsController], providers: [ReferralsService, JwtAuthGuard] })
export class ReferralsModule {}
