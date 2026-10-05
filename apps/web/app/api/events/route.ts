import { NextResponse } from 'next/server';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    if (!origin || new URL(origin).host !== host) return NextResponse.json({ message: 'Origem inválida.' }, { status: 403 });
    const body = await request.text();
    if (body.length > 2000) return NextResponse.json({ message: 'Evento inválido.' }, { status: 413 });
    const response = await fetch(`${process.env.API_INTERNAL_URL || 'http://api:3000/api/v1'}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch { return NextResponse.json({ message: 'Registro temporariamente indisponível.' }, { status: 503 }); }
}
