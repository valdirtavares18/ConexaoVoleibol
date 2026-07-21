import { describe, expect, it } from 'vitest';
import { buildEventInviteMessage, buildTeamsMessage, formatEventDate } from './sharing';
import type { TeamSummary } from './team-summaries';

const team = (index: number, name: string, members: string[]): TeamSummary => ({
  id: `t${index}`,
  index,
  name,
  colorToken: 'cva-navy',
  members: members.map((displayName, i) => ({ id: `a${index}${i}`, displayName })),
});

const EVENT = {
  title: 'Encontro de quarta',
  eventDate: '2026-07-22',
  startTime: '20:00:00',
  venueName: 'Ginásio do Centro',
  address: 'Rua dos Andradas, 1200',
  notes: 'Levar a camisa clara.',
};

const TEAMS = [
  team(0, 'Time A', ['Dricco', 'Caio', 'Dudu']),
  team(1, 'Time B', ['Bruninho', 'Guto', 'JV']),
  team(2, 'Time C', ['Diego', 'Rique', 'Leo']),
];

describe('mensagem de times para WhatsApp (§14)', () => {
  it('inclui evento, data, local, times e confronto inicial', () => {
    const message = buildTeamsMessage({ event: EVENT, teams: TEAMS });

    expect(message).toContain('Encontro de quarta');
    expect(message).toContain('quarta-feira, 22/07/2026');
    expect(message).toContain('às 20:00');
    expect(message).toContain('Ginásio do Centro');
    expect(message).toContain('*Time A*');
    expect(message).toContain('• Dricco');
    expect(message).toContain('Começam jogando: Time A x Time B');
    expect(message).toContain('Aguardando: Time C');
    expect(message).toContain('Levar a camisa clara.');
  });

  it('nunca vaza nota, afinidade, valor ou observação interna', () => {
    const message = buildTeamsMessage({ event: EVENT, teams: TEAMS });

    // O tipo `TeamSummary` já não carrega esses campos; o teste trava a regra
    // caso alguém amplie o tipo no futuro.
    expect(message).not.toMatch(/nota|avalia|afinidade|R\$|equil[íi]brio|interno/i);
  });

  it('formata a data sem escorregar de dia por fuso', () => {
    // Em America/Sao_Paulo (UTC-3), um `new Date('2026-01-01')` ingênuo cairia
    // em 31/12. A construção em UTC evita isso.
    expect(formatEventDate('2026-01-01')).toBe('quinta-feira, 01/01/2026');
    expect(formatEventDate('2026-12-31')).toBe('quinta-feira, 31/12/2026');
  });

  it('funciona sem local e sem observações', () => {
    const message = buildTeamsMessage({
      event: { ...EVENT, venueName: null, address: null, notes: null, startTime: null },
      teams: TEAMS,
    });

    expect(message).toContain('Encontro de quarta');
    expect(message).not.toContain('📍');
    expect(message).not.toContain('📝');
  });
});

describe('convite do encontro', () => {
  it('informa as vagas restantes', () => {
    const message = buildEventInviteMessage({
      event: EVENT,
      confirmedCount: 15,
      capacity: 18,
      appUrl: 'https://cva.exemplo.com/app',
    });

    expect(message).toContain('Restam 3 vagas de 18.');
    expect(message).toContain('https://cva.exemplo.com/app');
  });

  it('avisa que a próxima confirmação vai para a lista de espera', () => {
    const message = buildEventInviteMessage({
      event: EVENT,
      confirmedCount: 18,
      capacity: 18,
      appUrl: 'https://cva.exemplo.com/app',
    });

    expect(message).toContain('lista de espera');
  });

  it('usa singular com uma vaga só', () => {
    const message = buildEventInviteMessage({
      event: EVENT,
      confirmedCount: 17,
      capacity: 18,
      appUrl: 'https://cva.exemplo.com/app',
    });

    expect(message).toContain('Restam 1 vaga de 18.');
  });
});
