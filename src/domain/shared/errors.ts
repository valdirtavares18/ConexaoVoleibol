/**
 * Erros de domínio. Carregam um `code` estável (usado em testes e logs) e uma
 * mensagem em pt-BR já adequada para exibição ao usuário final.
 *
 * Regra: nunca engolir erro silenciosamente e nunca mostrar mensagem técnica
 * (`docs/product-spec.md` §22).
 */

export type DomainErrorCode =
  | 'NAO_AUTENTICADO'
  | 'SEM_PERMISSAO'
  | 'NAO_ENCONTRADO'
  | 'ENTRADA_INVALIDA'
  | 'CONFLITO'
  | 'EVENTO_LOTADO'
  | 'PRAZO_ENCERRADO'
  | 'ATLETAS_INSUFICIENTES'
  | 'RESTRICOES_INSATISFAZIVEIS'
  | 'RODIZIO_INVALIDO'
  | 'LIMITE_DE_TAXA';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export class NotAuthenticatedError extends DomainError {
  constructor(message = 'Você precisa entrar para continuar.') {
    super('NAO_AUTENTICADO', message);
    this.name = 'NotAuthenticatedError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(
    message = 'Você não tem permissão para acessar isto.',
    details: Record<string, unknown> = {},
  ) {
    super('SEM_PERMISSAO', message, details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Registro não encontrado.', details: Record<string, unknown> = {}) {
    super('NAO_ENCONTRADO', message, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('CONFLITO', message, details);
    this.name = 'ConflictError';
  }
}

export class InsufficientPlayersError extends DomainError {
  constructor(expected: number, actual: number) {
    super(
      'ATLETAS_INSUFICIENTES',
      `São necessários ${expected} atletas confirmados para montar os times no modo padrão. ` +
        `No momento há ${actual}.`,
      { expected, actual },
    );
    this.name = 'InsufficientPlayersError';
  }
}

export class UnsatisfiableConstraintsError extends DomainError {
  constructor(reason: string, details: Record<string, unknown> = {}) {
    super(
      'RESTRICOES_INSATISFAZIVEIS',
      `Não foi possível montar os times respeitando todas as restrições obrigatórias. ${reason}`,
      details,
    );
    this.name = 'UnsatisfiableConstraintsError';
  }
}

export class RotationError extends DomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('RODIZIO_INVALIDO', message, details);
    this.name = 'RotationError';
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
