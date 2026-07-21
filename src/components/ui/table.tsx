import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Tabela de dados.
 *
 * §15.3 pede tabelas bem desenhadas para listagem, em vez de grades de cards.
 * Duas decisões que sustentam isso:
 *
 *  - o wrapper tem `overflow-x-auto` próprio, então uma tabela larga rola dentro
 *    de si e **a página nunca rola na horizontal**;
 *  - o cabeçalho é `sticky`, para não perder o contexto ao rolar uma lista de
 *    18 atletas no celular.
 */

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('-mx-px overflow-x-auto', className)}>
      <table className="w-full min-w-[38rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-cva-surface/95 sticky top-0 z-10 backdrop-blur">
      <tr className="border-cva-border border-b">{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  align = 'left',
  className,
  width,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  width?: string;
}) {
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={cn(
        'text-cva-text-muted px-3 py-2.5 text-xs font-semibold tracking-wide uppercase',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-cva-border divide-y">{children}</tbody>;
}

export function TR({
  children,
  className,
  highlighted = false,
}: {
  children: ReactNode;
  className?: string;
  highlighted?: boolean;
}) {
  return (
    <tr
      className={cn(
        'hover:bg-cva-blue-100/35 transition-colors',
        highlighted && 'bg-cva-gold-100/50',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  align = 'left',
  className,
  numeric = false,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  numeric?: boolean;
}) {
  return (
    <td
      {...(numeric ? { 'data-numeric': true } : {})}
      className={cn(
        'text-cva-text px-3 py-2.5',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}
