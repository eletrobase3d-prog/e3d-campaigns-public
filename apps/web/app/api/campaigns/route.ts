import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
const apiBase = process.env.API_INTERNAL_URL || 'http://api:3000/api/v1';

export async function POST(request: Request) {
  const token = (await cookies()).get('e3d_token')?.value;
  if (!token) return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });

  const response = await fetch(`${apiBase}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: await request.text(),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
