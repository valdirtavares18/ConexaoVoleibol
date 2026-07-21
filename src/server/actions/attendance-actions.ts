'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { isDomainError } from '@/domain/shared/errors';
import type { ActionState } from '@/lib/action-state';
import {
  respondToEvent,
  reorderWaitlist,
  type AttendanceResponse,
} from '@/server/services/attendance';
import { getActor } from '@/server/context';

/**
 * Server actions de presença.
 *
 * As actions são a fronteira: validam a entrada com Zod, buscam o ator no
 * servidor (**nunca** confiando em um id vindo do formulário) e delegam ao
 * serviço, que aplica a policy. Erros de domínio viram mensagem em pt-BR;
 * qualquer outro erro sobe, para não mascarar falha real.
 */

const respondSchema = z.object({
  eventId: z.string().uuid(),
  response: z.enum(['confirmar', 'talvez', 'nao_participar', 'cancelar']),
  /** Só administradores podem informar — a policy recusa para os demais. */
  athleteId: z.string().uuid().optional(),
});

export async function respondToEventAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = respondSchema.safeParse({
    eventId: formData.get('eventId'),
    response: formData.get('response'),
    athleteId: formData.get('athleteId') ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: 'Não foi possível registrar a resposta. Tente de novo.' };
  }

  const actor = await getActor();
  if (!actor) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };

  // Sem `athleteId` explícito, a ação vale para o próprio ator. O id do
  // formulário só é aceito porque a policy exige perfil de administrador.
  const athleteId = parsed.data.athleteId ?? actor.athleteId;
  if (!athleteId) {
    return {
      ok: false,
      message: 'Sua conta ainda não está vinculada a um perfil de atleta.',
    };
  }

  try {
    const result = await respondToEvent(db, {
      actor,
      eventId: parsed.data.eventId,
      athleteId,
      response: parsed.data.response as AttendanceResponse,
      onBehalf: parsed.data.athleteId !== undefined,
    });

    revalidatePath('/app');
    revalidatePath('/app/agenda');
    revalidatePath(`/app/eventos/${parsed.data.eventId}`);
    revalidatePath(`/admin/eventos/${parsed.data.eventId}/presencas`);

    const message =
      result.status === 'confirmado'
        ? 'Presença confirmada.'
        : result.status === 'lista_espera'
          ? `As vagas estão preenchidas. Você entrou na lista de espera na posição ${result.waitlistPosition}.`
          : result.status === 'talvez'
            ? 'Marcado como “talvez”.'
            : result.promotedAthleteId
              ? 'Presença cancelada. O primeiro da lista de espera foi confirmado.'
              : 'Presença cancelada.';

    return { ok: true, message };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    throw error;
  }
}

const reorderSchema = z.object({
  eventId: z.string().uuid(),
  athleteIds: z.array(z.string().uuid()),
});

export async function reorderWaitlistAction(
  eventId: string,
  athleteIds: string[],
): Promise<ActionState> {
  const parsed = reorderSchema.safeParse({ eventId, athleteIds });
  if (!parsed.success) return { ok: false, message: 'Ordem inválida.' };

  const actor = await getActor();

  try {
    await reorderWaitlist(db, {
      actor,
      eventId: parsed.data.eventId,
      orderedAthleteIds: parsed.data.athleteIds,
    });

    revalidatePath(`/admin/eventos/${eventId}/presencas`);
    return { ok: true, message: 'Fila reordenada.' };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    throw error;
  }
}
