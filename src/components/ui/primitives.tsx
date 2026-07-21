import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Primitivas visuais do CVA Gestão.
 *
 * Regra que orienta este arquivo (§15.3): **card é para objeto coerente** — um
 * evento, um time, uma partida, um fechamento. Listagem usa tabela ou linha
 * compacta, nunca uma grade de cartõezinhos iguais. Por isso não existe aqui um
 * componente `StatCard` genérico com ícone e número grande.
 */

// ---------------------------------------------------------------------------

export function Panel({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
}) {
  return (
    <Tag
      className={cn(
        'border-cva-border bg-cva-panel rounded-lg border shadow-[var(--shadow-panel)]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="border-cva-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-cva-navy-900 text-sm font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-cva-text-muted mt-0.5 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PanelBody({
  children,
  className,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return <div className={cn(flush ? '' : 'px-4 py-4 sm:px-5', className)}>{children}</div>;
}

// ---------------------------------------------------------------------------

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-5">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-cva-blue-700 text-xs font-semibold tracking-wider uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-cva-navy-900 mt-1 text-2xl font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-cva-text-muted mt-1 max-w-2xl text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

// ---------------------------------------------------------------------------

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'gold';

const TONES: Record<Tone, string> = {
  neutral: 'bg-cva-surface text-cva-text-muted border-cva-border',
  info: 'bg-cva-info-soft text-cva-info border-cva-info/25',
  success: 'bg-cva-success-soft text-cva-success border-cva-success/25',
  warning: 'bg-cva-warning-soft text-cva-warning border-cva-warning/30',
  danger: 'bg-cva-danger-soft text-cva-danger border-cva-danger/25',
  gold: 'bg-cva-gold-100 text-cva-gold-600 border-cva-gold-500/40',
};

/**
 * Etiqueta de status. Sempre acompanha texto — status **nunca** depende só de
 * cor (§21). O ponto colorido é reforço visual, não a informação em si.
 */
export function Badge({
  children,
  tone = 'neutral',
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
      )}
    >
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------

/**
 * Métrica em linha. Sem ícone decorativo e sem card individual: métricas vivem
 * agrupadas dentro de um painel, separadas por divisores.
 */
export function Metric({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  return (
    <div className="min-w-0 px-4 py-3 sm:px-5">
      <p className="text-cva-text-muted text-xs font-medium tracking-wide uppercase">{label}</p>
      <p
        data-numeric
        className={cn(
          'mt-1 text-xl font-semibold tracking-tight',
          tone === 'positive' && 'text-cva-success',
          tone === 'negative' && 'text-cva-danger',
          tone === 'neutral' && 'text-cva-navy-900',
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-cva-text-muted mt-0.5 text-xs">{hint}</p> : null}
    </div>
  );
}

export function MetricRow({ children }: { children: ReactNode }) {
  return (
    <div className="divide-cva-border grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Estado vazio com as faixas da identidade em baixa intensidade (§15.2). */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-cva-border-strong relative overflow-hidden rounded-lg border border-dashed px-6 py-10 text-center">
      <div className="cva-stripes absolute inset-0 opacity-30" aria-hidden="true" />
      <div className="relative">
        <p className="text-cva-navy-900 text-sm font-semibold">{title}</p>
        {description ? (
          <p className="text-cva-text-muted mx-auto mt-1 max-w-md text-sm">{description}</p>
        ) : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Aviso contextual. Usado para lista de espera, formação desatualizada etc. */
export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: ReactNode;
  children: ReactNode;
}) {
  const styles = {
    info: 'border-cva-info/25 bg-cva-info-soft text-cva-info',
    warning: 'border-cva-warning/30 bg-cva-warning-soft text-cva-warning',
    danger: 'border-cva-danger/25 bg-cva-danger-soft text-cva-danger',
    success: 'border-cva-success/25 bg-cva-success-soft text-cva-success',
  } as const;

  return (
    <div className={cn('rounded-md border px-3.5 py-3 text-sm', styles[tone])} role="status">
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={cn(title ? 'mt-0.5' : null)}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Avatar do atleta. Sem foto, usa as iniciais — nunca um ícone genérico. */
export function AthleteAvatar({
  name,
  avatarUrl,
  size = 36,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="bg-cva-navy-900 inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function Divider({ label }: { label?: ReactNode }) {
  if (!label) return <hr className="border-cva-border" />;

  return (
    <div className="flex items-center gap-3">
      <hr className="border-cva-border flex-1" />
      <span className="text-cva-text-muted text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      <hr className="border-cva-border flex-1" />
    </div>
  );
}
