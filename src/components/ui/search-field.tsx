'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * Campo de busca para filtrar listas e tabelas.
 *
 * Filtra no cliente, sem ida ao servidor: as listas do CVA têm dezenas de
 * linhas, não milhares, e o resultado aparece a cada tecla. Uma busca com
 * ida e volta de rede seria mais lenta e sem ganho nenhum nessa escala.
 *
 * `type="search"` dá o "x" de limpar nativo; o contador de resultados é
 * anunciado por leitor de tela via `aria-live`.
 */
export function SearchField({
  label,
  value,
  onChange,
  placeholder = 'Buscar…',
  resultCount,
  totalCount,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;
  totalCount?: number;
  className?: string;
}) {
  const id = useId();
  const statusId = `${id}-status`;

  const filtering = value.trim() !== '';

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>

      <div className="relative">
        <span
          aria-hidden="true"
          className="text-cva-text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M10.5 10.5L14 14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>

        <input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-describedby={resultCount !== undefined ? statusId : undefined}
          className="border-cva-border-strong bg-cva-panel text-cva-text placeholder:text-cva-text-muted h-10 w-full rounded-md border pr-3 pl-9 text-sm"
        />
      </div>

      {resultCount !== undefined ? (
        <p
          id={statusId}
          aria-live="polite"
          className={cn('text-xs', filtering ? 'text-cva-text-muted' : 'sr-only')}
        >
          {resultCount === 0
            ? `Nenhum resultado para “${value}”.`
            : `${resultCount}${totalCount !== undefined ? ` de ${totalCount}` : ''} ${
                resultCount === 1 ? 'resultado' : 'resultados'
              }.`}
        </p>
      ) : null}
    </div>
  );
}
