import { cookies } from 'next/headers';

export const apiBase = process.env.API_INTERNAL_URL || 'http://api:3000/api/v1';

export async function serverApi(path: string, init: RequestInit = {}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('e3d_token')?.value;
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}
