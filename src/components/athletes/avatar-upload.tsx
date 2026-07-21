'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { AthleteAvatar, Callout } from '@/components/ui/primitives';
import { EMPTY_ACTION_STATE } from '@/lib/action-state';
import { uploadAvatarAction } from '@/server/actions/avatar-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? 'Enviando…' : 'Salvar foto'}
    </Button>
  );
}

/**
 * Troca da foto do atleta.
 *
 * Mostra a prévia local antes de enviar — em conexão de celular, descobrir que
 * escolheu a foto errada só depois do upload é frustrante. A prévia usa
 * `URL.createObjectURL`, revogada ao trocar de arquivo para não vazar memória.
 */
export function AvatarUpload({
  athleteId,
  name,
  currentUrl,
}: {
  athleteId: string;
  name: string;
  currentUrl: string | null;
}) {
  const [state, formAction] = useActionState(uploadAvatarAction, EMPTY_ACTION_STATE);
  const [preview, setPreview] = useState<string | null>(null);
  const previousPreview = useRef<string | null>(null);

  const onPick = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (previousPreview.current) URL.revokeObjectURL(previousPreview.current);

    if (!file) {
      setPreview(null);
      previousPreview.current = null;
      return;
    }

    const url = URL.createObjectURL(file);
    previousPreview.current = url;
    setPreview(url);
  };

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="athleteId" value={athleteId} />

      {state.message ? (
        <Callout tone={state.ok ? 'success' : 'danger'}>{state.message}</Callout>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Prévia da nova foto"
            className="size-16 rounded-full object-cover"
          />
        ) : (
          <AthleteAvatar name={name} avatarUrl={currentUrl} size={64} />
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="avatar" className="text-cva-text text-sm font-medium">
            Foto do perfil
          </label>
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            className="text-cva-text file:border-cva-border-strong file:bg-cva-panel file:text-cva-navy-900 text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:font-semibold"
          />
          <p className="text-cva-text-muted text-xs">JPG, PNG ou WEBP, até 2 MB.</p>
        </div>
      </div>

      {preview ? (
        <div>
          <SubmitButton />
        </div>
      ) : null}
    </form>
  );
}
