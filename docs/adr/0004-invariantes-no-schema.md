# ADR-0004 — Invariantes no schema, não em código

**Status:** aceita · **Data:** 2026-07-21

## Contexto

Várias regras do CVA são invariantes de dados, não fluxos: um encontro nunca tem
19 confirmados; um atleta não aparece em dois times da mesma formação; uma nota
é sempre 1–5 em passos de 0,5; um ajuste de caixa sempre tem motivo.

Verificar isso só em código funciona até alguém adicionar um caminho novo — uma
migration manual, um script de correção, uma função esquecida.

## Decisão

Sempre que a invariante for expressável no banco, ela **vive no banco**.

| Invariante                              | Como                                                                  |
| --------------------------------------- | --------------------------------------------------------------------- |
| Nunca 19 confirmados                    | `confirmed_slot` + índice único parcial `(event_id, confirmed_slot)`  |
| Slot e fila são exclusivos              | `CHECK (confirmed_slot is null or waitlist_position is null)`         |
| Atleta em um só time por formação       | `formation_id` em `team_members` + único `(formation_id, athlete_id)` |
| Time citado pertence à formação citada  | FK composta `(team_id, formation_id)`                                 |
| Nota 1–5 em passos de 0,5               | `CHECK` com `floor(rating * 2) = rating * 2`                          |
| Uma avaliação vigente por atleta        | índice único parcial `where is_current`                               |
| Uma formação publicada por evento       | índice único parcial `where status = 'publicada'`                     |
| Ajuste de caixa exige motivo            | `CHECK (kind <> 'ajuste_manual' or length(trim(reason)) >= 3)`        |
| Override de rodízio exige justificativa | `CHECK` equivalente em `matches`                                      |
| Pago nunca excede o devido              | `CHECK (amount_paid_cents <= amount_due_cents)`                       |
| Uma conta por atleta e vice-versa       | índices únicos parciais `where status = 'aprovado'`                   |

O código continua validando **antes**, para produzir mensagem em português; o
banco é a rede que não deixa passar.

## Consequências

**A favor**

- A invariante de capacidade sobrevive a um caminho futuro que esqueça o lock:
  em vez de gravar o 19º confirmado, a transação falha.
- Um `CHECK` de escala impede que uma correção manual em SQL grave nota 3,7.
- As regras ficam legíveis para quem abrir o banco sem ler o código.

**Contra**

- Erro de constraint é técnico e feio. Mitigado: as validações de aplicação
  vêm primeiro, então o usuário final vê a mensagem de domínio; a constraint só
  dispara em caminho não previsto — e aí falhar é o comportamento desejado.
- Mudar uma regra exige migration. É um custo aceitável para regras que
  raramente mudam. As que **mudam** — valor por atleta, capacidade, limite de
  desequilíbrio — moram em `club_settings` e não em constraint.

## Exemplo que motivou a decisão

Durante a implementação, a renumeração da lista de espera usava posições
temporárias negativas para não colidir com o índice único. O `CHECK` de
positividade rejeitou. A constraint estava certa; o workaround é que estava
errado. Sem ela, o bug teria entrado silenciosamente.
