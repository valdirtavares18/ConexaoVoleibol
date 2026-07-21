import { describe, expect, it } from 'vitest';
import { DomainError } from '@/domain/shared/errors';
import { assertUploadIsAcceptable, storageDriverName } from './index';

/** Cria um `File` com a assinatura de bytes informada. */
function fileWith(mime: string, bytes: number[], sizeInBytes = bytes.length): File {
  const padded = new Uint8Array(sizeInBytes);
  padded.set(bytes.slice(0, sizeInBytes));
  return new File([padded], 'foto.bin', { type: mime });
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];

describe('upload de avatar — validação (§20)', () => {
  it('aceita JPG, PNG e WEBP dentro do limite', () => {
    expect(() => assertUploadIsAcceptable(fileWith('image/jpeg', JPEG, 1024))).not.toThrow();
    expect(() => assertUploadIsAcceptable(fileWith('image/png', PNG, 1024))).not.toThrow();
    expect(() =>
      assertUploadIsAcceptable(fileWith('image/webp', [0x52, 0x49, 0x46, 0x46], 1024)),
    ).not.toThrow();
  });

  it('recusa arquivo vazio', () => {
    expect(() => assertUploadIsAcceptable(fileWith('image/png', [], 0))).toThrow(DomainError);
  });

  it('recusa acima de 2 MB', () => {
    const tooBig = fileWith('image/png', PNG, 2 * 1024 * 1024 + 1);
    expect(() => assertUploadIsAcceptable(tooBig)).toThrow(/2 MB/);
  });

  it('recusa tipo fora da lista de permissão', () => {
    expect(() => assertUploadIsAcceptable(fileWith('application/pdf', [0x25], 1024))).toThrow(
      /JPG, PNG ou WEBP/,
    );
    expect(() => assertUploadIsAcceptable(fileWith('image/svg+xml', [0x3c], 1024))).toThrow(
      DomainError,
    );
  });

  it('usa o driver local quando o Supabase não está configurado', () => {
    // O ambiente de teste não define SUPABASE_URL.
    expect(storageDriverName()).toBe('local');
  });
});
