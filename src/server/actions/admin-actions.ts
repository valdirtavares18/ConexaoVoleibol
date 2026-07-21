'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { POSITION_CODES, SKILL_CODES, type PositionCode } from '@/domain/positions';
import { isDomainError } from '@/domain/shared/errors';
import { cents, reaisToCents } from '@/domain/shared/money';
import { RATING_VALUES } from '@/domain/shared/rating';
import type { BalancingStrategy } from '@/domain/team-balancing';
import type { ActionState } from '@/lib/action-state';
import { getActor } from '@/server/context';
import { upsertAffinity } from '@/server/services/affinities';
import {
  approveRegistration,
  createAthlete,
  deactivateAthlete,
  rejectRegistration,
  requestRegistrationChanges,
  updateAthlete,
  type AthleteInput,
} from '@/server/services/athletes';
import { setOfficialEvaluation } from '@/server/services/evaluations';
import { createEvent, setEventStatus, updateEvent } from '@/server/services/events';
import {
  addManualAdjustment,
  adjustCharge,
  closeEventFinance,
  generateEventCharges,
  registerPayment,
} from '@/server/services/finance';
import { finishCourtSession, finishMatch, startCourtSession, undoLastFinishedMatch } from '@/server/services/rotation';
import { publishFormation } from '@/server/services/team-formation';

/**
 * Server actions administrativas.
 *
 * Todas seguem o mesmo contrato: validam com Zod, buscam o ator no servidor e
 * delegam ao serviço, que aplica a policy. Nenhuma confia em id de ator vindo
 * do formulário.
 */

async function run<T>(fn: () => Promise<T>, successMessage: string): Promise<ActionState> {
  try {
    await fn();
    return { ok: true, message: successMessage };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Cadastros
// ---------------------------------------------------------------------------

export async function approveRegistrationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = String(formData.get('userId') ?? '');
  const linkTo = String(formData.get('linkToAthleteId') ?? '');
  const actor = await getActor();

  const result = await run(
    () =>
      approveRegistration(db, {
        actor,
        userId,
        ...(linkTo ? { linkToAthleteId: linkTo } : {}),
      }),
    linkTo ? 'Cadastro aprovado e vinculado ao perfil existente.' : 'Cadastro aprovado.',
  );

  revalidatePath('/admin/atletas');
  revalidatePath('/admin');
  return result;
}

export async function rejectRegistrationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  const userId = String(formData.get('userId') ?? '');
  const reason = String(formData.get('reason') ?? '');
  const mode = String(formData.get('mode') ?? 'rejeitar');

  const result = await run(
    () =>
      mode === 'ajustes'
        ? requestRegistrationChanges(db, { actor, userId, note: reason })
        : rejectRegistration(db, { actor, userId, reason }),
    mode === 'ajustes' ? 'Ajustes solicitados.' : 'Cadastro recusado.',
  );

  revalidatePath('/admin/atletas');
  return result;
}

// ---------------------------------------------------------------------------
// Atletas
// ---------------------------------------------------------------------------

const athleteSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe o nome completo.'),
  nickname: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email('E-mail inválido.').or(z.literal('')).optional(),
  birthDate: z.string().trim().optional(),
  shirtNumber: z.coerce.number().int().min(0).max(999).optional(),
  uniformSize: z.string().trim().max(6).optional(),
  status: z.enum(['ativo', 'inativo', 'afastado', 'lesionado']).optional(),
  adminNotes: z.string().trim().max(1000).optional(),
  healthRestrictions: z.string().trim().max(1000).optional(),
  // `sem_posicao` é o sentinela do Select: o Radix não permite item com valor
  // vazio, então "nenhuma posição" precisa de um valor próprio.
  primaryPosition: z
    .enum(POSITION_CODES)
    .or(z.literal(''))
    .or(z.literal('sem_posicao'))
    .optional(),
});

type ParseResult =
  | { ok: true; input: AthleteInput }
  | { ok: false; error: string };

function isPositionCode(value: string): value is PositionCode {
  return (POSITION_CODES as readonly string[]).includes(value);
}

function parseAthleteForm(formData: FormData): ParseResult {
  const parsed = athleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const secondary = formData.getAll('secondaryPositions').map(String).filter(isPositionCode);
  const unwanted = formData.getAll('unwantedPositions').map(String).filter(isPositionCode);

  return {
    ok: true,
    input: {
      fullName: parsed.data.fullName,
      nickname: parsed.data.nickname || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      birthDate: parsed.data.birthDate || null,
      shirtNumber: parsed.data.shirtNumber ?? null,
      uniformSize: parsed.data.uniformSize || null,
      status: parsed.data.status ?? 'ativo',
      adminNotes: parsed.data.adminNotes || null,
      healthRestrictions: parsed.data.healthRestrictions || null,
      primaryPosition:
        parsed.data.primaryPosition && parsed.data.primaryPosition !== 'sem_posicao'
          ? parsed.data.primaryPosition
          : null,
      secondaryPositions: secondary,
      unwantedPositions: unwanted,
    },
  };
}

