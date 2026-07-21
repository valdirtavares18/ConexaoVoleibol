import { hash } from '@node-rs/argon2';
import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import {
  athleteAccountLinks,
  athletePositions,
  athletes,
  clubSettings,
  events,
  officialEvaluationSkills,
  officialEvaluations,
  positions as positionsTable,
  userRoles,
  users,
} from '@/db/schema';
import { DEFAULT_POSITIONS, SKILL_CODES } from '@/domain/positions';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/**
 * Prepara o banco dos testes end-to-end.
 *
 * O banco é **recriado do zero** a cada execução: um E2E que depende de estado
 * deixado pela rodada anterior falha de forma intermitente e ninguém confia
 * mais nele.
 */

export const E2E = {
  adminEmail: 'admin.e2e@cva.local',
  adminPassword: 'CvaTesteE2E#2026',
  athleteEmail: 'atleta.e2e@cva.local',
  athletePassword: 'CvaTesteE2E#2026',
  eventTitle: 'Encontro E2E',
  athleteCount: 18,
} as const;

const DB_NAME = 'cva_gestao_e2e';

function urlFor(database: string): string {
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgresql://cva:cva@localhost:5433/cva_gestao',
  );
  url.pathname = `/${database}`;
  return url.toString();
}

export default async function globalSetup(): Promise<void> {
  const admin = postgres(urlFor('postgres'), { max: 1, prepare: false });
  try {
    // Encerra conexões antigas para conseguir dropar o banco.
    await admin.unsafe(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB_NAME}'`,
    );
    await admin.unsafe(`drop database if exists "${DB_NAME}"`);
    await admin.unsafe(`create database "${DB_NAME}"`);
  } finally {
    await admin.end();
  }

  const client = postgres(urlFor(DB_NAME), { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });

    await db.insert(clubSettings).values({ id: 'default' });

    for (const position of DEFAULT_POSITIONS) {
      await db.insert(positionsTable).values({
        code: position.code,
        name: position.name,
        shortName: position.shortName,
        description: position.description,
        sortOrder: position.sortOrder,
      });
    }

    const passwordHash = await hash(E2E.adminPassword, {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    // --- Administrador ------------------------------------------------------
    const [adminUser] = await db
      .insert(users)
      .values({
        email: E2E.adminEmail,
        name: 'Admin E2E',
        passwordHash,
        status: 'ativo',
      })
      .returning({ id: users.id });

    await db.insert(userRoles).values({ userId: adminUser?.id as string, role: 'admin' });

    // --- 18 atletas com avaliação oficial -----------------------------------
    const levels = [5, 4.5, 4.5, 4, 4, 4, 3.5, 3.5, 3.5, 3, 3, 3, 2.5, 2.5, 2, 2, 1.5, 1];
    const positionCycle = ['levantador', 'ponteiro', 'central', 'oposto', 'libero', 'ponteiro'] as const;

    for (const [index, level] of levels.entries()) {
      const [athlete] = await db
        .insert(athletes)
        .values({
          fullName: `Atleta E2E ${String(index + 1).padStart(2, '0')}`,
          nickname: `E2E${index + 1}`,
          status: 'ativo',
        })
        .returning({ id: athletes.id });

      const athleteId = athlete?.id as string;

      await db.insert(athletePositions).values({
        athleteId,
        position: positionCycle[index % positionCycle.length] as (typeof positionCycle)[number],
        role: 'principal',
      });

      const [evaluation] = await db
        .insert(officialEvaluations)
        .values({
          athleteId,
          revision: 1,
          overall: level.toFixed(1),
          status: 'definitiva',
          isCurrent: true,
          justification: 'Semente dos testes end-to-end.',
        })
        .returning({ id: officialEvaluations.id });

      await db.insert(officialEvaluationSkills).values(
        SKILL_CODES.map((skill, skillIndex) => ({
          evaluationId: evaluation?.id as string,
          skill,
          rating: Math.min(5, Math.max(1, level + ((skillIndex % 3) - 1) * 0.5)).toFixed(1),
        })),
      );

      // O primeiro atleta ganha conta própria, para o fluxo do atleta.
      if (index === 0) {
        const [athleteUser] = await db
          .insert(users)
          .values({
            email: E2E.athleteEmail,
            name: 'Atleta E2E',
            passwordHash,
            status: 'ativo',
          })
          .returning({ id: users.id });

        await db.insert(userRoles).values({ userId: athleteUser?.id as string, role: 'atleta' });
        await db.insert(athleteAccountLinks).values({
          athleteId,
          userId: athleteUser?.id as string,
          status: 'aprovado',
          origin: 'convite',
          decidedAt: new Date(),
        });
      }
    }

    // --- Encontro publicado, ainda sem confirmações -------------------------
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + 3);

    await db.insert(events).values({
      title: E2E.eventTitle,
      type: 'encontro',
      status: 'publicado',
      eventDate: eventDate.toISOString().slice(0, 10),
      startTime: '20:00',
      venueName: 'Ginásio E2E',
      capacity: 18,
      teamCount: 3,
      teamSize: 6,
      valuePerAthleteCents: 1000,
      courtCostCents: 15000,
    });
  } finally {
    await client.end();
  }
}
