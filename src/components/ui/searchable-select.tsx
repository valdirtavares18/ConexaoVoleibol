'use client';

import * as Popover from '@radix-ui/react-popover';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { matches } from '@/lib/search';
import type { SelectOption } from './select';

/**
 * Seletor com busca (combobox).
 *
 * O `Select` comum é ótimo para poucas opções. Para escolher um atleta entre
 * dezenas, rolar a lista é lento — e vai piorar conforme o grupo cresce. Aqui a
 * pessoa digita parte do nome e a lista filtra.
 *
 * Não existe primitivo de combobox no Radix, então isto é Popover + listbox
 * montada à mão. O que **não** pode ser perdido nessa troca, e está implementado:
 *
 *  - `role="combobox"` no campo, `listbox`/`option` na lista, `aria-expanded`,
 *    `aria-controls` e `aria-activedescendant` — o leitor de tela anuncia a
 *    opção destacada sem que o foco saia do input;
 *  - setas para navegar, Enter para escolher, Esc para fechar, Tab para sair;
 *  - a busca ignora acentos: digitar "otavio" encontra "Otávio".
 */


export interface SearchableSelectProps {
  label: string;
  name: string;
  options: readonly SelectOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: React.ReactNode;
  error?: string;
  hideLabel?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function SearchableSelect({
  label,
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  placeholder = 'Selecione…',
  searchPlaceholder = 'Digite para buscar…',
  required,
  disabled,
  hint,
  error,
  hideLabel = false,
  className,
  size = 'md',
}: SearchableSelectProps) {
  const id = useId();
  const listId = `${id}-lista`;
  const errorId = `${id}-erro`;
  const hintId = `${id}-dica`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');

  const currentValue = value ?? internalValue;
  const selected = options.find((option) => option.value === currentValue);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => options.filter((option) => matches(query, option.label, option.hint)),
    [options, query],
  );

  // O destaque precisa voltar ao topo a cada busca, senão fica apontando para
  // um índice que não existe mais na lista filtrada.
  useEffect(() => setHighlight(0), [query]);

  // Mantém a opção destacada visível ao navegar por teclado.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector(`[data-index="${highlight}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const choose = (option: SelectOption): void => {
    setInternalValue(option.value);
    onValueChange?.(option.value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[highlight];
      if (option && !option.disabled) choose(option);
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlight(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setHighlight(Math.max(0, filtered.length - 1));
    }
  };

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className={cn('text-cva-text text-sm font-medium', hideLabel && 'sr-only')}
      >
        {label}
      </label>

      {/* O valor real vai por campo oculto: a server action lê `name` normalmente. */}
      <input type="hidden" name={name} value={currentValue} />

      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            // Sem `aria-invalid`: não é suportado em `role="button"`. O erro é
            // anunciado pelo `aria-describedby`, que aponta para a mensagem.
            aria-describedby={describedBy || undefined}
            className={cn(
              'border-cva-border-strong bg-cva-panel text-cva-text flex w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-sm',
              'hover:border-cva-blue-600 transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-60',
              size === 'sm' ? 'h-9' : 'h-11',
              error && 'border-cva-danger',
            )}
          >
            <span className={cn('truncate', !selected && 'text-cva-text-muted')}>
              {selected?.label ?? placeholder}
            </span>
            <SearchIcon />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(event) => {
              // Foca o campo de busca, não o primeiro item: quem abre quer digitar.
              event.preventDefault();
              inputRef.current?.focus();
            }}
            className="border-cva-border bg-cva-panel z-50 w-[var(--radix-popover-trigger-width)] min-w-56 overflow-hidden rounded-lg border shadow-[var(--shadow-overlay)]"
          >
            <div className="border-cva-border border-b p-2">
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={
                  filtered[highlight] ? `${id}-opcao-${highlight}` : undefined
                }
                aria-label={`Buscar em ${label}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className="border-cva-border-strong bg-cva-panel text-cva-text placeholder:text-cva-text-muted h-9 w-full rounded-md border px-2.5 text-sm"
              />
            </div>

            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={label}
              className="max-h-64 overflow-y-auto p-1"
            >
              {filtered.length === 0 ? (
                <p className="text-cva-text-muted px-2.5 py-3 text-sm">
                  Nenhum resultado para “{query}”.
                </p>
              ) : (
                filtered.map((option, index) => {
                  const isSelected = option.value === currentValue;
                  const isHighlighted = index === highlight;

                  return (
                    <div
                      key={option.value}
                      id={`${id}-opcao-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => !option.disabled && choose(option)}
                      className={cn(
                        'text-cva-text flex cursor-pointer flex-col rounded-md px-2.5 py-2 text-sm',
                        isHighlighted && 'bg-cva-blue-100 text-cva-navy-900',
                        isSelected && 'bg-cva-gold-100 font-semibold',
                        option.disabled && 'pointer-events-none opacity-50',
                      )}
                    >
                      <span>{option.label}</span>
                      {option.hint ? (
                        <span className="text-cva-text-muted mt-0.5 text-xs">{option.hint}</span>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            {options.length > 0 ? (
              <p className="border-cva-border text-cva-text-muted border-t px-2.5 py-1.5 text-xs">
                {filtered.length} de {options.length}
              </p>
            ) : null}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

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

      {/* `required` é validado no servidor; aqui serve de dica visual. */}
      {required && !currentValue ? <span className="sr-only">Campo obrigatório</span> : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-cva-text-muted shrink-0">
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
