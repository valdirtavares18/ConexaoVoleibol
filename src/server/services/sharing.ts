import type { TeamSummary } from './team-summaries';

/**
 * Texto compartilhável dos times (§14).
 *
 * Contém **apenas** o que pode ser público: evento, data, local, composição dos
 * times, confronto inicial e observações. Nunca notas, afinidades, valores ou
 * observações internas — por isso esta função recebe `TeamSummary`, que já não
 * carrega nenhum desses campos, em vez de receber a formação completa.
 */

export interface ShareableEvent {
  title: string;
  eventDate: string;
  startTime: string | null;
  venueName: string | null;
  address: string | null;
  notes: string | null;
}

const WEEKDAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const;

export function formatEventDate(isoDate: string): string {
  // Constrói em UTC para que a data não escorregue um dia por fuso.
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = WEEKDAYS[date.getUTCDay()] ?? '';
  return `${weekday}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

export function buildTeamsMessage(params: {
  event: ShareableEvent;
  teams: readonly TeamSummary[];
  clubShortName?: string;
}): string {
  const { event, teams } = params;
  const lines: string[] = [];

  lines.push(`🏐 ${params.clubShortName ?? 'CVA'} — ${event.title}`);
  lines.push('');
  lines.push(
    `📅 ${formatEventDate(event.eventDate)}${event.startTime ? ` às ${event.startTime.slice(0, 5)}` : ''}`,
  );

  if (event.venueName) {
    lines.push(`📍 ${event.venueName}${event.address ? ` — ${event.address}` : ''}`);
  }

  lines.push('');
  lines.push('*TIMES*');

  for (const team of teams) {
    lines.push('');
    lines.push(`*${team.name}*`);
    for (const member of team.members) {
      lines.push(`• ${member.displayName}`);
    }
  }

  if (teams.length >= 3) {
    const [a, b, c] = teams as [TeamSummary, TeamSummary, TeamSummary];
    lines.push('');
    lines.push(`▶️ Começam jogando: ${a.name} x ${b.name}`);
    lines.push(`⏳ Aguardando: ${c.name}`);
  }

  if (event.notes) {
    lines.push('');
    lines.push(`📝 ${event.notes}`);
  }

  return lines.join('\n');
}

/** Link `wa.me` com a mensagem já codificada. */
export function buildWhatsAppLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildEventInviteMessage(params: {
  event: ShareableEvent;
  confirmedCount: number;
  capacity: number;
  appUrl: string;
  clubShortName?: string;
}): string {
  const { event } = params;
  const remaining = Math.max(0, params.capacity - params.confirmedCount);

  const lines = [
    `🏐 ${params.clubShortName ?? 'CVA'} — ${event.title}`,
    '',
    `📅 ${formatEventDate(event.eventDate)}${event.startTime ? ` às ${event.startTime.slice(0, 5)}` : ''}`,
  ];

  if (event.venueName) {
    lines.push(`📍 ${event.venueName}${event.address ? ` — ${event.address}` : ''}`);
  }

  lines.push('');
  lines.push(
    remaining > 0
      ? `Restam ${remaining} ${remaining === 1 ? 'vaga' : 'vagas'} de ${params.capacity}.`
      : `As ${params.capacity} vagas estão preenchidas — quem confirmar entra na lista de espera.`,
  );

  if (event.notes) {
    lines.push('');
    lines.push(`📝 ${event.notes}`);
  }

  lines.push('');
  lines.push(`Confirme em: ${params.appUrl}`);

  return lines.join('\n');
}
