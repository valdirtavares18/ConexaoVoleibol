# ADR-0006 — Gerador de times determinístico, sem IA

**Status:** aceita · **Data:** 2026-07-21

## Contexto

Montar times equilibrados é o coração do sistema e a decisão mais sensível
socialmente: se o grupo achar que a divisão foi arbitrária, o sistema perde
utilidade — mesmo que os times estejam matematicamente bons.

Um LLM montando os times seria mais rápido de escrever e impossível de defender:
não é reproduzível, não é explicável em termos de regra, e uma mesma entrada
pode dar respostas diferentes.

## Decisão

Algoritmo **determinístico e testável** (`src/domain/team-balancing/`), sem IA.

Três características que sustentam a defensibilidade:

**1. Reprodutibilidade.** Todo sorteio passa por um PRNG semeado (`mulberry32`).
Não existe `Math.random()` nem `Date.now()` no domínio. Mesma entrada + mesma
seed ⇒ resultado byte-a-byte idêntico. Cada formação persiste seed, pesos,
parâmetros e um digest da entrada.

**2. Lexicografia estrutural.** "Afinidade nunca passa à frente do equilíbrio"
não é uma questão de calibrar peso — uma soma ponderada única não garantiria
isso. A busca tem duas fases: a primeira otimiza só o equilíbrio e descobre o
melhor `diff%` alcançável; a segunda só considera candidatos abaixo do portão
`max(limite, melhorDiff + folga)`. Nenhuma melhoria de afinidade é aceita se
empurrar o desequilíbrio acima do portão.

**3. Restrições duras são filtro, não penalidade.** Uma restrição obrigatória
elimina soluções do espaço de busca; não existe peso alto o bastante que a torne
violável. Se as restrições forem mutuamente insatisfazíveis, o algoritmo nomeia
o conflito em vez de "resolver" ignorando uma.

## Sobre o empate ilusório por soma

O requisito §10.5 aponta que `[5,5,1,1,1,1]` não equivale a `[3,3,3,3,3,3]` mesmo
com somas próximas. A defesa principal é o **desequilíbrio por posto**: ordena
cada time por força e compara o k-ésimo mais forte de cada um. Times bem
distribuídos tendem a custo zero; a divisão concentrada explode.

Somam-se a isso a variância das contagens de extremos e a dispersão interna.

## Consequências

**A favor**

- Toda decisão é explicável em termos de regra. A explicação administrativa
  chega a dizer _por que_ uma preferência não foi atendida, calculando o
  contrafactual: força-se o par junto, reotimiza-se e mede-se o `diff%`.
- 36 testes cobrem estrutura, reprodutibilidade, restrições, distribuição e
  desempenho.
- Roda em ~50 ms para 18 atletas, no servidor, sem custo de API.

**Contra**

- Mais código do que uma chamada a um modelo: ~900 linhas de domínio.
- Os pesos precisam de calibragem humana. Todos moram em `club_settings` e podem
  ser ajustados sem tocar em código.

## Nota de desempenho

A primeira implementação levava ~430 ms por geração, contra os 50 ms que a
documentação prometia. Foi criado um avaliador com buffers pré-alocados para o
caminho quente, **mais um teste que compara os dois em 200 formações aleatórias**
— se divergirem, o algoritmo estaria otimizando uma métrica diferente da
documentada, que é uma falha muito pior que lentidão.