export async function createAthleteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAthleteForm(formData);
  if (!parsed.ok) return { ok: false, message: parsed.error };

  const actor = await getActor();
  let createdId: string | null = null;

  const result = await run(async () => {
    const created = await createAthlete(db, { actor, input: parsed.input });
    createdId = created.id;
  }, 'Atleta cadastrado.');

  if (!result.ok) return result;

  revalidatePath('/admin/atletas');
  if (createdId) redirect(`/admin/atletas/${createdId}`);
  return result;
}

export async function updateAthleteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const athleteId = String(formData.get('athleteId') ?? '');
  const parsed = parseAthleteForm(formData);
  if (!parsed.ok) return { ok: false, message: parsed.error };

  const actor = await getActor();

  const result = await run(
    () => updateAthlete(db, { actor, athleteId, patch: parsed.input }),
    'Atleta atualizado.',
  );

  revalidatePath('/admin/atletas');
  revalidatePath(`/admin/atletas/${athleteId}`);
  return result;
}

export async function deactivateAthleteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  const athleteId = String(formData.get('athleteId') ?? '');
  const reason = String(formData.get('reason') ?? '');

  const result = await run(
    () => deactivateAthlete(db, { actor, athleteId, reason }),
    'Atleta removido do grupo. O histórico foi preservado.',
  );

  revalidatePath('/admin/atletas');
  return result;
}

// ---------------------------------------------------------------------------
// Avaliação oficial
// ---------------------------------------------------------------------------

const ratingValue = z
  .string()
  .transform((value) => (value === '' || value === 'nao_avaliado' ? null : Number(value)))
  .refine(
    (value) =>
      value === null || RATING_VALUES.includes(value as (typeof RATING_VALUES)[number]),
    'Nota fora da escala.',
  );

export async function saveOfficialEvaluationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  const athleteId = String(formData.get('athleteId') ?? '');
  const justification = String(formData.get('justification') ?? '');
  const status = String(formData.get('status') ?? 'definitiva') as 'provisoria' | 'definitiva';

  const overall = ratingValue.safeParse(String(formData.get('overall') ?? ''));
  if (!overall.success) return { ok: false, message: 'Informe o nível geral oficial.' };

  const skills: Record<string, number | null> = {};
  for (const skill of SKILL_CODES) {
    const parsed = ratingValue.safeParse(String(formData.get(skill) ?? ''));
    if (!parsed.success) return { ok: false, message: `Nota inválida em "${skill}".` };
    skills[skill] = parsed.data;
  }

  const positions: Record<string, number | null> = {};
  for (const position of POSITION_CODES) {
    const raw = formData.get(`pos_${position}`);
    if (raw === null) continue;
    const parsed = ratingValue.safeParse(String(raw));
    if (parsed.success && parsed.data !== null) positions[position] = parsed.data;
  }

  const result = await run(
    () =>
      setOfficialEvaluation(db, {
        actor,
        athleteId,
        payload: {
          overall: overall.data,
          status,
          skills,
          positions,
          internalNote: String(formData.get('internalNote') ?? '') || null,
          justification,
        },
      }),
    'Avaliação oficial registrada. A alteração ficou no histórico.',
  );

  revalidatePath('/admin/avaliacoes');
  revalidatePath(`/admin/avaliacoes/${athleteId}`);
  revalidatePath('/admin');
  return result;
}

// ---------------------------------------------------------------------------
// Afinidades (visão administrativa)
// ---------------------------------------------------------------------------

