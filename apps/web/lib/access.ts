import { redirect } from 'next/navigation';
import { serverApi } from './api';

export async function currentAccess(): Promise<{ role: string; canManage: boolean }> {
  const response = await serverApi('/auth/me');
  if (response.status === 401 || response.status === 403) redirect('/login?access=expired');
  if (!response.ok) throw new Error('Não foi possível consultar suas permissões. Tente novamente.');
  return response.json();
}
