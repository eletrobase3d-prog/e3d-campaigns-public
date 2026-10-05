import { cookies } from 'next/headers';
const apiBase = process.env.API_INTERNAL_URL || 'http://api:3000/api/v1';
async function token() { return (await cookies()).get('e3d_token')?.value; }

import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const jwt = await token();
  if (!jwt) return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });

  const response = await fetch(`${apiBase}/campaigns/${id}/rewards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: await request.text(),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