export async function saveAdminAffinityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();

  const schema = z.object({
    fromAthleteId: z.string().uuid(),
    toAthleteId: z.string().uuid(),
    type: z.enum(['pessoal', 'tatica']),
    intensity: z.coerce.number().int().min(-3).max(3),
    rigidity: z.enum(['preferencia_flexivel', 'restricao_obrigatoria']),
    note: z.string().trim().max(300).optional(),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const result = await run(
    () => upsertAffinity(db, { actor, input: { ...parsed.data, note: parsed.data.note ?? null } }),
    parsed.data.rigidity === 'restricao_obrigatoria'
      ? 'Restrição obrigatória registrada. O gerador nunca vai violá-la.'
      : 'Preferência registrada.',
  );

  revalidatePath('/admin/afinidades');
  return result;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

const eventSchema = z.object({
  title: z.string().trim().min(3, 'Informe o título do encontro.'),
  type: z.enum(['encontro', 'treino', 'amistoso', 'campeonato', 'confraternizacao', 'outro']),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  venueName: z.string().trim().optional(),
  address: z.string().trim().optional(),
  notes: z.string().trim().max(600).optional(),
  capacity: z.coerce.number().int().min(2).max(60).optional(),
  teamCount: z.coerce.number().int().min(2).max(8).optional(),
  teamSize: z.coerce.number().int().min(2).max(12).optional(),
  valuePerAthlete: z.coerce.number().min(0).optional(),
  courtCost: z.coerce.number().min(0).optional(),
  confirmationDeadline: z.string().optional(),
});

export async function createEventAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const actor = await getActor();
  let createdId: string | null = null;

  const result = await run(async () => {
    const created = await createEvent(db, {
      actor,
      input: {
        title: parsed.data.title,
        type: parsed.data.type,
        eventDate: parsed.data.eventDate,
        startTime: parsed.data.startTime || null,
        endTime: parsed.data.endTime || null,
        venueName: parsed.data.venueName || null,
        address: parsed.data.address || null,
        notes: parsed.data.notes || null,
        confirmationDeadline: parsed.data.confirmationDeadline
          ? new Date(parsed.data.confirmationDeadline)
          : null,
        ...(parsed.data.capacity !== undefined ? { capacity: parsed.data.capacity } : {}),
        ...(parsed.data.teamCount !== undefined ? { teamCount: parsed.data.teamCount } : {}),
        ...(parsed.data.teamSize !== undefined ? { teamSize: parsed.data.teamSize } : {}),
        ...(parsed.data.valuePerAthlete !== undefined
          ? { valuePerAthleteCents: reaisToCents(parsed.data.valuePerAthlete) }
          : {}),
        ...(parsed.data.courtCost !== undefined
          ? { courtCostCents: reaisToCents(parsed.data.courtCost) }
          : {}),
      },
    });
    createdId = created.id;
  }, 'Encontro criado como rascunho.');

  if (!result.ok) return result;

  revalidatePath('/admin/eventos');
  if (createdId) redirect(`/admin/eventos/${createdId}`);
  return result;
}

export async function updateEventAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const eventId = String(formData.get('eventId') ?? '');
  const parsed = eventSchema.partial().safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const actor = await getActor();
  const { valuePerAthlete, courtCost, confirmationDeadline, ...rest } = parsed.data;

  const result = await run(
    () =>
      updateEvent(db, {
        actor,
        eventId,
        patch: {
          ...rest,
          ...(valuePerAthlete !== undefined
            ? { valuePerAthleteCents: reaisToCents(valuePerAthlete) }
            : {}),
          ...(courtCost !== undefined ? { courtCostCents: reaisToCents(courtCost) } : {}),
          ...(confirmationDeadline
            ? { confirmationDeadline: new Date(confirmationDeadline) }
            : {}),
        },
      }),
    'Encontro atualizado.',
  );

  revalidatePath(`/admin/eventos/${eventId}`);
  return result;
}

export async function setEventStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  const eventId = String(formData.get('eventId') ?? '');
  const status = String(formData.get('status') ?? '') as
    | 'rascunho'
    | 'publicado'
    | 'em_andamento'
    | 'finalizado'
    | 'cancelado';
  const reason = String(formData.get('reason') ?? '') || undefined;

  const labels: Record<string, string> = {
    publicado: 'Encontro publicado. O grupo já pode confirmar presença.',
    cancelado: 'Encontro cancelado.',
    finalizado: 'Encontro finalizado.',
    rascunho: 'Encontro voltou para rascunho.',
    em_andamento: 'Encontro em andamento.',
  };

  const result = await run(
    () => setEventStatus(db, { actor, eventId, status, ...(reason ? { reason } : {}) }),
    labels[status] ?? 'Situação atualizada.',
  );

  revalidatePath('/admin/eventos');
  revalidatePath(`/admin/eventos/${eventId}`);
  revalidatePath('/admin');
  return result;
}

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

export async function publishFormationAction(params: {
  eventId: string;
  strategy: BalancingStrategy | 'ajuste_manual';
  teams: string[][];
  provenance: unknown;
  metrics: unknown;
}): Promise<ActionState> {
  const actor = await getActor();

  const result = await run(
    () =>
      publishFormation(db, {
        actor,
        eventId: params.eventId,
        strategy: params.strategy,
        teams: params.teams,
        provenance: params.provenance,
        metrics: params.metrics,
      }),
    'Times publicados. O grupo já consegue ver.',
  );

  revalidatePath(`/admin/eventos/${params.eventId}/times`);
  revalidatePath('/app/times');
  revalidatePath('/app');
  return result;
}

// ---------------------------------------------------------------------------
// Painel de quadra
// ---------------------------------------------------------------------------

