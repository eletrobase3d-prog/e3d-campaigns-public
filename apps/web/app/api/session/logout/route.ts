import { NextResponse } from 'next/server';
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('e3d_token', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
