'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Campo de formulário com label real e erro associado ao input.
 *
 * O erro é ligado por `aria-describedby` e marcado com `aria-invalid` — sem
 * isso, um leitor de tela anuncia o campo sem dizer o que está errado (§21).
 * O status também não depende só de cor: há texto e ícone.
 */

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

export function Field({ label, error, hint, className, ...props }: FieldProps) {
  const id = useId();
  const errorId = `${id}-erro`;
  const hintId = `${id}-dica`;

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-cva-text">
        {label}
      </label>

      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'h-11 rounded-md border bg-cva-panel px-3 text-base text-cva-text',
          'placeholder:text-cva-text-muted',
          'transition-colors',
          error
            ? 'border-cva-danger focus-visible:outline-cva-danger'
            : 'border-cva-border-strong',
          className,
        )}
        {...props}
      />

      {hint ? (
        <p id={hintId} className="text-xs text-cva-text-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-xs text-cva-danger">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
