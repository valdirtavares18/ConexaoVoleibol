import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Enums do banco. Preferimos enums a `text` + CHECK porque o Drizzle deriva
 * tipos TypeScript exatos a partir deles, e um valor inválido falha na escrita
 * em vez de virar dado sujo.
 */

export const userStatusEnum = pgEnum('user_status', [
  'aguardando_aprovacao',
  'ativo',
  'ajustes_solicitados',
  'rejeitado',
  'desativado',
]);

/** Papéis não são exclusivos: um admin também pode ser atleta (§4 do prompt). */
export const roleEnum = pgEnum('role', ['admin', 'atleta']);

export const athleteStatusEnum = pgEnum('athlete_status', [
  'ativo',
  'inativo',
  'afastado',
  'lesionado',
]);

export const positionCodeEnum = pgEnum('position_code', [
  'levantador',
  'ponteiro',
  'central',
  'oposto',
  'libero',
  'coringa',
]);

/** Como o atleta se relaciona com uma posição. */
export const positionRoleEnum = pgEnum('position_role', ['principal', 'secundaria', 'indesejada']);

export const skillCodeEnum = pgEnum('skill_code', [
  'saque',
  'recepcao',
  'levantamento',
  'ataque',
  'bloqueio',
  'defesa',
  'cobertura',
  'posicionamento',
  'regularidade',
  'condicionamento',
  'comunicacao',
]);

export const evaluationStatusEnum = pgEnum('evaluation_status', ['provisoria', 'definitiva']);

export const affinityTypeEnum = pgEnum('affinity_type', ['pessoal', 'tatica']);

/** Só administradores podem criar `restricao_obrigatoria` (§8.2). */
export const affinityRigidityEnum = pgEnum('affinity_rigidity', [
  'preferencia_flexivel',
  'restricao_obrigatoria',
]);

export const eventTypeEnum = pgEnum('event_type', [
  'encontro',
  'treino',
  'amistoso',
  'campeonato',
  'confraternizacao',
  'outro',
]);

export const eventStatusEnum = pgEnum('event_status', [
  'rascunho',
  'publicado',
  'em_andamento',
  'finalizado',
  'cancelado',
]);

export const participationStatusEnum = pgEnum('participation_status', [
  'confirmado',
  'talvez',
  'nao_participa',
  'lista_espera',
  'cancelou_apos_prazo',
  'presente',
  'faltou',
  'falta_avisada',
  'falta_sem_aviso',
  'chegou_atrasado',
  'saiu_antecipadamente',
]);

export const formationStatusEnum = pgEnum('formation_status', [
  'rascunho',
  'publicada',
  'necessita_revisao',
  'substituida',
]);

export const balancingStrategyEnum = pgEnum('balancing_strategy', [
  'equilibrio_maximo',
  'equilibrio_com_afinidades',
  'variacao_social',
  'cobertura_de_posicoes',
  'ajuste_manual',
]);

export const matchLeaveReasonEnum = pgEnum('match_leave_reason', [
  'limite_consecutivas',
  'derrota',
  'empate_decidido',
  'override_manual',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pendente',
  'pago',
  'parcial',
  'dispensado',
  'estornado',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['pix', 'dinheiro', 'outro']);

export const eventFinancialStatusEnum = pgEnum('event_financial_status', [
  'aberto',
  'parcialmente_recebido',
  'fechado',
]);

export const cashTransactionKindEnum = pgEnum('cash_transaction_kind', [
  'arrecadacao_evento',
  'despesa_evento',
  'arrecadacao_extra',
  'despesa_extra',
  'ajuste_manual',
]);

export const notificationKindEnum = pgEnum('notification_kind', [
  'comunicado',
  'novo_evento',
  'confirmacao_presenca',
  'lista_espera',
  'vaga_liberada',
  'times_publicados',
  'avaliacao_pendente',
  'revisao_provisoria',
]);

export const accountLinkStatusEnum = pgEnum('account_link_status', [
  'pendente',
  'aprovado',
  'rejeitado',
  'expirado',
]);
