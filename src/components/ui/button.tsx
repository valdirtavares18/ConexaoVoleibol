import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Botão do design system do CVA.
 *
 * O dourado da marca é **ação secundária e destaque**, não a ação primária de
 * página inteira (§15.1) — por isso `primary` é azul-marinho e `gold` existe
 * como variante deliberada para momentos de ênfase (publicar times, encerrar
 * partida).
 */

type Variant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-cva-navy-900 text-white hover:bg-cva-navy-800 active:bg-cva-navy-950 ' +
    'disabled:bg-cva-navy-900/40',
  gold:
    'bg-cva-gold-500 text-cva-navy-950 hover:bg-cva-gold-600 hover:text-white ' +
    'active:bg-cva-gold-600 disabled:bg-cva-gold-500/40',
  secondary:
    'bg-cva-panel text-cva-navy-900 border border-cva-border-strong hover:bg-cva-blue-100/50 ' +
    'active:bg-cva-blue-100',
  ghost: 'text-cva-navy-900 hover:bg-cva-blue-100/60 active:bg-cva-blue-100',
  danger: 'bg-cva-danger text-white hover:brightness-110 active:brightness-95',
};

const SIZES: Record<Size, string> = {
  // Alturas mínimas de 40/44px: área de toque adequada no celular (§21).
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Ocupa a largura disponível — usado em formulários no celular. */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block = false, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-semibold',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-70',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...props}
    />
  );
});
