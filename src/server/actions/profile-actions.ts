'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { POSITION_CODES, SKILL_CODES } from '@/domain/positions';
import { isDomainError } from '@/domain/shared/errors';
import { RATING_VALUES } from '@/domain/shared/rating';
import { getActor } from '@/server/context';
import { upsertAffinity, deleteAffinity } from '@/server/services/affinities';
import { updateAthlete } from '@/server/services/athletes';
import { submitSelfAssessment } from '@/server/services/evaluations';
import type { ActionState } from '@/lib/action-state';

/** Nota da autoavaliação: um dos valores da escala, ou "não sei avaliar". */
const ratingField = z
  .union([z.enum(['', 'nao_sei']), z.coerce.number()])
  .transform((value) => {
    if (value === '' || value === 'nao_sei') return null;
    return typeof value === 'number' ? value : null;
  })
  .refine(
    (value) => value === null || RATING_VALUES.includes(value as (typeof RATING_VALUES)[number]),
    'Nota fora da escala de 1 a 5.',
  );

const profileSchema = z.object({
  nickname: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email('E-mail inválido.').or(z.literal('')).optional(),
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(''))
    .optional(),
  uniformSize: z.string().trim().max(6).optional(),
  athleteNotes: z.string().trim().max(500).optional(),
});

export async function updateProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  if (!actor?.athleteId) {
    return { ok: false, message: 'Sua conta ainda não está vinculada a um perfil de atleta.' };
  }

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Confira os dados informados.',
    };
  }

  try {
    // Campos vazios viram `null` em vez de string vazia, para que a coluna
    // reflita "não informado" e os índices únicos parciais continuem valendo.
    await updateAthlete(db, {
      actor,
      athleteId: actor.athleteId,
      patch: {
        fullName: '', // ignorado pelo filtro de campos editáveis do atleta
        nickname: parsed.data.nickname || null,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        birthDate: parsed.data.birthDate || null,
        uniformSize: parsed.data.uniformSize || null,
        athleteNotes: parsed.data.athleteNotes || null,
      },
    });

    revalidatePath('/app/perfil');
    return { ok: true, message: 'Perfil atualizado.' };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    throw error;
  }
}

export async function submitSelfAssessmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  if (!actor?.athleteId) {
    return { ok: false, message: 'Sua conta ainda não está vinculada a um perfil de atleta.' };
  }

  const overall = ratingField.safeParse(formData.get('overall') ?? '');
  if (!overall.success) return { ok: false, message: 'Escolha o seu nível geral.' };

  const skills: Record<string, number | null> = {};
  for (const skill of SKILL_CODES) {
    const parsed = ratingField.safeParse(formData.get(skill) ?? '');
    if (!parsed.success) {
      return { ok: false, message: `Nota inválida em "${skill}".` };
    }
    skills[skill] = parsed.data;
  }

  const positions: Record<string, number | null> = {};
  for (const position of POSITION_CODES) {
    const raw = formData.get(`pos_${position}`);
    if (raw === null) continue;
    const parsed = ratingField.safeParse(raw);
    if (parsed.success && parsed.data !== null) positions[position] = parsed.data;
  }

  const note = String(formData.get('note') ?? '').trim();

  try {
    const { revision } = await submitSelfAssessment(db, {
      actor,
      athleteId: actor.athleteId,
      payload: {
        overall: overall.data,
        note: note || null,
        skills,
        positions,
      },
    });

    revalidatePath('/app/autoavaliacao');
    revalidatePath('/app');

    return {
      ok: true,
      message:
        revision === 1
          ? 'Autoavaliação enviada. Ela serve como referência para os administradores.'
          : `Autoavaliação atualizada (revisão ${revision}). As anteriores ficam guardadas no histórico.`,
    };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    throw error;
  }
}

const affinitySchema = z.object({
  toAthleteId: z.string().uuid('Escolha um atleta.'),
  type: z.enum(['pessoal', 'tatica']),
  intensity: z.coerce.number().int().min(-3).max(3),
});

export async function saveAffinityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  if (!actor?.athleteId) {
    return { ok: false, message: 'Sua conta ainda não está vinculada a um perfil de atleta.' };
  }

  const parsed = affinitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Preferência inválida.' };
  }

  try {
    await upsertAffinity(db, {
      actor,
      input: {
        fromAthleteId: actor.athleteId,
        toAthleteId: parsed.data.toAthleteId,
        type: parsed.data.type,
        intensity: parsed.data.intensity,
        // Atleta nunca cria restrição obrigatória — a policy também recusaria.
        rigidity: 'preferencia_flexivel',
      },
    });

    revalidatePath('/app/preferencias');
    return {
      ok: true,
      message:
        parsed.data.intensity === 0
          ? 'Preferência removida.'
          : 'Preferência salva. Ela é privada: a outra pessoa não fica sabendo.',
    };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    throw error;
  }
}

export async function deleteAffinityAction(affinityId: string): Promise<ActionState> {
  const actor = await getActor();

  try {
    await deleteAffinity(db, { actor, affinityId });
    revalidatePath('/app/preferencias');
    return { ok: true, message: 'Preferência removida.' };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    throw error;
  }
}
