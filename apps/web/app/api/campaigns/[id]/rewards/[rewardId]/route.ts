import { cookies } from 'next/headers';
const apiBase = process.env.API_INTERNAL_URL || 'http://api:3000/api/v1';
async function token() { return (await cookies()).get('e3d_token')?.value; }

import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; rewardId: string }> },
) {
  const { id, rewardId } = await params;
  const jwt = await token();
  if (!jwt) return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });

  const response = await fetch(`${apiBase}/campaigns/${id}/rewards/${rewardId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