export async function startCourtSessionAction(eventId: string): Promise<ActionState> {
  const actor = await getActor();
  const result = await run(
    () => startCourtSession(db, { actor, eventId }),
    'Rodízio iniciado.',
  );
  revalidatePath(`/admin/eventos/${eventId}/quadra`);
  return result;
}

export async function finishMatchAction(params: {
  eventId: string;
  sessionId: string;
  leftScore: number | null;
  rightScore: number | null;
  winnerTeamId: string | null;
  stayingTeamIdOnTie?: string;
  override?: { leavingTeamId: string; justification: string };
}): Promise<ActionState> {
  const actor = await getActor();

  const result = await run(
    () =>
      finishMatch(db, {
        actor,
        sessionId: params.sessionId,
        outcome: {
          leftScore: params.leftScore,
          rightScore: params.rightScore,
          winnerTeamId: params.winnerTeamId,
        },
        ...(params.stayingTeamIdOnTie
          ? { stayingTeamIdOnTie: params.stayingTeamIdOnTie }
          : {}),
        ...(params.override ? { override: params.override } : {}),
      }),
    'Partida encerrada.',
  );

  revalidatePath(`/admin/eventos/${params.eventId}/quadra`);
  return result;
}

export async function undoMatchAction(eventId: string, sessionId: string): Promise<ActionState> {
  const actor = await getActor();
  const result = await run(
    () => undoLastFinishedMatch(db, { actor, sessionId }),
    'Última partida corrigida.',
  );
  revalidatePath(`/admin/eventos/${eventId}/quadra`);
  return result;
}

export async function finishSessionAction(
  eventId: string,
  sessionId: string,
): Promise<ActionState> {
  const actor = await getActor();
  const result = await run(
    () => finishCourtSession(db, { actor, sessionId }),
    'Encontro finalizado.',
  );
  revalidatePath(`/admin/eventos/${eventId}/quadra`);
  revalidatePath('/admin');
  return result;
}

// ---------------------------------------------------------------------------
// Financeiro
// ---------------------------------------------------------------------------

export async function generateChargesAction(eventId: string): Promise<ActionState> {
  const actor = await getActor();
  const result = await run(
    () => generateEventCharges(db, { actor, eventId }),
    'Cobranças geradas para os atletas confirmados.',
  );
  revalidatePath(`/admin/financeiro/eventos/${eventId}`);
  return result;
}

export async function registerPaymentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  const eventId = String(formData.get('eventId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  const amount = Number(formData.get('amount') ?? 0);
  const method = String(formData.get('method') ?? 'pix') as 'pix' | 'dinheiro' | 'outro';

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: 'Informe um valor maior que zero.' };
  }

  const result = await run(
    () =>
      registerPayment(db, {
        actor,
        eventId,
        athleteId,
        amountCents: reaisToCents(amount),
        method,
        note: String(formData.get('note') ?? '') || null,
      }),
    'Pagamento registrado.',
  );

  revalidatePath(`/admin/financeiro/eventos/${eventId}`);
  revalidatePath('/admin/financeiro');
  return result;
}

export async function adjustChargeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  const eventId = String(formData.get('eventId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  const status = String(formData.get('status') ?? '') as 'dispensado' | 'estornado' | 'pendente';
  const reason = String(formData.get('reason') ?? '');

  const result = await run(
    () => adjustCharge(db, { actor, eventId, athleteId, status, reason }),
    'Cobrança ajustada.',
  );

  revalidatePath(`/admin/financeiro/eventos/${eventId}`);
  return result;
}

export async function closeEventFinanceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  const eventId = String(formData.get('eventId') ?? '');
  const courtCostPaid = formData.get('courtCostPaid') === 'on';

  const result = await run(
    () => closeEventFinance(db, { actor, eventId, courtCostPaid }),
    'Financeiro do encontro fechado e incorporado ao caixa.',
  );

  revalidatePath(`/admin/financeiro/eventos/${eventId}`);
  revalidatePath('/admin/financeiro');
  revalidatePath('/admin');
  return result;
}

export async function addCashAdjustmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  const amount = Number(formData.get('amount') ?? 0);
  const direction = String(formData.get('direction') ?? 'entrada');
  const description = String(formData.get('description') ?? '');
  const reason = String(formData.get('reason') ?? '');

  if (!Number.isFinite(amount) || amount === 0) {
    return { ok: false, message: 'Informe um valor diferente de zero.' };
  }
  if (description.trim().length < 3) {
    return { ok: false, message: 'Descreva o ajuste.' };
  }

  const signed = direction === 'saida' ? -Math.abs(amount) : Math.abs(amount);

  const result = await run(
    () =>
      addManualAdjustment(db, {
        actor,
        amountCents: cents(Math.round(signed * 100)),
        description,
        reason,
      }),
    'Ajuste registrado no caixa.',
  );

  revalidatePath('/admin/financeiro');
  revalidatePath('/admin');
  return result;
}
