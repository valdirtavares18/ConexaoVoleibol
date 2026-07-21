# ADR-0005 — Postgres real nos testes de integração

**Status:** aceita · **Data:** 2026-07-21

## Contexto

O requisito §23.4 exige provar que **duas confirmações simultâneas não produzem
19 confirmados**. A proteção depende de `SELECT ... FOR UPDATE` com duas conexões
concorrentes disputando a mesma linha.

A opção inicial era PGlite (Postgres compilado para WASM, roda em memória, sem
Docker). Descartada.

## Decisão

Testes de integração rodam contra **Postgres real**, subido por `docker-compose`.

- Um banco **por worker** do Vitest (`cva_gestao_test_<id>`): arquivos de teste
  rodam em paralelo em processos separados, e com banco único o `truncate` de um
  apagaria os dados do outro no meio da execução.
- `isDatabaseAvailable()` verifica a conexão; sem Docker, os testes de integração
  são **pulados** em vez de falharem.
- Os testes E2E usam um banco próprio (`cva_gestao_e2e`), recriado do zero a cada
  execução.

## Consequências

**A favor**

- O teste de concorrência prova o que se propõe. PGlite tem conexão única: as
  transações seriam serializadas pelo próprio runtime, e o teste passaria sem
  exercitar o lock — o pior tipo de teste, o que dá falsa confiança.
- `CHECK`, índices únicos parciais, FKs compostas e `numeric` se comportam
  exatamente como em produção.

**Contra**

- Docker vira pré-requisito para a suíte completa. Mitigado pelo _skip_ gracioso:
  `npm test` sem Docker ainda roda 113 testes de domínio e policies.
- Mais lento: ~30 s contra ~2 s dos testes puros. Aceitável para um conjunto
  pequeno de testes de integração.

## Nota

Foi essa escolha que revelou o bug das posições negativas na renumeração da fila:
o `CHECK` do Postgres rejeitou o valor. Um banco em memória com constraints
parcialmente implementadas poderia não ter reclamado.
