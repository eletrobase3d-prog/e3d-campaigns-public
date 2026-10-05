import './globals.css';
import { ActionFeedback } from '../components/ActionFeedback';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'E3D Campaigns',
  description: 'Painel administrativo do E3D Campaigns',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}<footer style={{ textAlign: 'center', padding: 16, color: '#94a3b8', fontSize: 12 }}>E3D Campaigns · Versão 3I</footer><ActionFeedback /></body></html>;
}

