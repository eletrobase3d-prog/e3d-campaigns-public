import { Body, Controller, Param, Post } from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { RegisterParticipantDto } from './dto/register-participant.dto';

@Controller('public/campaigns')
export class ParticipantsController {
  constructor(private readonly participants: ParticipantsService) {}

  @Post(':slug/register')
  register(@Param('slug') slug: string, @Body() dto: RegisterParticipantDto) {
    return this.participants.register(slug, dto);
  }
}
