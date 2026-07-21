import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as mupdf from 'mupdf';
import sharp from 'sharp';

/**
 * Gera os arquivos de marca do CVA a partir do PDF vetorial oficial.
 *
 *   node scripts/gerar-marca.mjs "caminho/para/LOGO.pdf"
 *
 * O brasão **não é redesenhado** (§15): o PDF é rasterizado em alta resolução e
 * apenas recortado e redimensionado. Rodar de novo com um PDF atualizado
 * regenera tudo — por isso isto é um script versionado e não um passo manual.
 *
 * `mupdf` (WASM) rasteriza sem exigir Ghostscript/ImageMagick instalados;
 * `sharp` recorta a margem e gera os tamanhos.
 */

const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error('Uso: node scripts/gerar-marca.mjs "<caminho do PDF>"');
  process.exit(1);
}

const OUT = join(process.cwd(), 'public', 'brand');

/** 300 DPI dá folga para o maior alvo (1024 px) sem serrilhar. */
const SCALE = 300 / 72;

async function renderPdf(path) {
  const document = mupdf.Document.openDocument(readFileSync(path), 'application/pdf');
  const page = document.loadPage(0);

  /*
   * `alpha: true` — o fundo precisa ser transparente.
   *
   * O brasão é usado sobre o azul-marinho da barra lateral e da tela de acesso.
   * Rasterizado sem alpha, o PDF vira um retângulo branco: os cantos fora do
   * círculo apareceriam como um quadrado branco em volta do escudo.
   *
   * Transparência também preserva o branco *interno* do desenho (o anel e os
   * gomos da bola), que uma remoção de branco por cor destruiria.
   */
  const pixmap = page.toPixmap(
    mupdf.Matrix.scale(SCALE, SCALE),
    mupdf.ColorSpace.DeviceRGB,
    true,
    true,
  );

  return Buffer.from(pixmap.asPNG());
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const raw = await renderPdf(SOURCE);
  const rawMeta = await sharp(raw).metadata();
  console.log(`PDF rasterizado: ${rawMeta.width}×${rawMeta.height}`);

  /*
   * `trim` remove a margem branca da página do PDF. Sem isso, o brasão ficaria
   * pequeno no meio de um quadrado vazio — e o recorte circular do avatar
   * cortaria fora do desenho.
   */
  const trimmed = await sharp(raw).trim({ threshold: 10 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  console.log(`Após recorte da margem: ${meta.width}×${meta.height}`);

  /** Quadrado com o brasão centralizado e área de respiro proporcional. */
  async function square(size, padding) {
    const inner = Math.round(size * (1 - padding * 2));

    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp(trimmed)
            .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer(),
          gravity: 'center',
        },
      ])
      .png()
      .toBuffer();
  }

  // Brasão principal: usado em cabeçalhos e na tela de acesso.
  await writeFile(join(OUT, 'cva-logo.png'), await square(1024, 0.02));
  console.log('✓ cva-logo.png (1024×1024)');

  /*
   * Ícone do app: fundo azul-marinho sólido. Ícone maskable é recortado em
   * círculo por alguns sistemas, e 12% de respiro impede que as três estrelas
   * do topo do brasão sejam cortadas.
   */
  const appIcon = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 7, g: 20, b: 38, alpha: 1 },
    },
  })
    .composite([
      {
        input: await sharp(trimmed)
          .resize(400, 400, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer(),
        gravity: 'center',
      },
    ])
    .png()
    .toBuffer();

  await writeFile(join(OUT, 'app-icon.png'), appIcon);
  console.log('✓ app-icon.png (512×512, fundo azul-marinho)');

  // Favicon: 48 px é o maior tamanho que o navegador usa; menor que isso o
  // brasão vira mancha, então mantemos o desenho inteiro sem respiro extra.
  await writeFile(join(OUT, 'favicon-48.png'), await square(48, 0));
  await writeFile(join(OUT, 'favicon-32.png'), await square(32, 0));
  await writeFile(join(OUT, 'favicon-16.png'), await square(16, 0));
  console.log('✓ favicon-16/32/48.png');

  // Prévia ao compartilhar link: brasão centralizado sobre o azul da marca.
  const og = await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 7, g: 20, b: 38, alpha: 1 },
    },
  })
    .composite([
      {
        input: await sharp(trimmed)
          .resize(440, 440, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer(),
        gravity: 'center',
      },
    ])
    .png()
    .toBuffer();

  await writeFile(join(OUT, 'og-image.png'), og);
  console.log('✓ og-image.png (1200×630)');

  console.log(`\nArquivos gerados em ${OUT}`);
}

main().catch((error) => {
  console.error('Falha ao gerar a marca:', error);
  process.exit(1);
});
