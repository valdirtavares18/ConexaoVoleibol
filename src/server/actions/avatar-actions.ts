'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { athletes } from '@/db/schema';
import { isDomainError } from '@/domain/shared/errors';
import type { ActionState } from '@/lib/action-state';
import { getActor } from '@/server/context';
import { requireAthleteEdit } from '@/server/policies';
import { recordAudit } from '@/server/services/audit';
import { uploadAvatar } from '@/server/storage';

/**
 * Troca da foto do atleta.
 *
 * O `athleteId` vem do formulário mas passa por `requireAthleteEdit`: um atleta
 * só edita o próprio perfil; administrador edita qualquer um. Sem essa checagem,
 * bastaria trocar o campo oculto para sobrescrever a foto de outra pessoa.
 */
export async function uploadAvatarAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getActor();
  const requested = String(formData.get('athleteId') ?? '');
  const athleteId = requested || actor?.athleteId;

  if (!athleteId) {
    return { ok: false, message: 'Sua conta ainda não está vinculada a um perfil de atleta.' };
  }

  const file = formData.get('avatar');
  if (!(file instanceof File)) {
    return { ok: false, message: 'Escolha um arquivo de imagem.' };
  }

  try {
    requireAthleteEdit(actor, athleteId);

    const stored = await uploadAvatar(file, athleteId);

    await db.transaction(async (tx) => {
      await tx
        .update(athletes)
        .set({ avatarUrl: stored.url, updatedAt: new Date() })
        .where(eq(athletes.id, athleteId));

      await recordAudit(tx, {
        actorUserId: actor?.userId ?? null,
        action: 'atleta.trocar_foto',
        entityType: 'athlete',
        entityId: athleteId,
        after: { avatarUrl: stored.url },
      });
    });

    revalidatePath('/app/perfil');
    revalidatePath('/admin/atletas');
    revalidatePath(`/admin/atletas/${athleteId}`);

    return { ok: true, message: 'Foto atualizada.' };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    throw error;
  }
}
