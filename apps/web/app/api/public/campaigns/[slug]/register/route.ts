import { NextResponse } from 'next/server';

const apiBase =
  process.env.API_INTERNAL_URL || 'http://api:3000/api/v1';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const response = await fetch(
    `${apiBase}/public/campaigns/${encodeURIComponent(slug)}/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await request.text(),
      cache: 'no-store',
    },
  );

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
