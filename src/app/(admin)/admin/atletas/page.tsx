import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, Panel, PanelBody, PanelHeader, PageHeader } from '@/components/ui/primitives';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { listAthletes, listPendingRegistrations } from '@/server/services/athletes';
import { AthletesTable } from './athletes-table';
import { QuickAthleteForm } from './quick-athlete-form';
import { RegistrationDecision } from './registration-decision';

export const metadata: Metadata = { title: 'Atletas' };

export default async function AdminAtletasPage() {
  const actor = await getActor();

  const [athletes, pending] = await Promise.all([
    listAthletes(db, { actor, includeInactive: true }),
    listPendingRegistrations(db, actor),
  ]);

  const withoutAccount = athletes.filter((a) => !a.hasAccount).length;
  const withoutEvaluation = athletes.filter((a) => a.officialOverall === null).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Atletas"
        description={`${athletes.length} no grupo · ${withoutAccount} sem conta · ${withoutEvaluation} sem avaliação oficial`}
        actions={
          <Link
            href="/admin/atletas/novo"
            className="bg-cva-navy-900 hover:bg-cva-navy-800 rounded-md px-4 py-2 text-sm font-semibold text-white"
          >
            Cadastrar atleta
          </Link>
        }
      />

      {pending.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Cadastros aguardando aprovação"
            description={`${pending.length} pessoa(s) criaram conta e aguardam liberação.`}
          />
          <PanelBody flush>
            <ul className="divide-cva-border divide-y">
              {pending.map((registration) => (
                <li key={registration.userId} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-cva-navy-900 text-sm font-semibold">
                        {registration.name}
                      </p>
                      <p className="text-cva-text-muted truncate text-xs">{registration.email}</p>
                    </div>
                  </div>

                  {registration.possibleMatchName ? (
                    <div className="mt-3">
                      <Callout
                        tone="warning"
                        title={
                          registration.possibleMatchReason === 'vinculo_solicitado'
                            ? 'Pediu para vincular a um perfil'
                            : 'Possível duplicidade'
                        }
                      >
                        {registration.possibleMatchReason === 'vinculo_solicitado' ? (
                          <>
                            No cadastro, os dados bateram com o perfil{' '}
                            <strong>{registration.possibleMatchName}</strong> (por e-mail ou
                            telefone). Aprovar e vincular liga a conta a esse perfil, sem duplicar.
                          </>
                        ) : (
                          <>
                            Já existe um perfil chamado{' '}
                            <strong>{registration.possibleMatchName}</strong> com o mesmo e-mail.
                            Vincular a conta a ele evita um cadastro repetido.
                          </>
                        )}
                      </Callout>
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <RegistrationDecision
                      userId={registration.userId}
                      name={registration.name}
                      matchAthleteId={registration.possibleMatchAthleteId}
                      matchName={registration.possibleMatchName}
                      matchReason={registration.possibleMatchReason}
                      athletes={athletes
                        .filter((a) => !a.hasAccount)
                        .map((a) => ({ id: a.id, displayName: a.nickname ?? a.fullName }))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      ) : null}

      <QuickAthleteForm />

      <AthletesTable athletes={athletes} />
    </div>
  );
}
