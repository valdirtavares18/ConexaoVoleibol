import { config as loadEnv } from 'dotenv';
import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  affinities,
  athleteAccountLinks,
  athletePositions,
  athletes,
  cashTransactions,
  clubSettings,
  courtRotationSessions,
  eventCharges,
  eventParticipants,
  eventPayments,
  events,
  extraEventCharges,
  extraFinancialEvents,
  matches,
  officialEvaluationSkills,
  officialEvaluations,
  positions as positionsTable,
  selfAssessmentSkills,
  selfAssessments,
  teamFormations,
  teamMembers,
  teams,
  userRoles,
  users,
} from '@/db/schema';
import { DEFAULT_POSITIONS, SKILL_CODES, type PositionCode } from '@/domain/positions';
import { completeMatch, startSession } from '@/domain/rotation';
import { createPrng } from '@/domain/shared/prng';
import { generateFormations } from '@/domain/team-balancing';
import { reaisToCents } from '@/domain/shared/money';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/**
 * Seed de **demonstração** (§24).
 *
 * Separado dos dados de produção por duas travas:
 *  1. Recusa rodar com `NODE_ENV=production` sem `ALLOW_DEMO_SEED=true`.
 *  2. Todos os registros criados aqui usam e-mails `@demo.cva.local`, o que
 *     torna trivial identificá-los e removê-los depois.
 *
 * Os nomes são fictícios — nenhum atleta real do grupo aparece aqui.
 */

const DEMO_DOMAIN = 'demo.cva.local';
const PRNG = createPrng(20231106); // data de criação do grupo, como seed fixa

interface DemoAthlete {
  name: string;
  nickname: string;
  shirt: number;
  primary: PositionCode;
  secondary: PositionCode[];
  overall: number;
  provisional: boolean;
}

/** 18 atletas fictícios com níveis, posições e perfis variados. */
const DEMO_ATHLETES: DemoAthlete[] = [
  { name: 'Adriano Bueno', nickname: 'Dricco', shirt: 1, primary: 'levantador', secondary: ['oposto'], overall: 4.5, provisional: false },
  { name: 'Bruno Cardoso', nickname: 'Bruninho', shirt: 2, primary: 'ponteiro', secondary: ['oposto'], overall: 5, provisional: false },
  { name: 'Caio Ferreira', nickname: 'Caio', shirt: 3, primary: 'central', secondary: [], overall: 4, provisional: false },
  { name: 'Diego Nunes', nickname: 'Diego', shirt: 4, primary: 'oposto', secondary: ['ponteiro'], overall: 4.5, provisional: false },
  { name: 'Eduardo Lima', nickname: 'Dudu', shirt: 5, primary: 'libero', secondary: [], overall: 4, provisional: false },
  { name: 'Fábio Rocha', nickname: 'Fabinho', shirt: 6, primary: 'ponteiro', secondary: ['central'], overall: 3.5, provisional: false },
  { name: 'Gustavo Peixoto', nickname: 'Guto', shirt: 7, primary: 'levantador', secondary: ['libero'], overall: 3.5, provisional: false },
  { name: 'Henrique Dias', nickname: 'Rique', shirt: 8, primary: 'central', secondary: ['oposto'], overall: 3.5, provisional: false },
  { name: 'Igor Menezes', nickname: 'Igor', shirt: 9, primary: 'ponteiro', secondary: [], overall: 3, provisional: false },
  { name: 'João Vitor Alves', nickname: 'JV', shirt: 10, primary: 'oposto', secondary: ['ponteiro'], overall: 3, provisional: false },
  { name: 'Kleber Antunes', nickname: 'Kleber', shirt: 11, primary: 'central', secondary: [], overall: 3, provisional: false },
  { name: 'Leandro Muniz', nickname: 'Leo', shirt: 12, primary: 'levantador', secondary: ['ponteiro'], overall: 3, provisional: true },
  { name: 'Marcelo Prates', nickname: 'Marcelo', shirt: 13, primary: 'ponteiro', secondary: ['libero'], overall: 2.5, provisional: false },
  { name: 'Nelson Barros', nickname: 'Nelson', shirt: 14, primary: 'libero', secondary: [], overall: 2.5, provisional: false },
  { name: 'Otávio Ramos', nickname: 'Otávio', shirt: 15, primary: 'central', secondary: ['ponteiro'], overall: 2.5, provisional: true },
  { name: 'Paulo Ricardo Souza', nickname: 'PR', shirt: 16, primary: 'ponteiro', secondary: [], overall: 2, provisional: false },
  { name: 'Rafael Coelho', nickname: 'Rafa', shirt: 17, primary: 'oposto', secondary: ['central'], overall: 2, provisional: true },
  { name: 'Sérgio Vasques', nickname: 'Serginho', shirt: 18, primary: 'coringa', secondary: ['libero'], overall: 1.5, provisional: false },
];

