import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
type Ticket = { campaignId: string; participantId: string; exp: number };
function signature(payload: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new ServiceUnavailableException('Registro de cliques indisponível.');
  return createHmac('sha256', secret).update(`referral-click:${payload}`).digest();
}
export function issueClickTicket(campaignId: string, participantId: string) {
  const payload = Buffer.from(JSON.stringify({ campaignId, participantId, exp: Date.now() + 15 * 60 * 1000 })).toString('base64url');
  return `${payload}.${signature(payload).toString('base64url')}`;
}
export function readClickTicket(value: string): Ticket {
  const [payload, signed, extra] = value.split('.');
  if (!payload || !signed || extra) throw new BadRequestException('Evento inválido.');
  const expected = signature(payload), actual = Buffer.from(signed, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new BadRequestException('Evento inválido.');
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.exp !== 'number' || data.exp <= Date.now() || typeof data.campaignId !== 'string' || typeof data.participantId !== 'string') throw new Error();
    return data;
  } catch { throw new BadRequestException('Evento expirado ou inválido.'); }
}
