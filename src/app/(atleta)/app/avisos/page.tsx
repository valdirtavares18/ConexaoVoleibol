import type { Metadata } from 'next';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import {
  Badge,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { listNotifications, markAllRead } from '@/server/services/notifications';

export const metadata: Metadata = { title: 'Avisos' };

const KIND_LABELS: Record<string, string> = {
  comunicado: 'Comunicado',
  novo_evento: 'Novo jogo',
  confirmacao_presenca: 'Presença',
  lista_espera: 'Lista de espera',
  vaga_liberada: 'Vaga liberada',
  times_publicados: 'Times',
  avaliacao_pendente: 'Avaliação',
  revisao_provisoria: 'Avaliação',
};

/**
 * Avisos do atleta (§14).
 *
 * O botão de "marcar como lidas" é um `<form>` com server action inline — não
 * precisa de componente cliente para uma ação sem estado intermediário.
 */
export default async function AvisosPage() {
  const actor = await getActor();
  const items = await listNotifications(db, { actor, limit: 50 });

  async function markRead(): Promise<void> {
    'use server';
    const current = await getActor();
    await markAllRead(db, current);
    revalidatePath('/app/avisos');
    revalidatePath('/app');
  }

  const unread = items.filter((item) => !item.read).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Avisos"
        description={unread > 0 ? `${unread} não ${unread === 1 ? 'lido' : 'lidos'}` : 'Tudo lido.'}
        actions={
          unread > 0 ? (
            <form action={markRead}>
              <Button type="submit" variant="secondary" size="sm">
                Marcar todos como lidos
              </Button>
            </form>
          ) : null
        }
      />

      <Panel>
        <PanelHeader title="Recebidos" />
        <PanelBody flush>
          {items.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="Nenhum aviso ainda"
                description="Você recebe um aviso quando os times forem publicados, quando abrir uma vaga na lista de espera ou quando houver um comunicado do grupo."
              />
            </div>
          ) : (
            <ul className="divide-cva-border divide-y">
              {items.map((item) => {
                const content = (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-cva-navy-900 text-sm font-semibold">{item.title}</span>
                      {!item.read ? (
                        <Badge tone="gold" dot>
                          Novo
                        </Badge>
                      ) : null}
                      <span className="text-cva-text-muted text-xs">
                        {KIND_LABELS[item.kind] ?? item.kind}
                      </span>
                    </div>
                    <p className="text-cva-text mt-0.5 text-sm">{item.body}</p>
                    <p className="text-cva-text-muted mt-1 text-xs">
                      {item.createdAt.toLocaleString('pt-BR')}
                    </p>
                  </>
                );

                return (
                  <li key={item.id} className={item.read ? '' : 'bg-cva-gold-100/40'}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="hover:bg-cva-blue-100/35 block px-4 py-3 transition-colors sm:px-5"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="px-4 py-3 sm:px-5">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
