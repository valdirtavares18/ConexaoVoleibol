CREATE TYPE "public"."account_link_status" AS ENUM('pendente', 'aprovado', 'rejeitado', 'expirado');--> statement-breakpoint
CREATE TYPE "public"."affinity_rigidity" AS ENUM('preferencia_flexivel', 'restricao_obrigatoria');--> statement-breakpoint
CREATE TYPE "public"."affinity_type" AS ENUM('pessoal', 'tatica');--> statement-breakpoint
CREATE TYPE "public"."athlete_status" AS ENUM('ativo', 'inativo', 'afastado', 'lesionado');--> statement-breakpoint
CREATE TYPE "public"."balancing_strategy" AS ENUM('equilibrio_maximo', 'equilibrio_com_afinidades', 'variacao_social', 'cobertura_de_posicoes', 'ajuste_manual');--> statement-breakpoint
CREATE TYPE "public"."cash_transaction_kind" AS ENUM('arrecadacao_evento', 'despesa_evento', 'arrecadacao_extra', 'despesa_extra', 'ajuste_manual');--> statement-breakpoint
CREATE TYPE "public"."evaluation_status" AS ENUM('provisoria', 'definitiva');--> statement-breakpoint
CREATE TYPE "public"."event_financial_status" AS ENUM('aberto', 'parcialmente_recebido', 'fechado');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('rascunho', 'publicado', 'em_andamento', 'finalizado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('encontro', 'treino', 'amistoso', 'campeonato', 'confraternizacao', 'outro');--> statement-breakpoint
CREATE TYPE "public"."formation_status" AS ENUM('rascunho', 'publicada', 'necessita_revisao', 'substituida');--> statement-breakpoint
CREATE TYPE "public"."match_leave_reason" AS ENUM('limite_consecutivas', 'derrota', 'empate_decidido', 'override_manual');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('comunicado', 'novo_evento', 'confirmacao_presenca', 'lista_espera', 'vaga_liberada', 'times_publicados', 'avaliacao_pendente', 'revisao_provisoria');--> statement-breakpoint
CREATE TYPE "public"."participation_status" AS ENUM('confirmado', 'talvez', 'nao_participa', 'lista_espera', 'cancelou_apos_prazo', 'presente', 'faltou', 'falta_avisada', 'falta_sem_aviso', 'chegou_atrasado', 'saiu_antecipadamente');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'dinheiro', 'outro');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pendente', 'pago', 'parcial', 'dispensado', 'estornado');--> statement-breakpoint
CREATE TYPE "public"."position_code" AS ENUM('levantador', 'ponteiro', 'central', 'oposto', 'libero', 'coringa');--> statement-breakpoint
CREATE TYPE "public"."position_role" AS ENUM('principal', 'secundaria', 'indesejada');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'atleta');--> statement-breakpoint
CREATE TYPE "public"."skill_code" AS ENUM('saque', 'recepcao', 'levantamento', 'ataque', 'bloqueio', 'defesa', 'cobertura', 'posicionamento', 'regularidade', 'condicionamento', 'comunicacao');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('aguardando_aprovacao', 'ativo', 'ajustes_solicitados', 'rejeitado', 'desativado');--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_key" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"status" "user_status" DEFAULT 'aguardando_aprovacao' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "athlete_account_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "account_link_status" DEFAULT 'pendente' NOT NULL,
	"origin" text DEFAULT 'reivindicacao' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"decision_note" text
);
--> statement-breakpoint
CREATE TABLE "athlete_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_positions" (
	"athlete_id" uuid NOT NULL,
	"position" "position_code" NOT NULL,
	"role" "position_role" NOT NULL,
	CONSTRAINT "athlete_positions_athlete_id_position_pk" PRIMARY KEY("athlete_id","position")
);
--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"nickname" text,
	"avatar_url" text,
	"phone" text,
	"email" text,
	"birth_date" date,
	"shirt_number" integer,
	"uniform_size" text,
	"joined_at" date,
	"status" "athlete_status" DEFAULT 'ativo' NOT NULL,
	"athlete_notes" text,
	"admin_notes" text,
	"health_restrictions" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evaluation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"evaluation_id" uuid,
	"changed_by_user_id" uuid,
	"status" "evaluation_status" NOT NULL,
	"justification" text NOT NULL,
	"changes" jsonb NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official_evaluation_skills" (
	"evaluation_id" uuid NOT NULL,
	"skill" "skill_code" NOT NULL,
	"rating" numeric(2, 1),
	CONSTRAINT "official_evaluation_skills_evaluation_id_skill_pk" PRIMARY KEY("evaluation_id","skill"),
	CONSTRAINT "official_evaluation_skill_scale" CHECK (rating is null or (rating >= 1 and rating <= 5 and (rating * 2) = floor(rating * 2)))
);
--> statement-breakpoint
CREATE TABLE "official_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"overall" numeric(2, 1),
	"status" "evaluation_status" DEFAULT 'provisoria' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"internal_note" text,
	"justification" text,
	"participations_at_creation" integer DEFAULT 0 NOT NULL,
	"evaluated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "official_evaluation_overall_scale" CHECK (overall is null or (overall >= 1 and overall <= 5 and (overall * 2) = floor(overall * 2)))
);
--> statement-breakpoint
CREATE TABLE "position_ratings" (
	"evaluation_id" uuid NOT NULL,
	"position" "position_code" NOT NULL,
	"rating" numeric(2, 1),
	CONSTRAINT "position_ratings_evaluation_id_position_pk" PRIMARY KEY("evaluation_id","position"),
	CONSTRAINT "position_rating_scale" CHECK (rating is null or (rating >= 1 and rating <= 5 and (rating * 2) = floor(rating * 2)))
);
--> statement-breakpoint
CREATE TABLE "self_assessment_positions" (
	"assessment_id" uuid NOT NULL,
	"position" "position_code" NOT NULL,
	"rating" numeric(2, 1),
	CONSTRAINT "self_assessment_positions_assessment_id_position_pk" PRIMARY KEY("assessment_id","position"),
	CONSTRAINT "self_assessment_position_scale" CHECK (rating is null or (rating >= 1 and rating <= 5 and (rating * 2) = floor(rating * 2)))
);
--> statement-breakpoint
CREATE TABLE "self_assessment_skills" (
	"assessment_id" uuid NOT NULL,
	"skill" "skill_code" NOT NULL,
	"rating" numeric(2, 1),
	"note" text,
	CONSTRAINT "self_assessment_skills_assessment_id_skill_pk" PRIMARY KEY("assessment_id","skill"),
	CONSTRAINT "self_assessment_skill_scale" CHECK (rating is null or (rating >= 1 and rating <= 5 and (rating * 2) = floor(rating * 2)))
);
--> statement-breakpoint
CREATE TABLE "self_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"overall" numeric(2, 1),
	"note" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "self_assessment_overall_scale" CHECK (overall is null or (overall >= 1 and overall <= 5 and (overall * 2) = floor(overall * 2)))
);
--> statement-breakpoint
CREATE TABLE "affinities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_athlete_id" uuid NOT NULL,
	"to_athlete_id" uuid NOT NULL,
	"type" "affinity_type" DEFAULT 'pessoal' NOT NULL,
	"intensity" integer NOT NULL,
	"rigidity" "affinity_rigidity" DEFAULT 'preferencia_flexivel' NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affinity_intensity_range" CHECK (intensity between -3 and 3),
	CONSTRAINT "affinity_not_self" CHECK (from_athlete_id <> to_athlete_id)
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"status" "participation_status" DEFAULT 'talvez' NOT NULL,
	"confirmed_slot" integer,
	"waitlist_position" integer,
	"responded_at" timestamp with time zone,
	"responded_by_user_id" uuid,
	"checked_in_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_confirmed_slot_positive" CHECK (confirmed_slot is null or confirmed_slot > 0),
	CONSTRAINT "event_waitlist_position_positive" CHECK (waitlist_position is null or waitlist_position > 0),
	CONSTRAINT "event_slot_xor_waitlist" CHECK (confirmed_slot is null or waitlist_position is null)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"type" "event_type" DEFAULT 'encontro' NOT NULL,
	"status" "event_status" DEFAULT 'rascunho' NOT NULL,
	"event_date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"starts_at" timestamp with time zone,
	"venue_name" text,
	"address" text,
	"notes" text,
	"confirmation_deadline" timestamp with time zone,
	"capacity" integer DEFAULT 18 NOT NULL,
	"team_count" integer DEFAULT 3 NOT NULL,
	"team_size" integer DEFAULT 6 NOT NULL,
	"value_per_athlete_cents" integer DEFAULT 1000 NOT NULL,
	"court_cost_cents" integer DEFAULT 0 NOT NULL,
	"court_cost_paid_at" timestamp with time zone,
	"financial_status" "event_financial_status" DEFAULT 'aberto' NOT NULL,
	"financial_closed_at" timestamp with time zone,
	"financial_closed_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "events_capacity_positive" CHECK (capacity > 0),
	CONSTRAINT "events_team_layout" CHECK (team_count > 0 and team_size > 0),
	CONSTRAINT "events_money_non_negative" CHECK (value_per_athlete_cents >= 0 and court_cost_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "team_formations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "formation_status" DEFAULT 'rascunho' NOT NULL,
	"strategy" "balancing_strategy" NOT NULL,
	"provenance" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"generated_by_user_id" uuid,
	"published_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_formation_version_positive" CHECK (version > 0)
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"assigned_position" "position_code",
	"locked" boolean DEFAULT false NOT NULL,
	"manually_placed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formation_id" uuid NOT NULL,
	"team_index" integer NOT NULL,
	"name" text NOT NULL,
	"color_token" text DEFAULT 'cva-blue' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "team_id_formation_unique" UNIQUE("id","formation_id")
);
--> statement-breakpoint
CREATE TABLE "court_rotation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"action" text NOT NULL,
	"match_id" uuid,
	"state_after" jsonb NOT NULL,
	"justification" text,
	"performed_by_user_id" uuid,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_rotation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"current_match_number" integer DEFAULT 1 NOT NULL,
	"left_team_id" uuid,
	"right_team_id" uuid,
	"waiting_team_id" uuid,
	"consecutive_by_team" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_consecutive_matches" integer DEFAULT 2 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"match_number" integer NOT NULL,
	"left_team_id" uuid NOT NULL,
	"right_team_id" uuid NOT NULL,
	"waiting_team_id" uuid NOT NULL,
	"left_score" integer,
	"right_score" integer,
	"winner_team_id" uuid,
	"leaving_team_id" uuid NOT NULL,
	"staying_team_id" uuid NOT NULL,
	"entering_team_id" uuid NOT NULL,
	"leave_reason" "match_leave_reason" NOT NULL,
	"override_justification" text,
	"recorded_by_user_id" uuid,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_teams_distinct" CHECK (left_team_id <> right_team_id),
	CONSTRAINT "match_score_non_negative" CHECK ((left_score is null or left_score >= 0) and (right_score is null or right_score >= 0)),
	CONSTRAINT "match_override_needs_justification" CHECK (leave_reason <> 'override_manual' or (override_justification is not null and length(trim(override_justification)) >= 3))
);
--> statement-breakpoint
CREATE TABLE "cash_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "cash_transaction_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"settled_at" timestamp with time zone,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"reason" text,
	"event_id" uuid,
	"extra_event_id" uuid,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_tx_amount_non_zero" CHECK (amount_cents <> 0),
	CONSTRAINT "cash_tx_manual_needs_reason" CHECK (kind <> 'ajuste_manual' or (reason is not null and length(trim(reason)) >= 3))
);
--> statement-breakpoint
CREATE TABLE "event_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"amount_due_cents" integer NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"status" "payment_status" DEFAULT 'pendente' NOT NULL,
	"adjustment_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_charge_amounts_non_negative" CHECK (amount_due_cents >= 0 and amount_paid_cents >= 0),
	CONSTRAINT "event_charge_not_overpaid" CHECK (amount_paid_cents <= amount_due_cents),
	CONSTRAINT "event_charge_adjustment_needs_reason" CHECK (status not in ('dispensado', 'estornado') or (adjustment_reason is not null and length(trim(adjustment_reason)) >= 3))
);
--> statement-breakpoint
CREATE TABLE "event_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_at" timestamp with time zone,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_expense_amount_positive" CHECK (amount_cents > 0)
);
--> statement-breakpoint
CREATE TABLE "event_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" "payment_method" DEFAULT 'pix' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_payment_amount_positive" CHECK (amount_cents > 0)
);
--> statement-breakpoint
CREATE TABLE "extra_event_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extra_event_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"amount_due_cents" integer NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"status" "payment_status" DEFAULT 'pendente' NOT NULL,
	"adjustment_reason" text,
	CONSTRAINT "extra_charge_amounts_non_negative" CHECK (amount_due_cents >= 0 and amount_paid_cents >= 0),
	CONSTRAINT "extra_charge_not_overpaid" CHECK (amount_paid_cents <= amount_due_cents)
);
--> statement-breakpoint
CREATE TABLE "extra_event_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extra_event_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "extra_expense_amount_positive" CHECK (amount_cents > 0)
);
--> statement-breakpoint
CREATE TABLE "extra_financial_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"occurred_on" date NOT NULL,
	"notes" text,
	"charge_mode" text DEFAULT 'por_pessoa' NOT NULL,
	"value_per_person_cents" integer,
	"total_cents" integer,
	"financial_status" "event_financial_status" DEFAULT 'aberto' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extra_event_mode_values" CHECK ((charge_mode = 'por_pessoa' and value_per_person_cents is not null) or (charge_mode = 'total_rateado' and total_cents is not null))
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"club_name" text DEFAULT 'Conexão Voleibol Alegrete' NOT NULL,
	"short_name" text DEFAULT 'CVA' NOT NULL,
	"logo_url" text,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"locale" text DEFAULT 'pt-BR' NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"default_value_per_athlete_cents" integer DEFAULT 1000 NOT NULL,
	"default_court_cost_cents" integer DEFAULT 15000 NOT NULL,
	"default_capacity" integer DEFAULT 18 NOT NULL,
	"default_team_count" integer DEFAULT 3 NOT NULL,
	"default_team_size" integer DEFAULT 6 NOT NULL,
	"max_consecutive_matches" integer DEFAULT 2 NOT NULL,
	"max_imbalance_basis_points" integer DEFAULT 500 NOT NULL,
	"provisional_review_after_events" integer DEFAULT 3 NOT NULL,
	"self_official_evaluation_visible" boolean DEFAULT false NOT NULL,
	"balancing_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required_positions" jsonb DEFAULT '["levantador"]'::jsonb NOT NULL,
	"team_presets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recent_pairing_window" integer DEFAULT 4 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"code" "position_code" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_account_links" ADD CONSTRAINT "athlete_account_links_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_account_links" ADD CONSTRAINT "athlete_account_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_account_links" ADD CONSTRAINT "athlete_account_links_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_invitations" ADD CONSTRAINT "athlete_invitations_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_invitations" ADD CONSTRAINT "athlete_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_positions" ADD CONSTRAINT "athlete_positions_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_history" ADD CONSTRAINT "evaluation_history_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_history" ADD CONSTRAINT "evaluation_history_evaluation_id_official_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."official_evaluations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_history" ADD CONSTRAINT "evaluation_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_evaluation_skills" ADD CONSTRAINT "official_evaluation_skills_evaluation_id_official_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."official_evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_evaluations" ADD CONSTRAINT "official_evaluations_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_evaluations" ADD CONSTRAINT "official_evaluations_evaluated_by_user_id_users_id_fk" FOREIGN KEY ("evaluated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_ratings" ADD CONSTRAINT "position_ratings_evaluation_id_official_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."official_evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_assessment_positions" ADD CONSTRAINT "self_assessment_positions_assessment_id_self_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."self_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_assessment_skills" ADD CONSTRAINT "self_assessment_skills_assessment_id_self_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."self_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_assessments" ADD CONSTRAINT "self_assessments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affinities" ADD CONSTRAINT "affinities_from_athlete_id_athletes_id_fk" FOREIGN KEY ("from_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affinities" ADD CONSTRAINT "affinities_to_athlete_id_athletes_id_fk" FOREIGN KEY ("to_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affinities" ADD CONSTRAINT "affinities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_responded_by_user_id_users_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_financial_closed_by_user_id_users_id_fk" FOREIGN KEY ("financial_closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_formations" ADD CONSTRAINT "team_formations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_formations" ADD CONSTRAINT "team_formations_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_formations" ADD CONSTRAINT "team_formations_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_formation_id_team_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."team_formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_member_team_formation_fk" FOREIGN KEY ("team_id","formation_id") REFERENCES "public"."teams"("id","formation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_formation_id_team_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."team_formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_rotation_history" ADD CONSTRAINT "court_rotation_history_session_id_court_rotation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."court_rotation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_rotation_history" ADD CONSTRAINT "court_rotation_history_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_rotation_history" ADD CONSTRAINT "court_rotation_history_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_rotation_sessions" ADD CONSTRAINT "court_rotation_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_rotation_sessions" ADD CONSTRAINT "court_rotation_sessions_formation_id_team_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."team_formations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_rotation_sessions" ADD CONSTRAINT "court_rotation_sessions_left_team_id_teams_id_fk" FOREIGN KEY ("left_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_rotation_sessions" ADD CONSTRAINT "court_rotation_sessions_right_team_id_teams_id_fk" FOREIGN KEY ("right_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_rotation_sessions" ADD CONSTRAINT "court_rotation_sessions_waiting_team_id_teams_id_fk" FOREIGN KEY ("waiting_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_session_id_court_rotation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."court_rotation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_left_team_id_teams_id_fk" FOREIGN KEY ("left_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_right_team_id_teams_id_fk" FOREIGN KEY ("right_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_waiting_team_id_teams_id_fk" FOREIGN KEY ("waiting_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_leaving_team_id_teams_id_fk" FOREIGN KEY ("leaving_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_staying_team_id_teams_id_fk" FOREIGN KEY ("staying_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_entering_team_id_teams_id_fk" FOREIGN KEY ("entering_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_charges" ADD CONSTRAINT "event_charges_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_charges" ADD CONSTRAINT "event_charges_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_expenses" ADD CONSTRAINT "event_expenses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_expenses" ADD CONSTRAINT "event_expenses_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_payments" ADD CONSTRAINT "event_payments_charge_id_event_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."event_charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_payments" ADD CONSTRAINT "event_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_event_charges" ADD CONSTRAINT "extra_event_charges_extra_event_id_extra_financial_events_id_fk" FOREIGN KEY ("extra_event_id") REFERENCES "public"."extra_financial_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_event_charges" ADD CONSTRAINT "extra_event_charges_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_event_expenses" ADD CONSTRAINT "extra_event_expenses_extra_event_id_extra_financial_events_id_fk" FOREIGN KEY ("extra_event_id") REFERENCES "public"."extra_financial_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_financial_events" ADD CONSTRAINT "extra_financial_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_settings" ADD CONSTRAINT "club_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_token_hash_unique" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rate_limit_bucket_idx" ON "rate_limit_attempts" USING btree ("bucket_key","attempted_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email")) WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_link_athlete_unique" ON "athlete_account_links" USING btree ("athlete_id") WHERE "athlete_account_links"."status" = 'aprovado';--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_link_user_unique" ON "athlete_account_links" USING btree ("user_id") WHERE "athlete_account_links"."status" = 'aprovado';--> statement-breakpoint
CREATE INDEX "athlete_link_status_idx" ON "athlete_account_links" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_invitation_token_unique" ON "athlete_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "athlete_invitation_athlete_idx" ON "athlete_invitations" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_positions_position_idx" ON "athlete_positions" USING btree ("position","role");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_primary_position_unique" ON "athlete_positions" USING btree ("athlete_id") WHERE "athlete_positions"."role" = 'principal';--> statement-breakpoint
CREATE INDEX "athletes_status_idx" ON "athletes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "athletes_name_idx" ON "athletes" USING btree ("full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_email_unique" ON "athletes" USING btree (lower("email")) WHERE "athletes"."email" is not null and "athletes"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_phone_unique" ON "athletes" USING btree ("phone") WHERE "athletes"."phone" is not null and "athletes"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_shirt_unique" ON "athletes" USING btree ("shirt_number") WHERE "athletes"."shirt_number" is not null and "athletes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "evaluation_history_athlete_idx" ON "evaluation_history" USING btree ("athlete_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "official_evaluation_revision_unique" ON "official_evaluations" USING btree ("athlete_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "official_evaluation_current_unique" ON "official_evaluations" USING btree ("athlete_id") WHERE "official_evaluations"."is_current";--> statement-breakpoint
CREATE INDEX "official_evaluation_status_idx" ON "official_evaluations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "self_assessment_revision_unique" ON "self_assessments" USING btree ("athlete_id","revision");--> statement-breakpoint
CREATE INDEX "self_assessment_athlete_idx" ON "self_assessments" USING btree ("athlete_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "affinity_direction_unique" ON "affinities" USING btree ("from_athlete_id","to_athlete_id","type");--> statement-breakpoint
CREATE INDEX "affinity_from_idx" ON "affinities" USING btree ("from_athlete_id");--> statement-breakpoint
CREATE INDEX "affinity_to_idx" ON "affinities" USING btree ("to_athlete_id");--> statement-breakpoint
CREATE INDEX "affinity_rigidity_idx" ON "affinities" USING btree ("rigidity") WHERE "affinities"."rigidity" = 'restricao_obrigatoria';--> statement-breakpoint
CREATE UNIQUE INDEX "event_participant_unique" ON "event_participants" USING btree ("event_id","athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_confirmed_slot_unique" ON "event_participants" USING btree ("event_id","confirmed_slot") WHERE "event_participants"."confirmed_slot" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_waitlist_position_unique" ON "event_participants" USING btree ("event_id","waitlist_position") WHERE "event_participants"."waitlist_position" is not null;--> statement-breakpoint
CREATE INDEX "event_participant_status_idx" ON "event_participants" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status","event_date");--> statement-breakpoint
CREATE UNIQUE INDEX "team_formation_version_unique" ON "team_formations" USING btree ("event_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "team_formation_published_unique" ON "team_formations" USING btree ("event_id") WHERE "team_formations"."status" = 'publicada';--> statement-breakpoint
CREATE INDEX "team_formation_event_idx" ON "team_formations" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_member_unique" ON "team_members" USING btree ("team_id","athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_member_formation_unique" ON "team_members" USING btree ("formation_id","athlete_id");--> statement-breakpoint
CREATE INDEX "team_member_athlete_idx" ON "team_members" USING btree ("athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_index_unique" ON "teams" USING btree ("formation_id","team_index");--> statement-breakpoint
CREATE INDEX "team_formation_idx" ON "teams" USING btree ("formation_id");--> statement-breakpoint
CREATE INDEX "rotation_history_session_idx" ON "court_rotation_history" USING btree ("session_id","performed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rotation_session_active_unique" ON "court_rotation_sessions" USING btree ("event_id") WHERE "court_rotation_sessions"."finished_at" is null;--> statement-breakpoint
CREATE INDEX "rotation_session_event_idx" ON "court_rotation_sessions" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_number_unique" ON "matches" USING btree ("session_id","match_number");--> statement-breakpoint
CREATE INDEX "match_session_idx" ON "matches" USING btree ("session_id","match_number");--> statement-breakpoint
CREATE INDEX "cash_tx_occurred_idx" ON "cash_transactions" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "cash_tx_settled_idx" ON "cash_transactions" USING btree ("settled_at");--> statement-breakpoint
CREATE INDEX "cash_tx_event_idx" ON "cash_transactions" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_charge_unique" ON "event_charges" USING btree ("event_id","athlete_id");--> statement-breakpoint
CREATE INDEX "event_charge_status_idx" ON "event_charges" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "event_expense_event_idx" ON "event_expenses" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_payment_charge_idx" ON "event_payments" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "extra_event_charge_unique" ON "extra_event_charges" USING btree ("extra_event_id","athlete_id");--> statement-breakpoint
CREATE INDEX "extra_expense_event_idx" ON "extra_event_expenses" USING btree ("extra_event_id");--> statement-breakpoint
CREATE INDEX "extra_event_date_idx" ON "extra_financial_events" USING btree ("occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_title_date_unique" ON "announcements" USING btree ("title","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "positions_order_idx" ON "positions" USING btree ("sort_order");