'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ClubWordmark } from '@/components/brand/club-mark';
import { cn } from '@/lib/cn';

/**
 * Shell do atleta (§15.4).
 *
 * Mobile-first de verdade: navegação inferior fixa, porque a maioria das
 * confirmações acontece pelo celular. No desktop a mesma navegação sobe para o
 * cabeçalho, em vez de deixar uma barra flutuando no rodapé de uma tela larga.
 */

const NAV = [
  { href: '/app', label: 'Início', icon: '🏠' },
  { href: '/app/agenda', label: 'Agenda', icon: '📅' },
  { href: '/app/times', label: 'Times', icon: '🏐' },
  { href: '/app/perfil', label: 'Perfil', icon: '👤' },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AthleteShell({
  children,
  isAdmin,
  unreadCount,
  signOut,
}: {
  children: ReactNode;
  isAdmin: boolean;
  unreadCount: number;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh">
      <header className="border-cva-border bg-cva-navy-950 sticky top-0 z-20 border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <ClubWordmark size="sm" onDark />

          <div className="flex items-center gap-1">
            {/* Navegação no topo apenas no desktop. */}
            <nav aria-label="Navegação" className="hidden items-center gap-0.5 sm:flex">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm transition-colors',
                      active
                        ? 'bg-white/10 font-semibold text-white'
                        : 'text-cva-blue-100 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <Link
              href="/app/avisos"
              className="text-cva-blue-100 relative rounded-md px-3 py-1.5 text-sm hover:bg-white/5 hover:text-white"
            >
              Avisos
              {unreadCount > 0 ? (
                <>
                  {/* Número e rótulo: o contador não depende só do ponto colorido. */}
                  <span
                    aria-hidden="true"
                    className="bg-cva-gold-500 text-cva-navy-950 absolute -top-0.5 right-0.5 min-w-4 rounded-full px-1 text-[10px] leading-4 font-bold"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                  <span className="sr-only">
                    {unreadCount} {unreadCount === 1 ? 'aviso não lido' : 'avisos não lidos'}
                  </span>
                </>
              ) : null}
            </Link>

            {isAdmin ? (
              <Link
                href="/admin"
                className="text-cva-gold-500 rounded-md px-3 py-1.5 text-sm hover:bg-white/5"
              >
                Administração
              </Link>
            ) : null}

            <form action={signOut}>
              <button
                type="submit"
                className="text-cva-blue-100 rounded-md px-3 py-1.5 text-sm hover:bg-white/5 hover:text-white"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* `pb-24` reserva o espaço da barra inferior no mobile. */}
      <main className="mx-auto max-w-5xl px-4 pt-5 pb-24 sm:px-6 sm:pb-10">{children}</main>

      <nav
        aria-label="Navegação principal"
        className="border-cva-border bg-cva-panel fixed inset-x-0 bottom-0 z-20 border-t sm:hidden"
      >
        <ul className="mx-auto flex max-w-lg">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    // Altura de 56px + pb-safe: área de toque confortável (§21).
                    'flex h-14 flex-col items-center justify-center gap-0.5 text-xs transition-colors',
                    active ? 'text-cva-navy-900 font-semibold' : 'text-cva-text-muted',
                  )}
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {item.icon}
                  </span>
                  {item.label}
                  {/* Sublinhado dourado: o item ativo não depende só da cor do texto. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 h-0.5 w-6 rounded-full',
                      active ? 'bg-cva-gold-500' : 'bg-transparent',
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
