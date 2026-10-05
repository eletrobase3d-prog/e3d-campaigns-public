import { cookies } from 'next/headers';
const apiBase = process.env.API_INTERNAL_URL || 'http://api:3000/api/v1';
async function token() { return (await cookies()).get('e3d_token')?.value; }

import { NextResponse } from 'next/server';

const allowed = new Set(['schedule', 'activate', 'pause', 'finish', 'cancel', 'duplicate']);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  if (!allowed.has(action)) {
    return NextResponse.json({ message: 'Ação inválida' }, { status: 400 });
  }

  const jwt = await token();
  if (!jwt) return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });

  const response = await fetch(`${apiBase}/campaigns/${id}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
