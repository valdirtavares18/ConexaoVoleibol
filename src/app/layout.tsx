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
    // Três tamanhos: o navegador escolhe conforme a densidade da tela. Abaixo
    // de 32 px o brasão vira mancha, por isso o 16 é gerado separado, sem a
    // área de respiro que os tamanhos maiores têm.
    icon: [
      { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: '/brand/app-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'CVA Gestão',
    locale: 'pt_BR',
    images: [{ url: '/brand/og-image.png', width: 1200, height: 630 }],
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
