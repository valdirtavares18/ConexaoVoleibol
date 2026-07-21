import type { Metadata, Viewport } from 'next';
import { ConnectionStatus } from '@/components/layout/connection-status';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CVA Gestão',
    template: '%s · CVA Gestão',
  },
  description:
    'Sistema de gestão do Conexão Voleibol Alegrete: atletas, presenças, times, rodízio e caixa do grupo.',
  applicationName: 'CVA Gestão',
  icons: {
    icon: '/brand/favicon.svg',
    apple: '/brand/app-icon.png',
  },
  // Sistema interno do clube: nunca deve aparecer em busca.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0c1b3d',
  width: 'device-width',
  initialScale: 1,
  // Não travar o zoom: bloquear pinch-to-zoom prejudica acessibilidade.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">
        {children}
        <ConnectionStatus />
      </body>
    </html>
  );
}
