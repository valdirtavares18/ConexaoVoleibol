import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DomainError } from '@/domain/shared/errors';

/**
 * Armazenamento de arquivos (§3 e §20).
 *
 * Dois drivers, escolhidos por variável de ambiente:
 *
 *  - **Supabase Storage**, quando `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
 *    estão definidas. É o alvo de produção.
 *  - **Disco local** (`public/uploads/`), caso contrário — permite desenvolver e
 *    testar o fluxo completo de upload sem provisionar nada.
 *
 * A validação de tipo e tamanho acontece **antes** do driver, uma única vez:
 * é requisito de segurança e não pode depender de qual driver está ativo.
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Lista de permissão por tipo **e** por assinatura de bytes.
 *
 * Confiar no `Content-Type` enviado pelo cliente não protege nada: ele é
 * escolhido por quem envia. A checagem dos bytes iniciais é o que realmente
 * impede subir um arquivo arbitrário com extensão de imagem.
 */
const ALLOWED = [
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
] as const;

export interface StoredFile {
  /** URL pública ou servida pela aplicação. */
  url: string;
  /** Caminho interno, usado para remover depois. */
  path: string;
}

function detect(bytes: Uint8Array, declaredMime: string): (typeof ALLOWED)[number] {
  const match = ALLOWED.find(
    (candidate) =>
      candidate.mime === declaredMime &&
      candidate.magic.every((byte, index) => bytes[index] === byte),
  );

  if (!match) {
    throw new DomainError(
      'ENTRADA_INVALIDA',
      'Envie uma imagem JPG, PNG ou WEBP. O arquivo enviado não parece ser uma imagem válida.',
    );
  }

  return match;
}

export function assertUploadIsAcceptable(file: File): void {
  if (file.size === 0) {
    throw new DomainError('ENTRADA_INVALIDA', 'O arquivo enviado está vazio.');
  }
  if (file.size > MAX_BYTES) {
    throw new DomainError(
      'ENTRADA_INVALIDA',
      `A imagem precisa ter no máximo ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`,
    );
  }
  if (!ALLOWED.some((candidate) => candidate.mime === file.type)) {
    throw new DomainError('ENTRADA_INVALIDA', 'Formato não aceito. Use JPG, PNG ou WEBP.');
  }
}

function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function storageDriverName(): 'supabase' | 'local' {
  return supabaseConfigured() ? 'supabase' : 'local';
}

async function uploadToSupabase(
  bytes: Uint8Array,
  mime: string,
  objectPath: string,
): Promise<StoredFile> {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'cva-media';
  const base = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');

  const response = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': mime,
      'x-upsert': 'true',
    },
    body: bytes as BodyInit,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new DomainError(
      'ENTRADA_INVALIDA',
      'Não foi possível salvar a imagem agora. Tente de novo em alguns instantes.',
      { detail: detail.slice(0, 200) },
    );
  }

  return {
    url: `${base}/storage/v1/object/public/${bucket}/${objectPath}`,
    path: objectPath,
  };
}

async function uploadToDisk(
  bytes: Uint8Array,
  objectPath: string,
): Promise<StoredFile> {
  const target = join(process.cwd(), 'public', 'uploads', objectPath);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, bytes);

  return { url: `/uploads/${objectPath}`, path: objectPath };
}

/** Salva um avatar já validado. O nome é aleatório: o original é do usuário. */
export async function uploadAvatar(file: File, athleteId: string): Promise<StoredFile> {
  assertUploadIsAcceptable(file);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detect(bytes, file.type);
  const objectPath = `avatars/${athleteId}/${randomUUID()}.${kind.ext}`;

  return supabaseConfigured()
    ? uploadToSupabase(bytes, kind.mime, objectPath)
    : uploadToDisk(bytes, objectPath);
}

/** Remove um avatar antigo. Falhas são ignoradas: o novo já está salvo. */
export async function removeStoredFile(path: string): Promise<void> {
  try {
    if (supabaseConfigured()) {
      const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'cva-media';
      const base = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');

      await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      });
      return;
    }

    await unlink(join(process.cwd(), 'public', 'uploads', path));
  } catch {
    // Arquivo órfão não é motivo para falhar a troca de foto.
  }
}
