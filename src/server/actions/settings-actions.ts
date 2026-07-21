'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { clubSettings } from '@/db/schema';
import { isDomainError } from '@/domain/shared/errors';
import { reaisToCents } from '@/domain/shared/money';
import type { ActionState } from '@/lib/action-state';
import { getActor } from '@/server/context';
import { requireSettingsWrite } from '@/server/policies';
import { recordAudit } from '@/server/services/audit';

const settingsSchema = z.object({
  clubName: z.string().trim().min(2),
  shortName: z.string().trim().min(1).max(10),
  timezone: z.string().trim().min(3),
  defaultValuePerAthlete: z.coerce.number().min(0),
  defaultCourtCost: z.coerce.number().min(0),
  defaultCapacity: z.coerce.number().int().min(2).max(60),
  defaultTeamCount: z.coerce.number().int().min(2).max(8),
  defaultTeamSize: z.coerce.number().int().min(2).max(12),
  maxConsecutiveMatches: z.coerce.number().int().min(1).max(5),
  maxImbalancePct: z.coerce.number().min(0).max(100),
  provisionalReviewAfterEvents: z.coerce.number().int().min(1).max(50),
  recentPairingWindow: z.coerce.number().int().min(0).max(20),
  selfOfficialEvaluationVisible: z.union([z.literal('on'), z.undefined()]).optional(),
});

/**
 * Atualiza as configurações do clube (§19).
 *
 * O limite de desequilíbrio é guardado em **basis points** (inteiro) e não como
 * float: 5% vira 500. Assim "5,25%" é representável exatamente e a comparação
 * com o resultado do algoritmo não depende de arredondamento de ponto flutuante.
 */
export async function updateSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Confira os valores.' };
  }

  const data = parsed.data;

  if (data.defaultCapacity !== data.defaultTeamCount * data.defaultTeamSize) {
    return {
      ok: false,
      message: `A capacidade (${data.defaultCapacity}) não bate com ${data.defaultTeamCount} times de ${data.defaultTeamSize}. Ajuste um dos três.`,
    };
  }

  try {
    const admin = requireSettingsWrite(actor);

    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(clubSettings)
        .where(eq(clubSettings.id, 'default'))
        .limit(1);

      await tx
        .update(clubSettings)
        .set({
          clubName: data.clubName,
          shortName: data.shortName,
          timezone: data.timezone,
          defaultValuePerAthleteCents: reaisToCents(data.defaultValuePerAthlete),
          defaultCourtCostCents: reaisToCents(data.defaultCourtCost),
          defaultCapacity: data.defaultCapacity,
          defaultTeamCount: data.defaultTeamCount,
          defaultTeamSize: data.defaultTeamSize,
          maxConsecutiveMatches: data.maxConsecutiveMatches,
          maxImbalanceBasisPoints: Math.round(data.maxImbalancePct * 100),
          provisionalReviewAfterEvents: data.provisionalReviewAfterEvents,
          recentPairingWindow: data.recentPairingWindow,
          selfOfficialEvaluationVisible: data.selfOfficialEvaluationVisible === 'on',
          updatedByUserId: admin.userId,
          updatedAt: new Date(),
        })
        .where(eq(clubSettings.id, 'default'));

      await recordAudit(tx, {
        actorUserId: admin.userId,
        action: 'configuracoes.atualizar',
        entityType: 'club_settings',
        entityId: 'default',
        before: before
          ? {
              maxImbalanceBasisPoints: before.maxImbalanceBasisPoints,
              selfOfficialEvaluationVisible: before.selfOfficialEvaluationVisible,
              defaultValuePerAthleteCents: before.defaultValuePerAthleteCents,
            }
          : null,
        after: {
          maxImbalanceBasisPoints: Math.round(data.maxImbalancePct * 100),
          selfOfficialEvaluationVisible: data.selfOfficialEvaluationVisible === 'on',
          defaultValuePerAthleteCents: reaisToCents(data.defaultValuePerAthlete),
        },
      });
    });

    revalidatePath('/admin/configuracoes');
    revalidatePath('/admin');

    return { ok: true, message: 'Configurações atualizadas.' };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    throw error;
  }
}