/** Nota de fundamento variando de forma determinística ao redor da nota geral. */
function skillFor(overall: number, index: number): string {
  const delta = [(index % 5) - 2][0] as number;
  const value = Math.min(5, Math.max(1, overall + delta * 0.5));
  return value.toFixed(1);
}

function isoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Seed de demonstração bloqueado em produção. Defina ALLOW_DEMO_SEED=true se for mesmo isso que você quer.',
    );
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida.');

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    await db.transaction(async (tx) => {
      await seedFoundation(tx as unknown as PostgresJsDatabase);
      const athleteIds = await seedAthletes(tx as unknown as PostgresJsDatabase);
      await seedAffinities(tx as unknown as PostgresJsDatabase, athleteIds);
      await seedFinishedEvent(tx as unknown as PostgresJsDatabase, athleteIds, {
        title: 'Encontro de quarta',
        date: isoDate(-14),
        courtCostReais: 150,
        paidCount: 18,
      });
      await seedFinishedEvent(tx as unknown as PostgresJsDatabase, athleteIds, {
        title: 'Encontro de sábado',
        date: isoDate(-7),
        courtCostReais: 160,
        paidCount: 17,
      });
      await seedUpcomingEvent(tx as unknown as PostgresJsDatabase, athleteIds);
      await seedBarbecue(tx as unknown as PostgresJsDatabase, athleteIds);
    });

    console.log('\nSeed de demonstração aplicado.');
    console.log(`18 atletas, 2 encontros finalizados, 1 encontro aberto e 1 confraternização.`);
    console.log(`Contas de demonstração usam o domínio @${DEMO_DOMAIN} (senha: demo123456789).\n`);
  } finally {
    await client.end();
  }
}

async function seedFoundation(db: PostgresJsDatabase): Promise<void> {
  await db.insert(clubSettings).values({ id: 'default' }).onConflictDoNothing();

  for (const position of DEFAULT_POSITIONS) {
    await db
      .insert(positionsTable)
      .values({
        code: position.code,
        name: position.name,
        shortName: position.shortName,
        description: position.description,
        sortOrder: position.sortOrder,
      })
      .onConflictDoNothing();
  }
}

