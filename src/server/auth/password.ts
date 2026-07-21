import 'server-only';

import { hash, verify } from '@node-rs/argon2';
import { DomainError } from '@/domain/shared/errors';

/**
 * Hash de senha com Argon2id.
 *
 * Parâmetros seguem a recomendação da OWASP (19 MiB, 2 iterações, paralelismo 1),
 * que é o menor perfil ainda considerado adequado — importante porque funções
 * serverless têm memória limitada e um perfil maior derrubaria o login.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 10;

/**
 * Política de senha (§20). Comprimento é o fator que mais importa; exigir
 * símbolos obrigatórios empurra o usuário para senhas piores e memorizáveis.
 * Bloqueamos apenas o que é comprovadamente fraco.
 */
const COMMON_PASSWORDS = new Set([
  'senha123456',
  '123456789012',
  'volei123456',
  'password1234',
  'qwerty123456',
  'cvagestao123',
]);

export function validatePasswordStrength(password: string, context: string[] = []): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new DomainError(
      'ENTRADA_INVALIDA',
      `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    );
  }

  if (password.length > 200) {
    throw new DomainError('ENTRADA_INVALIDA', 'A senha é longa demais.');
  }

  const normalized = password.toLowerCase();

  if (COMMON_PASSWORDS.has(normalized)) {
    throw new DomainError(
      'ENTRADA_INVALIDA',
      'Essa senha é muito comum. Escolha outra combinação.',
    );
  }

  // A senha não pode ser o próprio e-mail ou nome do atleta.
  for (const value of context) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length >= 4 && normalized.includes(trimmed)) {
      throw new DomainError(
        'ENTRADA_INVALIDA',
        'A senha não pode conter seu nome ou seu e-mail.',
      );
    }
  }
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await verify(digest, password, ARGON2_OPTIONS);
  } catch {
    // Hash malformado (dado corrompido) não deve derrubar o login com stack trace.
    return false;
  }
}
