import { ForbiddenError, NotAuthenticatedError } from '@/domain/shared/errors';
import {
  DEFAULT_VISIBILITY,
  isActive,
  isAdmin,
  isSelf,
  type Actor,
  type VisibilitySettings,
} from './actor';

export * from './actor';

/**
 * Policies de autorização (§4 e §20 da especificação).
 *
 * Regras de projeto:
 *
 *  1. **Falha fechada.** Sem `Actor`, tudo é negado.
 *  2. **Erro, não lista vazia.** Um atleta que tenta acessar recurso financeiro
 *     recebe `403`, não uma resposta vazia que pareça "não há dados".
 *  3. **Sanitização é obrigatória, não opcional.** As funções `sanitize*` são o
 *     único caminho para serializar entidades sensíveis a um cliente. Esconder
 *     no frontend não é proteção.
 *
 * Este módulo é puro: não importa banco nem `next/headers`, e por isso é testado
 * diretamente, sem infraestrutura.
 */

// ---------------------------------------------------------------------------
// Portões básicos
// ---------------------------------------------------------------------------

export function requireAuthenticated(actor: Actor | null): Actor {
  if (!actor) throw new NotAuthenticatedError();
  return actor;
}

/** Conta aprovada e ativa. Cadastro pendente não passa daqui. */
export function requireActive(actor: Actor | null): Actor {
  const authenticated = requireAuthenticated(actor);

  if (!isActive(authenticated)) {
    throw new ForbiddenError(
      authenticated.status === 'aguardando_aprovacao'
        ? 'Seu cadastro ainda está aguardando aprovação de um administrador.'
        : 'Sua conta não está ativa. Fale com um administrador do grupo.',
      { status: authenticated.status },
    );
  }

  return authenticated;
}

export function requireAdmin(actor: Actor | null): Actor {
  const active = requireActive(actor);
  if (!isAdmin(active)) {
    throw new ForbiddenError('Esta área é exclusiva dos administradores do grupo.');
  }
  return active;
}

// ---------------------------------------------------------------------------
// Financeiro — §13. Exclusivo de administradores, sem exceção.
// ---------------------------------------------------------------------------

/**
 * Portão único de **todo** o módulo financeiro: páginas, server actions,
 * consultas, relatórios e arquivos. Nenhuma consulta às tabelas `event_charges`,
 * `event_payments`, `event_expenses`, `cash_transactions`, `extra_*` acontece
 * sem passar por aqui.
 */
export function requireFinanceAccess(actor: Actor | null): Actor {
  const active = requireActive(actor);
  if (!isAdmin(active)) {
    throw new ForbiddenError(
      'O controle financeiro do grupo é acessível apenas aos administradores.',
      { resource: 'financeiro' },
    );
  }
  return active;
}

// ---------------------------------------------------------------------------
// Atletas — §5
// ---------------------------------------------------------------------------

export function canEditAthlete(actor: Actor | null, athleteId: string): boolean {
  if (!isActive(actor)) return false;
  return isAdmin(actor) || isSelf(actor, athleteId);
}

export function requireAthleteEdit(actor: Actor | null, athleteId: string): Actor {
  const active = requireActive(actor);
  if (!canEditAthlete(active, athleteId)) {
    throw new ForbiddenError('Você só pode editar o seu próprio cadastro.');
  }
  return active;
}

/** Campos que o próprio atleta pode alterar. Os demais são de administrador. */
export const ATHLETE_SELF_EDITABLE_FIELDS = [
  'nickname',
  'phone',
  'email',
  'birthDate',
  'uniformSize',
  'avatarUrl',
  'athleteNotes',
] as const;

export type AthleteSelfEditableField = (typeof ATHLETE_SELF_EDITABLE_FIELDS)[number];

/**
 * Filtra um patch de edição ao que o ator pode de fato alterar.
 * Um atleta que forjar um formulário com `adminNotes` tem o campo descartado
 * aqui, no servidor — não é uma questão de qual input a tela renderizou.
 */
export function restrictAthletePatch<T extends Record<string, unknown>>(
  actor: Actor,
  athleteId: string,
  patch: T,
): Partial<T> {
  if (isAdmin(actor)) return patch;
  if (!isSelf(actor, athleteId)) {
    throw new ForbiddenError('Você só pode editar o seu próprio cadastro.');
  }

  const allowed = new Set<string>(ATHLETE_SELF_EDITABLE_FIELDS);
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => allowed.has(key)),
  ) as Partial<T>;
}

