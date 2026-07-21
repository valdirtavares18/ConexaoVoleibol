# ADR-0003 — Dinheiro em centavos inteiros

**Status:** aceita · **Data:** 2026-07-21

## Contexto

O financeiro do CVA é simples em volume — R$ 10,00 por atleta, 18 atletas — mas
os erros de arredondamento não são simples de detectar depois. O caso clássico:

```js
0.1 + 0.2 === 0.30000000000000004;
```

Num rateio de churrasco entre 7 pessoas, um centavo perdido por participante
significa um caixa que não fecha e ninguém sabe por quê.

## Decisão

**Todo valor monetário é `integer` em centavos**, do banco à interface.

- Tipo `Cents` **nominal** (branded) em `src/domain/shared/money.ts`: um `number`
  cru não passa por engano onde se espera dinheiro.
- Colunas `integer` no Postgres, com `CHECK` de não-negatividade onde cabe.
- Conversão para reais acontece apenas na formatação.
- `splitCents` distribui os centavos de resto entre os primeiros participantes,
  garantindo que a soma das partes seja **exatamente** o total.

## Consequências

**A favor**

- `18 × R$ 10,00 = R$ 180,00` é exato, sempre.
- O rateio de R$ 100,00 entre 7 fecha em R$ 100,00 (R$ 14,29 para os dois
  primeiros, R$ 14,28 para os demais) — coberto por teste.
- Comparações e somas em SQL são exatas.

**Contra**

- Todo formulário precisa converter reais → centavos na fronteira. Concentrado
  em `reaisToCents`, chamado nas server actions.
- Ler o banco direto exige dividir por 100 mentalmente. Aceitável: o nome da
  coluna sempre termina em `_cents`.

## Alternativa descartada

`numeric(10,2)` no Postgres seria exato no banco, mas o driver devolve **string**
e qualquer aritmética em JavaScript voltaria ao ponto flutuante — o problema
apenas mudaria de lugar.
