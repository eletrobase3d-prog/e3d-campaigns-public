import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string; referralId: string }> }) {
  // Session cookies must not authorize cross-origin review requests.
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (origin && new URL(origin).host !== host) return NextResponse.json({ message: 'Origem não permitida.' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ message: 'JSON obrigatório.' }, { status: 415 });
  const jwt = (await cookies()).get('e3d_token')?.value;
  if (!jwt) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 });
  const { id, referralId } = await params;
  try {
    const response = await fetch(`${process.env.API_INTERNAL_URL || 'http://api:3000/api/v1'}/campaigns/${encodeURIComponent(id)}/referrals/${encodeURIComponent(referralId)}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: await request.text(), cache: 'no-store',
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ message: 'Não foi possível acessar a API.' }, { status: 502 }); }
}
