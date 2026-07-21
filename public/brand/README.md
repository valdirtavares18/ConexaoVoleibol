# Arquivos de marca do CVA

Estes arquivos **não estão no repositório** e precisam ser adicionados a partir
do material oficial do clube. O sistema não redesenha, distorce nem remove
elementos do brasão (§15 da especificação).

## Arquivos esperados

| Arquivo | Uso | Formato recomendado |
| --- | --- | --- |
| `cva-logo.png` | Brasão principal — cabeçalhos, tela de acesso, avatar do clube | PNG com fundo transparente, lado maior ≥ 1024 px |
| `cva-logo.svg` | Versão vetorial, se existir | SVG |
| `favicon.svg` | Ícone da aba do navegador | SVG 32×32, versão simplificada do brasão |
| `app-icon.png` | Ícone da aplicação instalada / atalho iOS | PNG 512×512, fundo azul-marinho sólido `#0c1b3d` |
| `og-image.png` | Prévia ao compartilhar link | PNG 1200×630 |

## Regras de uso já implementadas em código

O componente `src/components/brand/club-mark.tsx` cuida do enquadramento:

- `object-fit: contain` e proporção sempre preservada;
- área de respiro de 6% no modo circular, para **não cortar as três estrelas**
  nem a borda do escudo;
- sem sombra pesada, brilho ou filtro sobre o brasão;
- fundo azul-marinho (`--color-cva-navy-900`) quando usado sobre área escura.

## Enquanto os arquivos não forem adicionados

As telas continuam funcionando, mas o `next/image` registra 404 para
`/brand/cva-logo.png` e o espaço do brasão aparece vazio. **Não** substitua por
um brasão desenhado à mão: use o arquivo oficial.