/** Entidade de atleta como vem do banco, com os campos sensíveis. */
export interface AthleteRecord {
  id: string;
  fullName: string;
  nickname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  shirtNumber: number | null;
  uniformSize: string | null;
  joinedAt: string | null;
  status: string;
  athleteNotes: string | null;
  adminNotes: string | null;
  healthRestrictions: string | null;
}

/**
 * Versão serializável de um atleta para o ator informado.
 *
 * `adminNotes` e `healthRestrictions` são **removidos do objeto**, não apenas
 * ocultados: um atleta que inspecionar o payload do RSC não encontra os campos.
 * Contato de terceiros também sai — não é dado que um atleta precise do outro.
 */
export function sanitizeAthlete(actor: Actor | null, athlete: AthleteRecord) {
  const admin = isAdmin(actor);
  const self = isSelf(actor, athlete.id);

  const base = {
    id: athlete.id,
    fullName: athlete.fullName,
    nickname: athlete.nickname,
    avatarUrl: athlete.avatarUrl,
    shirtNumber: athlete.shirtNumber,
    status: athlete.status,
    joinedAt: athlete.joinedAt,
  };

  if (!admin && !self) return base;

  return {
    ...base,
    phone: athlete.phone,
    email: athlete.email,
    birthDate: athlete.birthDate,
    uniformSize: athlete.uniformSize,
    athleteNotes: athlete.athleteNotes,
    // Restrição médica: só o próprio atleta e os administradores.
    healthRestrictions: athlete.healthRestrictions,
    // Observação interna: **apenas** administradores, nem o próprio atleta.
    ...(admin ? { adminNotes: athlete.adminNotes } : {}),
  };
}

// ---------------------------------------------------------------------------
// Avaliações — §7
// ---------------------------------------------------------------------------

/**
 * Quem pode ver uma avaliação **oficial**.
 *
 * - Administradores: sempre.
 * - O próprio atleta: apenas se a configuração do clube liberar (padrão: não).
 * - Terceiros: nunca. Não existe ranking técnico público.
 */
export function canViewOfficialEvaluation(
  actor: Actor | null,
  athleteId: string,
  settings: VisibilitySettings = DEFAULT_VISIBILITY,
): boolean {
  if (!isActive(actor)) return false;
  if (isAdmin(actor)) return true;
  return isSelf(actor, athleteId) && settings.selfOfficialEvaluationVisible;
}

export function requireOfficialEvaluationView(
  actor: Actor | null,
  athleteId: string,
  settings: VisibilitySettings = DEFAULT_VISIBILITY,
): Actor {
  const active = requireActive(actor);
  if (!canViewOfficialEvaluation(active, athleteId, settings)) {
    throw new ForbiddenError(
      isSelf(active, athleteId)
        ? 'As avaliações oficiais são usadas apenas para montar os times e não ficam visíveis.'
        : 'As avaliações oficiais são visíveis apenas aos administradores.',
    );
  }
  return active;
}

/** Somente administradores definem ou alteram a avaliação oficial. */
export function requireOfficialEvaluationEdit(actor: Actor | null): Actor {
  const active = requireActive(actor);
  if (!isAdmin(active)) {
    throw new ForbiddenError(
      'Apenas administradores definem a avaliação oficial. Sua autoavaliação é uma referência ' +
        'e não altera a nota oficial.',
    );
  }
  return active;
}

/** Autoavaliação: cada atleta envia a própria; administradores veem todas. */
export function canViewSelfAssessment(actor: Actor | null, athleteId: string): boolean {
  if (!isActive(actor)) return false;
  return isAdmin(actor) || isSelf(actor, athleteId);
}

export function requireSelfAssessmentSubmit(actor: Actor | null, athleteId: string): Actor {
  const active = requireActive(actor);
  if (!isSelf(active, athleteId) && !isAdmin(active)) {
    throw new ForbiddenError('Você só pode enviar a sua própria autoavaliação.');
  }
  return active;
}

// ---------------------------------------------------------------------------
// Afinidades — §8.3
// ---------------------------------------------------------------------------

export interface AffinityRecord {
  id: string;
  fromAthleteId: string;
  toAthleteId: string;
  type: 'pessoal' | 'tatica';
  intensity: number;
  rigidity: 'preferencia_flexivel' | 'restricao_obrigatoria';
  note: string | null;
}

