import { getTableName, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Referência **qualificada** a uma coluna da consulta externa, para uso dentro
 * de subconsultas correlacionadas.
 *
 * ## Por que isto existe
 *
 * Interpolar a coluna direto no template faz o Drizzle emitir apenas o nome:
 *
 * ```ts
 * sql`(select count(*) from event_participants p where p.event_id = ${events.id})`
 * // → (select count(*) from event_participants p where p.event_id = "id")
 * ```
 *
 * Dentro da subconsulta, `"id"` resolve para a coluna `id` da tabela **interna**
 * (`event_participants`), não para a externa. A correlação se perde, a
 * comparação nunca casa e a consulta devolve zero — **sem erro nenhum**. Foi
 * exatamente esse bug que fez o painel do atleta mostrar "0/18" com 18 atletas
 * confirmados no banco.
 *
 * `outer()` emite `"events"."id"`, que não tem ambiguidade:
 *
 * ```ts
 * sql`(select count(*) from event_participants p where p.event_id = ${outer(events.id)})`
 * // → (select count(*) from event_participants p where p.event_id = "events"."id")
 * ```
 *
 * O nome da tabela vem do schema, não de uma string literal, então renomear a
 * tabela continua funcionando.
 */
export function outer(column: PgColumn): SQL {
  return sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
}
