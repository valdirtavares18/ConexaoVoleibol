import Image from 'next/image';

/**
 * Brasão do CVA.
 *
 * O arquivo oficial vive em `public/brand/cva-logo.png` e **não é redesenhado**
 * (§15). Este componente só cuida do enquadramento correto:
 *
 *  - `object-fit: contain`, proporção preservada, sem efeitos;
 *  - área de respiro suficiente para não cortar estrelas nem a borda do escudo;
 *  - variante circular para uso como avatar, com o mesmo respiro.
 *
 * Se o arquivo ainda não foi adicionado ao projeto, ver `public/brand/README.md`.
 */

type ClubMarkSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<ClubMarkSize, number> = {
  sm: 32,
  md: 44,
  lg: 72,
  xl: 128,
};

export interface ClubMarkProps {
  size?: ClubMarkSize;
  /** Recorte circular para uso como avatar. */
  circular?: boolean;
  /** Fundo escuro atrás do brasão — o brasão original já é azul-marinho. */
  onDark?: boolean;
  className?: string;
  priority?: boolean;
}

export function ClubMark({
  size = 'md',
  circular = false,
  onDark = false,
  className,
  priority = false,
}: ClubMarkProps) {
  const px = SIZES[size];

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        // O padding é a "área de respiro": impede que o recorte circular corte
        // as três estrelas do topo do brasão.
        circular ? 'rounded-full p-[6%]' : '',
        onDark ? 'bg-cva-navy-900' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
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
 * Assinatura horizontal: brasão + nome. Usada em cabeçalhos e na tela de acesso.
 */
export function ClubWordmark({
  size = 'md',
  onDark = false,
}: {
  size?: ClubMarkSize;
  onDark?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-3">
      <ClubMark size={size} onDark={onDark} priority />
      <span className="leading-tight">
        <span
          className={`block text-sm font-semibold tracking-tight ${
            onDark ? 'text-white' : 'text-cva-navy-900'
          }`}
        >
          Conexão Voleibol Alegrete
        </span>
        <span
          className={`block text-xs ${onDark ? 'text-cva-blue-100' : 'text-cva-text-muted'}`}
        >
          CVA Gestão
        </span>
      </span>
    </span>
  );
}