async function seedAthletes(db: PostgresJsDatabase): Promise<string[]> {
  const passwordHash = await hash('demo123456789', {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const ids: string[] = [];

  for (const [index, demo] of DEMO_ATHLETES.entries()) {
    const [athlete] = await db
      .insert(athletes)
      .values({
        fullName: demo.name,
        nickname: demo.nickname,
        shirtNumber: demo.shirt,
        uniformSize: ['P', 'M', 'G', 'GG'][index % 4],
        phone: `5555999${String(10000 + index).slice(-5)}`,
        email: `${demo.nickname.toLowerCase().replace(/[^a-z]/g, '')}@${DEMO_DOMAIN}`,
        joinedAt: isoDate(-400 + index * 12),
        status: 'ativo',
        athleteNotes: index % 5 === 0 ? 'Prefiro jogar na entrada de rede.' : null,
        adminNotes: index === 12 ? 'Costuma avisar em cima da hora quando não vem.' : null,
        healthRestrictions: index === 4 ? 'Tendinite no ombro direito — evitar saque viagem.' : null,
      })
      .returning({ id: athletes.id });

    const athleteId = athlete?.id as string;
    ids.push(athleteId);

    // --- Posições ---------------------------------------------------------
    await db.insert(athletePositions).values({
      athleteId,
      position: demo.primary,
      role: 'principal',
    });

    for (const secondary of demo.secondary) {
      await db
        .insert(athletePositions)
        .values({ athleteId, position: secondary, role: 'secundaria' })
        .onConflictDoNothing();
    }

    // Alguns atletas declaram uma posição que preferem não jogar.
    if (index % 6 === 3 && demo.primary !== 'libero') {
      await db
        .insert(athletePositions)
        .values({ athleteId, position: 'libero', role: 'indesejada' })
        .onConflictDoNothing();
    }

    // --- Conta de acesso, para metade dos atletas -------------------------
    // A outra metade fica como perfil gerenciado pelo admin (§5.2), que é o
    // caso real de quem ainda não criou conta.
    if (index % 2 === 0) {
      const [user] = await db
        .insert(users)
        .values({
          email: `${demo.nickname.toLowerCase().replace(/[^a-z]/g, '')}@${DEMO_DOMAIN}`,
          name: demo.name,
          passwordHash,
          status: 'ativo',
        })
        .returning({ id: users.id });

      await db.insert(userRoles).values({ userId: user?.id as string, role: 'atleta' });
      await db.insert(athleteAccountLinks).values({
        athleteId,
        userId: user?.id as string,
        status: 'aprovado',
        origin: 'convite',
        decidedAt: new Date(),
      });
    }

    // --- Avaliação oficial ------------------------------------------------
    const [evaluation] = await db
      .insert(officialEvaluations)
      .values({
        athleteId,
        revision: 1,
        overall: demo.overall.toFixed(1),
        status: demo.provisional ? 'provisoria' : 'definitiva',
        isCurrent: true,
        internalNote: demo.provisional ? 'Entrou há pouco tempo, revisar após 3 encontros.' : null,
        justification: 'Avaliação inicial de demonstração.',
      })
      .returning({ id: officialEvaluations.id });

    await db.insert(officialEvaluationSkills).values(
      SKILL_CODES.map((skill, skillIndex) => ({
        evaluationId: evaluation?.id as string,
        skill,
        rating: skillFor(demo.overall, skillIndex + index),
      })),
    );

    // --- Autoavaliação: propositalmente diferente da oficial ---------------
    // Serve para demonstrar a comparação lado a lado e provar que a nota do
    // atleta não altera a oficial.
    const selfOverall = Math.min(5, Math.max(1, demo.overall + (index % 3 === 0 ? 0.5 : -0.5)));

    const [assessment] = await db
      .insert(selfAssessments)
      .values({
        athleteId,
        revision: 1,
        overall: selfOverall.toFixed(1),
        note: 'Autoavaliação de demonstração.',
      })
      .returning({ id: selfAssessments.id });

    await db.insert(selfAssessmentSkills).values(
      SKILL_CODES.map((skill, skillIndex) => ({
        assessmentId: assessment?.id as string,
        skill,
        // Um critério fica como "não sei avaliar" para exercitar o null.
        rating: skillIndex === 2 ? null : skillFor(selfOverall, skillIndex + index + 1),
      })),
    );
  }

  return ids;
}

async function seedAffinities(db: PostgresJsDatabase, ids: string[]): Promise<void> {
  const at = (i: number): string => ids[i] as string;

  await db.insert(affinities).values([
    // Positivas — uma delas mútua, outra unilateral (afinidade é direcional).
    { fromAthleteId: at(0), toAthleteId: at(1), type: 'pessoal', intensity: 3 },
    { fromAthleteId: at(1), toAthleteId: at(0), type: 'pessoal', intensity: 2 },
    { fromAthleteId: at(6), toAthleteId: at(9), type: 'tatica', intensity: 2 },
    { fromAthleteId: at(11), toAthleteId: at(4), type: 'pessoal', intensity: 1 },

    // Negativas — privadas, o alvo nunca fica sabendo.
    { fromAthleteId: at(13), toAthleteId: at(16), type: 'pessoal', intensity: -2 },
    { fromAthleteId: at(8), toAthleteId: at(15), type: 'tatica', intensity: -1 },

    // Restrição obrigatória: só o administrador pode criar.
    {
      fromAthleteId: at(2),
      toAthleteId: at(17),
      type: 'pessoal',
      intensity: -3,
      rigidity: 'restricao_obrigatoria',
      note: 'Discussão em quadra no encontro de maio. Manter em times diferentes.',
    },
  ]);
}

interface FinishedEventSpec {
  title: string;
  date: string;
  courtCostReais: number;
  paidCount: number;
}

async function seedFinishedEvent(
  db: PostgresJsDatabase,
  athleteIds: string[],
  spec: FinishedEventSpec,
): Promise<void> {
  const valuePerAthlete = reaisToCents(10);
  const courtCost = reaisToCents(spec.courtCostReais);

  const [event] = await db
    .insert(events)
    .values({
      title: spec.title,
      type: 'encontro',
      status: 'finalizado',
      eventDate: spec.date,
      startTime: '20:00',
      endTime: '22:00',
      venueName: 'Ginásio do Bairro Centro',
      address: 'Rua dos Andradas, 1200 — Alegrete/RS',
      capacity: 18,
      valuePerAthleteCents: valuePerAthlete,
      courtCostCents: courtCost,
      courtCostPaid: new Date(`${spec.date}T23:00:00Z`),
      financialStatus: spec.paidCount === 18 ? 'fechado' : 'parcialmente_recebido',
      financialClosedAt: spec.paidCount === 18 ? new Date(`${spec.date}T23:30:00Z`) : null,
    })
    .returning({ id: events.id });

  const eventId = event?.id as string;

  await db.insert(eventParticipants).values(
    athleteIds.map((athleteId, i) => ({
      eventId,
      athleteId,
      status: 'presente' as const,
      confirmedSlot: i + 1,
      respondedAt: new Date(`${spec.date}T12:00:00Z`),
      checkedInAt: new Date(`${spec.date}T20:00:00Z`),
    })),
  );

  // --- Times, gerados pelo algoritmo de verdade ---------------------------
  const players = DEMO_ATHLETES.map((demo, i) => ({
    id: athleteIds[i] as string,
    displayName: demo.nickname,
    overall: demo.overall,
    skills: Object.fromEntries(
      SKILL_CODES.map((skill, skillIndex) => [skill, Number(skillFor(demo.overall, skillIndex + i))]),
    ),
    positionRatings: {},
    primaryPosition: demo.primary,
    secondaryPositions: demo.secondary,
    unwantedPositions: [],
    isProvisional: demo.provisional,
  }));

  const result = generateFormations({
    players,
    constraints: [
      {
        playerAId: athleteIds[2] as string,
        playerBId: athleteIds[17] as string,
        kind: 'must_be_apart',
      },
    ],
    affinities: [],
    locks: [],
    lockedTeamIndexes: [],
    recentPairings: {},
    seed: PRNG.nextInt(1_000_000),
  });

  const option = result.options[0];
  if (!option) throw new Error('O algoritmo não retornou nenhuma opção para o seed.');

  const [formation] = await db
    .insert(teamFormations)
    .values({
      eventId,
      version: 1,
      status: 'publicada',
      strategy: option.strategy,
      provenance: result.provenance,
      metrics: option.metrics,
      publishedAt: new Date(`${spec.date}T19:30:00Z`),
    })
    .returning({ id: teamFormations.id });

  const formationId = formation?.id as string;
  const presets = [
    { name: 'Time A', colorToken: 'cva-navy' },
    { name: 'Time B', colorToken: 'cva-gold' },
    { name: 'Time C', colorToken: 'cva-blue' },
  ];

  const teamIds: string[] = [];

  for (const [teamIndex, members] of option.teams.entries()) {
    const preset = presets[teamIndex] ?? { name: `Time ${teamIndex + 1}`, colorToken: 'cva-blue' };

    const [team] = await db
      .insert(teams)
      .values({ formationId, teamIndex, name: preset.name, colorToken: preset.colorToken })
      .returning({ id: teams.id });

    teamIds.push(team?.id as string);

    await db.insert(teamMembers).values(
      members.map((athleteId) => ({ teamId: team?.id as string, formationId, athleteId })),
    );
  }

  // --- Rodízio, aplicando a regra real ------------------------------------
  const [a, b, c] = teamIds as [string, string, string];

  const [session] = await db
    .insert(courtRotationSessions)
    .values({
      eventId,
      formationId,
      currentMatchNumber: 1,
      leftTeamId: a,
      rightTeamId: b,
      waitingTeamId: c,
      consecutiveByTeam: { [a]: 1, [b]: 1, [c]: 0 },
      startedAt: new Date(`${spec.date}T20:05:00Z`),
      finishedAt: new Date(`${spec.date}T21:55:00Z`),
    })
    .returning({ id: courtRotationSessions.id });

  let state = startSession([a, b, c]);
  const winners = [a, a, c, b, c, a];

  for (const [index, winner] of winners.entries()) {
    const playing = [state.leftTeamId, state.rightTeamId];
    const actualWinner = playing.includes(winner) ? winner : (playing[0] as string);

    const { record, next } = completeMatch(state, {
      leftScore: state.leftTeamId === actualWinner ? 25 : 21,
      rightScore: state.rightTeamId === actualWinner ? 25 : 21,
      winnerTeamId: actualWinner,
    });

    await db.insert(matches).values({
      sessionId: session?.id as string,
      matchNumber: record.matchNumber,
      leftTeamId: record.leftTeamId,
      rightTeamId: record.rightTeamId,
      waitingTeamId: record.waitingTeamId,
      leftScore: record.leftScore,
      rightScore: record.rightScore,
      winnerTeamId: record.winnerTeamId,
      leavingTeamId: record.leavingTeamId,
      stayingTeamId: record.stayingTeamId,
      enteringTeamId: record.enteringTeamId,
      leaveReason: record.leaveReason,
      finishedAt: new Date(`${spec.date}T${String(20 + Math.floor(index / 3)).padStart(2, '0')}:${String((index % 3) * 20 + 15).padStart(2, '0')}:00Z`),
    });

    state = next;
  }

  await db
    .update(courtRotationSessions)
    .set({ currentMatchNumber: state.matchNumber })
    .where(eq(courtRotationSessions.id, session?.id as string));

  // --- Financeiro ---------------------------------------------------------
  for (const [i, athleteId] of athleteIds.entries()) {
    const paid = i < spec.paidCount;

    const [charge] = await db
      .insert(eventCharges)
      .values({
        eventId,
        athleteId,
        amountDueCents: valuePerAthlete,
        amountPaidCents: paid ? valuePerAthlete : 0,
        status: paid ? 'pago' : 'pendente',
      })
      .returning({ id: eventCharges.id });

    if (paid) {
      await db.insert(eventPayments).values({
        chargeId: charge?.id as string,
        amountCents: valuePerAthlete,
        method: i % 3 === 0 ? 'dinheiro' : 'pix',
        paidAt: new Date(`${spec.date}T20:30:00Z`),
      });
    }
  }

  const received = reaisToCents(spec.paidCount * 10);

  await db.insert(cashTransactions).values([
    {
      kind: 'arrecadacao_evento',
      amountCents: received,
      settledAt: new Date(`${spec.date}T22:00:00Z`),
      occurredAt: new Date(`${spec.date}T22:00:00Z`),
      description: `Arrecadação — ${spec.title}`,
      eventId,
    },
    {
      kind: 'despesa_evento',
      amountCents: -courtCost,
      settledAt: new Date(`${spec.date}T22:05:00Z`),
      occurredAt: new Date(`${spec.date}T22:05:00Z`),
      description: `Aluguel da quadra — ${spec.title}`,
      eventId,
    },
  ]);
}

/** Encontro aberto com os 18 confirmados e três na lista de espera. */
async function seedUpcomingEvent(db: PostgresJsDatabase, athleteIds: string[]): Promise<void> {
  const [event] = await db
    .insert(events)
    .values({
      title: 'Encontro de quarta',
      type: 'encontro',
      status: 'publicado',
      eventDate: isoDate(3),
      startTime: '20:00',
      endTime: '22:00',
      venueName: 'Ginásio do Bairro Centro',
      address: 'Rua dos Andradas, 1200 — Alegrete/RS',
      notes: 'Levar a camisa clara. Quem chegar antes ajuda a montar a rede.',
      confirmationDeadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      capacity: 18,
      valuePerAthleteCents: reaisToCents(10),
      courtCostCents: reaisToCents(150),
      financialStatus: 'aberto',
    })
    .returning({ id: events.id });

  const eventId = event?.id as string;

  await db.insert(eventParticipants).values(
    athleteIds.map((athleteId, i) => ({
      eventId,
      athleteId,
      status: 'confirmado' as const,
      confirmedSlot: i + 1,
      respondedAt: new Date(),
    })),
  );
}

async function seedBarbecue(db: PostgresJsDatabase, athleteIds: string[]): Promise<void> {
  const perPerson = reaisToCents(45);

  const [extra] = await db
    .insert(extraFinancialEvents)
    .values({
      name: 'Churrasco de encerramento do semestre',
      occurredOn: isoDate(-30),
      notes: 'Carne e bebida por conta do grupo; cada um levou o acompanhamento.',
      chargeMode: 'por_pessoa',
      valuePerPersonCents: perPerson,
      financialStatus: 'parcialmente_recebido',
    })
    .returning({ id: extraFinancialEvents.id });

  const participants = athleteIds.slice(0, 14);

  await db.insert(extraEventCharges).values(
    participants.map((athleteId, i) => ({
      extraEventId: extra?.id as string,
      athleteId,
      amountDueCents: perPerson,
      amountPaidCents: i < 12 ? perPerson : 0,
      status: i < 12 ? ('pago' as const) : ('pendente' as const),
    })),
  );

  await db.insert(cashTransactions).values([
    {
      kind: 'arrecadacao_extra',
      amountCents: reaisToCents(12 * 45),
      settledAt: new Date(),
      occurredAt: new Date(),
      description: 'Arrecadação — churrasco de encerramento',
    },
    {
      kind: 'despesa_extra',
      amountCents: -reaisToCents(480),
      settledAt: new Date(),
      occurredAt: new Date(),
      description: 'Carne, carvão e bebidas — churrasco',
    },
  ]);
}

main().catch((error: unknown) => {
  console.error('Falha ao aplicar o seed de demonstração:', error);
  process.exit(1);
});
