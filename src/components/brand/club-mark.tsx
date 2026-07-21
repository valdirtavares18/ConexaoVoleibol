import Image from 'next/image';
import { cn } from '@/lib/cn';

/**
 * Brasão do CVA.
 *
 * O arquivo é gerado a partir do PDF vetorial oficial (ver
 * `public/brand/README.md`) e **não é redesenhado**. Este componente cuida só do
 * enquadramento:
 *
 *  - `object-fit: contain`, proporção preservada, sem sombra nem filtro;
 *  - área de respiro no modo circular, para não cortar as três estrelas;
 *  - **nenhum fundo próprio** — o PNG é transparente e assenta sobre a cor de
 *    onde estiver. Um fundo aqui criaria um quadrado de cor ligeiramente
 *    diferente da barra em volta, que é exatamente o defeito que ele deveria
 *    evitar.
 */

type ClubMarkSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<ClubMarkSize, number> = {
  sm: 34,
  md: 48,
  lg: 72,
  xl: 132,
};

export interface ClubMarkProps {
  size?: ClubMarkSize;
  /** Recorte circular para uso como avatar. */
  circular?: boolean;
  className?: string;
  priority?: boolean;
}

export function ClubMark({
  size = 'md',
  circular = false,
  className,
  priority = false,
}: ClubMarkProps) {
  const px = SIZES[size];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        // O padding é a "área de respiro": impede que o recorte circular corte
        // as três estrelas do topo do brasão.
        circular && 'overflow-hidden rounded-full p-[6%]',
        className,
      )}
      style={{ width: px, height: px }}
    >
      <Image
        src="/brand/cva-logo.png"
        alt="Brasão do Conexão Voleibol Alegrete"
        width={px * 2}
        height={px * 2}
        priority={priority}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

/**
 * Assinatura: brasão + nome do clube.
 *
 * `stacked` na barra lateral, onde a largura é curta: lado a lado, o nome
 * quebraria em três linhas e sobraria pouco espaço para o brasão.
 * `horizontal` nas barras superiores, onde há largura de sobra.
 */
export function ClubWordmark({
  size = 'md',
  onDark = false,
  orientation = 'horizontal',
}: {
  size?: ClubMarkSize;
  onDark?: boolean;
  orientation?: 'horizontal' | 'stacked';
}) {
  const stacked = orientation === 'stacked';

  return (
    <span className={cn('inline-flex', stacked ? 'flex-col items-start gap-3' : 'items-center gap-3')}>
      <ClubMark size={stacked ? 'lg' : size} priority />
      <span className="leading-tight">
        <span
          className={cn(
            'block font-semibold tracking-tight',
            stacked ? 'text-base' : 'text-sm',
            onDark ? 'text-white' : 'text-cva-navy-900',
          )}
        >
          Conexão Voleibol Alegrete
        </span>
        <span className={cn('block text-xs', onDark ? 'text-cva-blue-100' : 'text-cva-text-muted')}>
          CVA Gestão
        </span>
      </span>
    </span>
  );
}
