import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const publicKey = (id: string) => `~${id}`;

// '~' is outside the alphabet of generated legacy slugs and referral codes.
export function canonicalId(key: string): string | undefined {
  if (!key.startsWith('~')) return undefined;
  const id = key.slice(1);
  if (!uuid.test(id)) throw new NotFoundException('Link indisponível.');
  return id;
}

export async function resolveCampaign(db: Prisma.TransactionClient, key: string) {
  if (key.length > 160) throw new NotFoundException('Campanha não encontrada.');
  const id = canonicalId(key);
  const rows = await db.campaign.findMany({ where: id ? { id } : { slug: key }, take: 2, include: { organization: { select: { status: true } } } });
  if (rows.length > 1) throw new ConflictException('Link antigo ambíguo. Solicite o link atualizado da campanha.');
  if (!rows.length || rows[0].organization.status !== 'ACTIVE') throw new NotFoundException('Campanha não encontrada.');
  return rows[0];
}

export async function resolveParticipant(db: Prisma.TransactionClient, key: string) {
  if (key.length > 80) throw new NotFoundException('Indicação não encontrada.');
  const id = canonicalId(key);
  const rows = await db.participant.findMany({ where: id ? { id } : { referralCode: key.trim().toUpperCase() }, take: 2,
    include: { campaign: true, organization: { select: { status: true } } } });
  if (rows.length > 1) throw new ConflictException('Link antigo ambíguo. Solicite o link atualizado da indicação.');
  const p = rows[0];
  if (!p || p.status !== 'ACTIVE' || p.organization.status !== 'ACTIVE' || p.organizationId !== p.campaign.organizationId)
    throw new NotFoundException('Indicação não encontrada.');
  return p;
}
