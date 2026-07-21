# Arquivos de marca do CVA

Todos os arquivos desta pasta são **gerados** a partir do PDF vetorial oficial do
brasão. Não edite nenhum deles à mão: a próxima geração sobrescreve.

O brasão não é redesenhado, distorcido nem tem elementos removidos (§15 da
especificação) — o script apenas rasteriza, recorta a margem e redimensiona.

## Regerar

```bash
node scripts/gerar-marca.mjs "caminho/para/LOGO CONEXÃO VETOR.pdf"
```

Se o clube atualizar a arte, rode de novo com o PDF novo e faça commit do
resultado. O PDF de origem não fica no repositório.

## O que é gerado

| Arquivo | Tamanho | Uso |
| --- | --- | --- |
| `cva-logo.png` | 1024×1024, transparente | Brasão principal: cabeçalhos, tela de acesso, avatar do clube |
| `app-icon.png` | 512×512, fundo azul-marinho | Ícone da aplicação instalada e atalho iOS |
| `favicon-48.png` | 48×48 | Aba do navegador em tela de alta densidade |
| `favicon-32.png` | 32×32 | Aba do navegador |
| `favicon-16.png` | 16×16 | Aba do navegador, sem respiro — nesse tamanho o desenho já é pequeno demais |
| `og-image.png` | 1200×630 | Prévia ao compartilhar o link |

## Decisões do script

**Fundo transparente.** O brasão aparece sobre o azul-marinho da barra lateral e
da tela de acesso. Rasterizado sem canal alfa, o PDF vira um retângulo branco e
os cantos fora do círculo apareceriam como um quadrado branco em volta do
escudo. A transparência também preserva o branco *interno* do desenho — o anel e
os gomos da bola — que uma remoção de branco por cor destruiria.

**Recorte da margem.** A página do PDF tem margem em volta da arte. Sem recortar,
o brasão ficaria pequeno no meio de um quadrado vazio e o recorte circular do
avatar cortaria fora do desenho.

**Respiro no ícone da aplicação.** Alguns sistemas recortam o ícone `maskable` em
círculo. Os 12% de respiro impedem que as três estrelas do topo sejam cortadas.

## Uso em código

`src/components/brand/club-mark.tsx` cuida do enquadramento:
proporção sempre preservada, `object-fit: contain`, área de respiro de 6% no
modo circular, sem sombra, brilho ou filtro sobre o brasão.
