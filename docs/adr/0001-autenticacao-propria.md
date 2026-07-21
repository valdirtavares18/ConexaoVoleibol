# ADR-0001 — Autenticação própria em vez de Supabase Auth ou NextAuth

**Status:** aceita · **Data:** 2026-07-21

## Contexto

A especificação sugeria Supabase para banco, autenticação e storage. Ao montar o
projeto, duas restrições apareceram:

1. **Supabase Auth exige um projeto Supabase provisionado.** Sem ele, nada roda —
   nem em desenvolvimento, nem em CI. Um sistema que só sobe com credencial de
   nuvem externa é mais frágil de manter para um grupo amador.
2. **NextAuth v5 ainda está em beta** (`5.0.0-beta.32` em julho/2026; a `latest`
   estável continua sendo a v4, que não suporta App Router adequadamente). A
   própria especificação diz: *"Não use APIs experimentais quando houver uma
   alternativa estável"*.

## Decisão

Autenticação própria:

- **Argon2id** (`@node-rs/argon2`, perfil OWASP: 19 MiB / 2 iterações) para hash
  de senha.
- **Sessão em banco + cookie assinado** (`jose`, HS256). O cookie carrega apenas
  o id da sessão; a validade é conferida no banco a cada requisição.
- Cookie `httpOnly`, `sameSite=lax`, `secure` em produção.
- **Rate limit no banco**, por e-mail *e* por IP.

O Supabase permanece no projeto como **Postgres gerenciado + Storage**.

## Consequências

**A favor**

- Roda 100% localmente (Docker Postgres) e em CI, sem credencial externa.
- Revogação imediata de sessão ("sair de todos os aparelhos") — um JWT
  auto-contido não permitiria isso sem uma denylist, que seria a mesma consulta
  ao banco que já fazemos.
- Zero dependência beta no caminho crítico de segurança.
- O rate limit funciona entre instâncias serverless, porque o contador está no
  banco e não em memória.

**Contra**

- Uma consulta a mais por requisição autenticada. Mitigado por `cache()` do
  React, que memoiza por requisição.
- Login social (Google) exigiria implementação própria de OAuth. Não é requisito
  desta versão; se virar, a camada de sessão já existe e só precisa de mais um
  provedor de identidade.
- Somos responsáveis pela recuperação de acesso. Já previsto: tokens com hash e
  expiração em `password_reset_tokens`.
