import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';
import { TrackingService } from './tracking.service';
export class ClickEventDto {
  @IsIn(['referral_click']) type!: string;
  @IsUUID() eventId!: string;
  @IsString() @MaxLength(1000) ticket!: string;
}
@Controller('events')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}
  @Post()
  record(@Body() dto: ClickEventDto) { return this.tracking.record(dto.eventId, dto.ticket); }
}
