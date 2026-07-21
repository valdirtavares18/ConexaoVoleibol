import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AthleteAvatar,
  Badge,
  Callout,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from '@/components/ui/primitives';
import { db } from '@/db/client';
import { POSITION_BY_CODE } from '@/domain/positions';
import { getActor, getClubSettings } from '@/server/context';
import { getAthlete, getAthletePositions } from '@/server/services/athletes';
import { getCurrentSelfAssessment, getOfficialEvaluation } from '@/server/services/evaluations';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Perfil' };

export default async function PerfilPage() {
  const actor = await getActor();

  if (!actor?.athleteId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Perfil" />
        <Callout tone="warning" title="Conta ainda não vinculada">
          Sua conta existe, mas ainda não está ligada a um perfil de atleta. Um administrador
          precisa fazer esse vínculo para você confirmar presença e entrar nos times.
        </Callout>
      </div>
    );
  }

  const settings = await getClubSettings();

  const [athlete, positions, selfAssessment, official] = await Promise.all([
    getAthlete(db, { actor, athleteId: actor.athleteId }),
    getAthletePositions(db, actor.athleteId),
    getCurrentSelfAssessment(db, actor.athleteId),
    getOfficialEvaluation(db, {
      actor,
      athleteId: actor.athleteId,
      selfVisible: settings.selfOfficialEvaluationVisible,
    }),
  ]);

  if (!athlete) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Perfil" />
        <Callout tone="danger" title="Perfil não encontrado">
          Fale com um administrador do grupo.
        </Callout>
      </div>
    );
  }

  // `sanitizeAthlete` já removeu do objeto o que não pode ser visto. Estes
  // campos existem porque é o próprio atleta consultando a si mesmo.
  const self = athlete as typeof athlete & {
    phone?: string | null;
    email?: string | null;
    birthDate?: string | null;
    uniformSize?: string | null;
    athleteNotes?: string | null;
    healthRestrictions?: string | null;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Perfil" description="Seus dados no grupo." />

      <Panel>
        <PanelBody className="flex flex-wrap items-center gap-4">
          <AthleteAvatar name={athlete.fullName} avatarUrl={athlete.avatarUrl} size={64} />
          <div className="min-w-0">
            <p className="text-cva-navy-900 text-lg font-semibold">{athlete.fullName}</p>
            <p className="text-cva-text-muted text-sm">
              {athlete.nickname ? `“${athlete.nickname}”` : 'Sem apelido cadastrado'}
              {athlete.shirtNumber ? ` · camisa ${athlete.shirtNumber}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={athlete.status === 'ativo' ? 'success' : 'warning'} dot>
                {athlete.status === 'ativo'
                  ? 'Ativo'
                  : athlete.status === 'lesionado'
                    ? 'Lesionado'
                    : athlete.status === 'afastado'
                      ? 'Afastado'
                      : 'Inativo'}
              </Badge>
              {positions.primary ? (
                <Badge tone="info">{POSITION_BY_CODE[positions.primary].name}</Badge>
              ) : null}
              {positions.secondary.map((position) => (
                <Badge key={position} tone="neutral">
                  {POSITION_BY_CODE[position].name}
                </Badge>
              ))}
            </div>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Seus dados" description="Você pode editar estes campos." />
        <PanelBody>
          <ProfileForm
            initial={{
              nickname: self.nickname ?? '',
              phone: self.phone ?? '',
              email: self.email ?? '',
              birthDate: self.birthDate ?? '',
              uniformSize: self.uniformSize ?? '',
              athleteNotes: self.athleteNotes ?? '',
            }}
          />
        </PanelBody>
      </Panel>

      {self.healthRestrictions ? (
        <Panel>
          <PanelHeader
            title="Restrições registradas"
            description="Visível apenas para você e os administradores."
          />
          <PanelBody>
            <p className="text-cva-text text-sm">{self.healthRestrictions}</p>
          </PanelBody>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader title="Avaliação" />
        <PanelBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-cva-text text-sm font-medium">Autoavaliação</p>
              <p className="text-cva-text-muted text-xs">
                {selfAssessment
                  ? `Revisão ${selfAssessment.revision} enviada.`
                  : 'Ainda não enviada.'}
              </p>
            </div>
            <Link
              href="/app/autoavaliacao"
              className="border-cva-border-strong bg-cva-panel text-cva-navy-900 hover:bg-cva-blue-100/50 rounded-md border px-3 py-1.5 text-sm font-semibold"
            >
              {selfAssessment ? 'Revisar' : 'Preencher'}
            </Link>
          </div>

          <hr className="border-cva-border" />

          <div>
            <p className="text-cva-text text-sm font-medium">Avaliação oficial</p>
            {official ? (
              <p data-numeric className="text-cva-navy-900 mt-0.5 text-2xl font-semibold">
                {official.overall?.toFixed(1) ?? '—'}
                {official.status === 'provisoria' ? (
                  <span className="ml-2 align-middle">
                    <Badge tone="warning">Provisória</Badge>
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-cva-text-muted mt-0.5 text-xs">
                As avaliações oficiais são usadas apenas para montar times equilibrados e não ficam
                visíveis. Não existe ranking no CVA.
              </p>
            )}
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Preferências de time" />
        <PanelBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-cva-text-muted text-sm">
            Com quem você prefere jogar junto ou separado. É privado.
          </p>
          <Link
            href="/app/preferencias"
            className="border-cva-border-strong bg-cva-panel text-cva-navy-900 hover:bg-cva-blue-100/50 rounded-md border px-3 py-1.5 text-sm font-semibold"
          >
            Gerenciar
          </Link>
        </PanelBody>
      </Panel>
    </div>
  );
}
