import type { Metadata } from 'next';
import { Panel, PanelBody, PanelHeader, PageHeader } from '@/components/ui/primitives';
import { formatCents } from '@/domain/shared/money';
import { cents } from '@/domain/shared/money';
import { getClubSettings } from '@/server/context';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Configurações' };

export default async function ConfiguracoesPage() {
  const settings = await getClubSettings();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações do clube"
        description="Os padrões usados em novos jogos e no gerador de times."
      />

      <SettingsForm
        settings={{
          clubName: settings.clubName,
          shortName: settings.shortName,
          timezone: settings.timezone,
          defaultValuePerAthlete: settings.defaultValuePerAthleteCents / 100,
          defaultCourtCost: settings.defaultCourtCostCents / 100,
          defaultCapacity: settings.defaultCapacity,
          defaultTeamCount: settings.defaultTeamCount,
          defaultTeamSize: settings.defaultTeamSize,
          maxConsecutiveMatches: settings.maxConsecutiveMatches,
          maxImbalancePct: settings.maxImbalanceBasisPoints / 100,
          provisionalReviewAfterEvents: settings.provisionalReviewAfterEvents,
          selfOfficialEvaluationVisible: settings.selfOfficialEvaluationVisible,
          recentPairingWindow: settings.recentPairingWindow,
        }}
      />

      <Panel>
        <PanelHeader title="Valores em vigor" />
        <PanelBody>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ['Valor por atleta', formatCents(cents(settings.defaultValuePerAthleteCents))],
              ['Custo padrão da quadra', formatCents(cents(settings.defaultCourtCostCents))],
              [
                'Arrecadação esperada',
                formatCents(cents(settings.defaultValuePerAthleteCents * settings.defaultCapacity)),
              ],
              [
                'Excedente esperado',
                formatCents(
                  cents(
                    settings.defaultValuePerAthleteCents * settings.defaultCapacity -
                      settings.defaultCourtCostCents,
                  ),
                ),
              ],
              ['Formato', `${settings.defaultTeamCount} times de ${settings.defaultTeamSize}`],
              ['Limite de desequilíbrio', `${settings.maxImbalanceBasisPoints / 100}%`],
              ['Partidas consecutivas', `no máximo ${settings.maxConsecutiveMatches} seguidas`],
              [
                'Revisão de provisória',
                `após ${settings.provisionalReviewAfterEvents} participações`,
              ],
              [
                'Atleta vê a própria nota oficial',
                settings.selfOfficialEvaluationVisible ? 'Sim' : 'Não',
              ],
              ['Fuso horário', settings.timezone],
            ].map(([label, value]) => (
              <div key={label} className="border-cva-border flex justify-between border-b py-1.5">
                <dt className="text-cva-text-muted">{label}</dt>
                <dd data-numeric className="text-cva-navy-900 font-medium">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </PanelBody>
      </Panel>
    </div>
  );
}
