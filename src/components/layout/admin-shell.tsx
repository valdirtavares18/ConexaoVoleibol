'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ClubWordmark } from '@/components/brand/club-mark';
import { cn } from '@/lib/cn';

/**
 * Shell administrativo (§15.4).
 *
 * Desktop: sidebar discreta e conteúdo amplo — nada de coluna estreita
 * centralizada, porque as telas de admin comparam dados lado a lado.
 * Mobile: a sidebar vira um menu recolhível, já que o uso principal do admin é
 * em desktop.
 */

interface NavItem {
  href: string;
  label: string;
  group: 'operacao' | 'pessoas' | 'gestao';
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Visão geral', group: 'operacao' },
  { href: '/admin/eventos', label: 'Encontros', group: 'operacao' },
  { href: '/admin/historico', label: 'Histórico', group: 'operacao' },
  { href: '/admin/atletas', label: 'Atletas', group: 'pessoas' },
  { href: '/admin/avaliacoes', label: 'Avaliações', group: 'pessoas' },
  { href: '/admin/afinidades', label: 'Afinidades', group: 'pessoas' },
  { href: '/admin/financeiro', label: 'Financeiro', group: 'gestao' },
  { href: '/admin/configuracoes', label: 'Configurações', group: 'gestao' },
  { href: '/admin/auditoria', label: 'Auditoria', group: 'gestao' },
];

const GROUP_LABELS: Record<NavItem['group'], string> = {
  operacao: 'Operação',
  pessoas: 'Pessoas',
  gestao: 'Gestão',
};

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  children,
  userName,
  isAlsoAthlete,
  signOut,
}: {
  children: ReactNode;
  userName: string;
  isAlsoAthlete: boolean;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const groups: NavItem['group'][] = ['operacao', 'pessoas', 'gestao'];

  const nav = (
    <nav aria-label="Navegação administrativa" className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group}>
          <p className="text-cva-blue-100/60 px-3 text-xs font-semibold tracking-wider uppercase">
            {GROUP_LABELS[group]}
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {NAV.filter((item) => item.group === group).map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-white/10 font-semibold text-white'
                        : 'text-cva-blue-100 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {/* Marcador dourado: a página ativa não depende só de cor de texto. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-4 w-0.5 rounded-full',
                        active ? 'bg-cva-gold-500' : 'bg-transparent',
                      )}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Barra superior — só no mobile */}
      <div className="bg-cva-navy-950 flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
        <ClubWordmark size="sm" onDark />
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="admin-nav-mobile"
          className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-white"
        >
          {menuOpen ? 'Fechar' : 'Menu'}
        </button>
      </div>

      {menuOpen ? (
        <div id="admin-nav-mobile" className="bg-cva-navy-950 px-4 pb-5 lg:hidden">
          {nav}
        </div>
      ) : null}

      {/* Sidebar — só no desktop */}
      <aside className="bg-cva-navy-950 relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-5">
        <div className="cva-stripes absolute inset-x-0 top-0 h-40 opacity-40" aria-hidden="true" />

        <div className="relative">
          <div className="px-1 pb-6">
            <ClubWordmark onDark />
          </div>
          {nav}
        </div>

        <div className="relative border-t border-white/10 pt-4">
          <p className="px-3 text-sm font-medium text-white">{userName}</p>
          <p className="text-cva-blue-100/70 px-3 text-xs">
            Administrador{isAlsoAthlete ? ' e atleta' : ''}
          </p>
          <div className="mt-2 flex flex-col gap-0.5">
            {isAlsoAthlete ? (
              <Link
                href="/app"
                className="text-cva-blue-100 rounded-md px-3 py-1.5 text-sm hover:bg-white/5 hover:text-white"
              >
                Ver como atleta
              </Link>
            ) : null}
            <form action={signOut}>
              <button
                type="submit"
                className="text-cva-blue-100 w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-white/5 hover:text-white"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
