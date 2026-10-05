import { NextResponse } from 'next/server';
const apiBase = process.env.API_INTERNAL_URL || 'http://api:3000/api/v1';

export async function POST(request: Request) {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json(data, { status: response.status });

  const nextResponse = NextResponse.json({ ok: true });
  nextResponse.cookies.set('e3d_token', data.accessToken, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
  });
  return nextResponse;
}
