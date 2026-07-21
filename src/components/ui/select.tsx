'use client';

import * as RadixSelect from '@radix-ui/react-select';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Select do design system, sobre o Radix.
 *
 * O `<select>` nativo abre a lista do **sistema operacional**: no Windows ela é
 * cinza, com fonte e espaçamento próprios, e ignora completamente a identidade
 * do CVA. Numa tela com 18 nomes de atleta, ela também fica longa e difícil de
 * varrer.
 *
 * O Radix resolve isso mantendo o que o nativo tem de bom e que costuma se
 * perder em implementações caseiras: navegação por teclado (setas, Home/End,
 * busca por digitação), foco preso enquanto aberto, `aria-*` correto e — via a
 * prop `name` — um campo oculto que **participa do envio normal do formulário**.
 * É isso que permite continuar usando server actions com `<form action={...}>`,
 * sem estado no cliente.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Texto auxiliar exibido abaixo do rótulo dentro da lista. */
  hint?: string;
  disabled?: boolean;
}

export interface SelectProps {
  label: string;
  name: string;
  options: readonly SelectOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  error?: string;
  /** Esconde o rótulo visualmente, mantendo-o para leitores de tela. */
  hideLabel?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function Select({
  label,
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  placeholder = 'Selecione…',
  required,
  disabled,
  hint,
  error,
  hideLabel = false,
  className,
  size = 'md',
}: SelectProps) {
  const id = useId();
  const errorId = `${id}-erro`;
  const hintId = `${id}-dica`;

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  /*
   * O componente é sempre controlado internamente, mesmo quando o chamador usa
   * `defaultValue`.
   *
   * Motivo: o `Select.Value` do Radix descobre o texto a exibir a partir do item
   * selecionado — e os itens só existem no DOM enquanto a lista está aberta.
   * Com a lista fechada e um valor padrão, o gatilho aparece **vazio**: sem
   * placeholder (porque há valor) e sem rótulo (porque o item não está montado).
   *
   * Guardando o valor aqui, o rótulo vem da própria lista de `options` e o
   * gatilho sempre mostra o que está selecionado.
   */
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = value ?? internalValue;
  const selected = options.find((option) => option.value === currentValue);

  const handleChange = (next: string): void => {
    setInternalValue(next);
    onValueChange?.(next);
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className={cn('text-cva-text text-sm font-medium', hideLabel && 'sr-only')}
      >
        {label}
      </label>

      <RadixSelect.Root
        name={name}
        value={currentValue ?? ''}
        onValueChange={handleChange}
        required={required}
        disabled={disabled}
      >
        <RadixSelect.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            'border-cva-border-strong bg-cva-panel text-cva-text flex w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-sm',
            'data-[placeholder]:text-cva-text-muted',
            'hover:border-cva-blue-600 transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-60',
            size === 'sm' ? 'h-9' : 'h-11',
            error && 'border-cva-danger',
          )}
        >
          {/* Filho explícito: sobrescreve a resolução automática do Radix,
              que depende do item estar montado. */}
          <RadixSelect.Value placeholder={placeholder}>
            <span className="truncate">{selected?.label}</span>
          </RadixSelect.Value>
          <RadixSelect.Icon className="text-cva-text-muted shrink-0">
            <ChevronDown />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={6}
            className={cn(
              'border-cva-border bg-cva-panel z-50 overflow-hidden rounded-lg border shadow-[var(--shadow-overlay)]',
              // Acompanha a largura do gatilho: uma lista mais estreita que o
              // campo obriga a reler o rótulo para saber o que está escolhendo.
              'max-h-[min(22rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)]',
            )}
          >
            <RadixSelect.ScrollUpButton className="text-cva-text-muted flex h-6 items-center justify-center text-xs">
              ▲
            </RadixSelect.ScrollUpButton>

            <RadixSelect.Viewport className="p-1">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    'text-cva-text relative flex cursor-pointer flex-col rounded-md px-2.5 py-2 text-sm outline-none select-none',
                    'data-[highlighted]:bg-cva-blue-100 data-[highlighted]:text-cva-navy-900',
                    'data-[state=checked]:bg-cva-gold-100 data-[state=checked]:font-semibold',
                    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                  )}
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  {option.hint ? (
                    <span className="text-cva-text-muted mt-0.5 text-xs">{option.hint}</span>
                  ) : null}
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>

            <RadixSelect.ScrollDownButton className="text-cva-text-muted flex h-6 items-center justify-center text-xs">
              ▼
            </RadixSelect.ScrollDownButton>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>

      {hint ? (
        <p id={hintId} className="text-cva-text-muted text-xs">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-cva-danger flex items-start gap-1.5 text-xs">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