/**
 * Um atleta vê **apenas** as preferências que ele mesmo cadastrou.
 *
 * O alvo de uma preferência nunca é informado — nem que existe, nem por quem.
 * Por isso a visibilidade depende de `fromAthleteId`, e nunca de `toAthleteId`.
 */
export function canViewAffinity(actor: Actor | null, affinity: AffinityRecord): boolean {
  if (!isActive(actor)) return false;
  if (isAdmin(actor)) return true;
  return isSelf(actor, affinity.fromAthleteId);
}

export function visibleAffinities(
  actor: Actor | null,
  affinities: readonly AffinityRecord[],
): AffinityRecord[] {
  return affinities.filter((affinity) => canViewAffinity(actor, affinity));
}

/** Só administradores criam restrição obrigatória (§8.2). */
export function requireAffinityWrite(
  actor: Actor | null,
  affinity: Pick<AffinityRecord, 'fromAthleteId' | 'rigidity'>,
): Actor {
  const active = requireActive(actor);

  if (affinity.rigidity === 'restricao_obrigatoria' && !isAdmin(active)) {
    throw new ForbiddenError(
      'Somente administradores podem transformar uma preferência em restrição obrigatória.',
    );
  }

  if (!isAdmin(active) && !isSelf(active, affinity.fromAthleteId)) {
    throw new ForbiddenError('Você só pode cadastrar as suas próprias preferências.');
  }

  return active;
}

// ---------------------------------------------------------------------------
// Eventos e presenças — §9
// ---------------------------------------------------------------------------

export function requireEventManagement(actor: Actor | null): Actor {
  const active = requireActive(actor);
  if (!isAdmin(active)) {
    throw new ForbiddenError('Apenas administradores criam e gerenciam encontros.');
  }
  return active;
}

/** Cada atleta responde por si; o administrador responde por qualquer um. */
export function requireAttendanceResponse(actor: Actor | null, athleteId: string): Actor {
  const active = requireActive(actor);
  if (!isAdmin(active) && !isSelf(active, athleteId)) {
    throw new ForbiddenError('Você só pode confirmar ou cancelar a sua própria presença.');
  }
  return active;
}

// ---------------------------------------------------------------------------
// Times — §10
// ---------------------------------------------------------------------------

export function requireTeamGeneration(actor: Actor | null): Actor {
  const active = requireActive(actor);
  if (!isAdmin(active)) {
    throw new ForbiddenError('Apenas administradores geram e publicam os times.');
  }
  return active;
}

/**
 * A explicação do algoritmo (diferença percentual, afinidades atendidas,
 * alertas) é **exclusiva de administradores**. A visão pública de um time
 * publicado não contém notas, afinidades nem justificativas (§10.8).
 */
export function canViewFormationExplanation(actor: Actor | null): boolean {
  return isActive(actor) && isAdmin(actor);
}

export interface FormationForPublic {
  teams: readonly { name: string; members: readonly { id: string; displayName: string }[] }[];
}

export interface FormationForAdmin extends FormationForPublic {
  metrics: unknown;
  affinityOutcomes: unknown;
  alerts: unknown;
  provenance: unknown;
}

/**
 * Serializa uma formação para o ator. Para não administradores, os campos de
 * métrica, afinidade e procedência são **removidos** do objeto.
 */
export function sanitizeFormation(
  actor: Actor | null,
  formation: FormationForAdmin,
): FormationForPublic | FormationForAdmin {
  if (canViewFormationExplanation(actor)) return formation;
  return { teams: formation.teams };
}

// ---------------------------------------------------------------------------
// Rodízio, histórico, configurações e auditoria
// ---------------------------------------------------------------------------

export function requireCourtOperation(actor: Actor | null): Actor {
  const active = requireActive(actor);
  if (!isAdmin(active)) {
    throw new ForbiddenError('Apenas administradores operam o painel de quadra.');
  }
  return active;
}

export function requireSettingsWrite(actor: Actor | null): Actor {
  const active = requireActive(actor);
  if (!isAdmin(active)) {
    throw new ForbiddenError('As configurações do clube são gerenciadas pelos administradores.');
  }
  return active;
}

export function requireAuditAccess(actor: Actor | null): Actor {
  const active = requireActive(actor);
  if (!isAdmin(active)) {
    throw new ForbiddenError('O registro de auditoria é acessível apenas aos administradores.');
  }
  return active;
}
