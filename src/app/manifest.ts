import type { MetadataRoute } from 'next';

/**
 * Manifesto PWA.
 *
 * `display: standalone` e `start_url: /app` fazem o atalho abrir direto na tela
 * do atleta, sem barra de endereço — que é como o grupo vai usar no celular.
 *
 * Os ícones apontam para `public/brand/`; enquanto o brasão oficial não for
 * adicionado, a instalação funciona mas o ícone fica em branco (ver
 * `public/brand/README.md`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CVA Gestão — Conexão Voleibol Alegrete',
    short_name: 'CVA Gestão',
    description:
      'Confirme presença, veja os times e acompanhe a agenda do Conexão Voleibol Alegrete.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#071426',
    theme_color: '#0c1b3d',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['sports'],
    icons: [
      { src: '/brand/app-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/app-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Times', short_name: 'Times', url: '/app/times' },
      { name: 'Agenda', short_name: 'Agenda', url: '/app/agenda' },
    ],
  };
}
