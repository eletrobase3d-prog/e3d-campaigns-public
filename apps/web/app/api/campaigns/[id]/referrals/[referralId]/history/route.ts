import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; referralId: string }> }) {
  const jwt = (await cookies()).get('e3d_token')?.value;
  if (!jwt) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 });
  const { id, referralId } = await params;
  try {
    const response = await fetch(`${process.env.API_INTERNAL_URL || 'http://api:3000/api/v1'}/campaigns/${encodeURIComponent(id)}/referrals/${encodeURIComponent(referralId)}/history`, {
      headers: { Authorization: `Bearer ${jwt}` }, cache: 'no-store',
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ message: 'Não foi possível acessar a API.' }, { status: 502 }); }
}
