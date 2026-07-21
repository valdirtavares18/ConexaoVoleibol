# Algoritmo de Formação de Times — CVA Gestão

**Versão do algoritmo:** `cva-balance/1.0.0`
**Implementação:** `src/domain/team-balancing/` (puro, sem dependência de banco, rede ou UI)

> Não há IA nem LLM neste algoritmo. Ele é determinístico, auditável e testável:
> a mesma entrada com a mesma seed produz sempre exatamente o mesmo resultado.

---

## 1. Entrada e saída

```ts
generateFormations(input: BalancingInput, options: BalancingOptions): BalancingResult
```

**`BalancingInput`**

| Campo                    | Descrição                                                      |
| ------------------------ | -------------------------------------------------------------- |
| `players[]`              | atletas confirmados, com avaliação **oficial** já resolvida    |
| `teamCount` / `teamSize` | 3 / 6 por padrão                                               |
| `constraints[]`          | restrições obrigatórias (`must_be_together` / `must_be_apart`) |
| `affinities[]`           | preferências direcionais (−3…+3, tipo pessoal ou tática)       |
| `locks[]`                | bloqueios manuais: atleta fixado em um índice de time          |
| `lockedTeams[]`          | times inteiros congelados                                      |
| `recentPairings`         | quantas vezes cada dupla jogou junta nos últimos N eventos     |
| `requiredPositions`      | posições que cada time precisa cobrir (ex.: 1 levantador)      |
| `weights`                | pesos configuráveis (`club_settings`)                          |
| `seed`                   | inteiro; controla todo o não-determinismo                      |

**`BalancingResult`** contém as opções geradas, cada uma com times, métricas completas,
explicação administrativa e a _procedência_ (versão, seed, pesos, parâmetros).

**Regra de portão:** se `players.length !== teamCount * teamSize`, o algoritmo **não roda**
no modo padrão. Retorna `InsufficientPlayersError` com a contagem esperada e a real. Só um
override administrativo explícito (`allowUnevenTeams: true`) habilita times desiguais, e
nesse caso os tamanhos diferem em no máximo 1.

---

## 2. Cálculo da força de um atleta

A força fica na mesma escala das notas (1,0 – 5,0), o que mantém as métricas legíveis.

```
força = wGeral × notaGeralOficial + wFundamentos × médiaPonderadaFundamentos
```

Padrão: `wGeral = 0,55`, `wFundamentos = 0,45` (configuráveis, normalizados para somar 1).

### 2.1 Tratamento de `null`

`null` significa **"não avaliado"** e nunca vale zero.

1. Na média dos fundamentos, critérios `null` são **excluídos** e os pesos dos restantes
   são **renormalizados**.
2. Se **todos** os fundamentos são `null`: `força = notaGeralOficial`.
3. Se a nota geral é `null` mas há fundamentos: `força = médiaPonderadaFundamentos`.
4. Se **nada** foi avaliado: o atleta recebe a **mediana das forças dos avaliados** como
   estimativa neutra, e a formação carrega um alerta `atleta_sem_avaliacao`. Ele nunca é
   tratado como o mais fraco do grupo por falta de dado.

### 2.2 Notas por posição — por que não entram na soma

Somar nota geral + fundamentos + nota de posição causaria **contagem dupla**: as três
medem a mesma competência por ângulos diferentes. As notas por posição são usadas apenas para:

- avaliar **cobertura de posições** (§4.4);
- sugerir a função de cada atleta dentro do time;
- impedir um time sem levantador;
- melhorar a distribuição tática.

Elas influenciam a _viabilidade tática_, não a _massa de força_.

### 2.3 Peso dos fundamentos

Pesos padrão dentro da média de fundamentos (configuráveis):

| Fundamento                    | Peso |
| ----------------------------- | ---- |
| ataque, recepção, defesa      | 1,25 |
| saque, bloqueio, levantamento | 1,00 |
| posicionamento, regularidade  | 1,00 |
| cobertura, condicionamento    | 0,75 |
| comunicação                   | 0,50 |

---

## 3. Restrições duras (nunca violadas)

Verificadas como **filtro de viabilidade**, não como penalidade. Uma solução que viola
qualquer uma delas jamais é retornada.

1. **Tamanho exato** de cada time.
2. **Restrições obrigatórias** (`affinities.rigidity = 'restricao_obrigatoria'`):
   negativa ⇒ os dois **não podem** ficar no mesmo time; positiva ⇒ **devem** ficar juntos.
3. **Bloqueios manuais**: atleta travado permanece no time em que foi travado.
4. **Times travados**: nenhum membro entra ou sai.

Se as restrições duras forem **mutuamente insatisfazíveis**, o algoritmo retorna
`UnsatisfiableConstraintsError` nomeando o conjunto conflitante — nunca "resolve" o
conflito silenciosamente ignorando uma restrição.

---

## 4. Métricas

### 4.1 Equilíbrio geral (métrica principal)

```
forçaTime_t   = Σ força(atleta), atleta ∈ t
forçaMédia    = média(forçaTime)
diferença%    = (max(forçaTime) − min(forçaTime)) / forçaMédia × 100
```

Limite padrão aceitável: **5%** (`club_settings.max_imbalance_pct`).
Também calculamos o **desvio padrão** das forças de time.

### 4.2 Equilíbrio por fundamento

Para cada fundamento, a mesma fórmula de diferença percentual aplicada às somas por time.
O custo é a média das diferenças percentuais por fundamento — impede que os times empatem
no total mas um seja todo de sacadores e o outro todo de defensores.

### 4.3 Distribuição — o problema do "empate na soma"

§10.5 da especificação: `[5,5,1,1,1,1]` **não** é equivalente a `[3,3,3,3,3,3]`, mesmo com
somas iguais (14 vs 18 — e mesmo se fossem iguais). Três mecanismos, somados:

**a) Desequilíbrio por posto (rank-wise).** Ordena cada time por força decrescente e compara
o k-ésimo mais forte de cada time:

```
custoPosto = Σ ( max_t força_t[k] − min_t força_t[k] ),  k = 0 … teamSize−1
```

No exemplo acima esse custo explode, enquanto para times bem distribuídos tende a zero.
Esta é a defesa mais direta contra equilíbrio ilusório por soma.

**b) Concentração de extremos.** Contagem por time de atletas _acima_ de `eliteThreshold`
(padrão 4,0) e _abaixo_ de `beginnerThreshold` (padrão 2,0). O custo é a variância dessas
contagens entre os times.

**c) Dispersão interna.** Desvio padrão interno de cada time; o custo é a dispersão desses
desvios entre times — todos os times devem ter perfil de heterogeneidade parecido.

### 4.4 Cobertura de posições

Para cada posição exigida, cada time precisa de ao menos um atleta que a jogue (principal
ou secundária) com nota de posição ≥ mínimo configurado. Falta de cobertura é penalidade
alta (fica logo abaixo das restrições duras na ordem lexicográfica) e gera alerta explícito.
Posições que o atleta marcou como **indesejadas** não contam como cobertura.

### 4.5 Afinidades

Para cada par ordenado `(i → j)` com `i` e `j` no mesmo time:

```
contribuição = intensidade × pesoDoTipo × (intensidade < 0 ? multiplicadorNegativo : 1)
```

- `pesoDoTipo`: pessoal e tática são configuráveis separadamente (padrão 1,0 e 0,8).
- `multiplicadorNegativo`: padrão **1,8** — negativas pesam mais que positivas equivalentes.
- **Bônus mútuo**: se as duas direções têm o mesmo sinal, a contribuição do par ganha
  `+25%` (configurável).
- Uma preferência **negativa** conta como _atendida_ quando os dois ficam em times diferentes.

O escore de afinidade é convertido em custo (`custoAfinidade = −escore`) e entra somente na
etapa secundária — nunca pode piorar o equilíbrio além do limite (§5).

### 4.6 Repetição de duplas

`recentPairings[i][j]` = número de vezes que a dupla jogou junta nos últimos `N` eventos
(padrão 4). O custo é a soma desses contadores para duplas colocadas no mesmo time, com
decaimento por antiguidade (evento mais recente pesa mais).

---

## 5. Ordem de prioridade (lexicográfica)

Prioridade da especificação, e como cada nível é implementado:

| #   | Critério                          | Implementação                  |
| --- | --------------------------------- | ------------------------------ |
| 1   | Times com tamanho exato           | invariante estrutural da busca |
| 2   | Restrições obrigatórias           | filtro de viabilidade          |
| 3   | Bloqueios manuais                 | filtro de viabilidade          |
| 4   | Cobertura de posições             | penalidade de peso dominante   |
| 5   | Equilíbrio geral                  | objetivo primário              |
| 6   | Equilíbrio por fundamento         | objetivo primário (peso menor) |
| 7   | Distribuição alto/baixo nível     | objetivo primário (peso menor) |
| 8   | Afinidades                        | objetivo **secundário**        |
| 9   | Repetição de duplas               | objetivo secundário            |
| 10  | Variação de parceiros/adversários | objetivo secundário            |

### 5.1 Como a lexicografia é garantida na prática

Uma soma ponderada única não garantiria que afinidade nunca passe à frente do equilíbrio.
Por isso a busca é feita em **duas fases**:

**Fase A — equilíbrio.** Otimiza apenas os critérios 4–7 (`custoPrimário`). Ao final,
conhecemos `melhorDiff%` realmente alcançável para esta entrada.

**Fase B — refinamento sob portão.** Define o portão:

```
portão = max( limiteConfigurado , melhorDiff% + folga )      // folga padrão: 0,25 p.p.
```

Só candidatos com `diff% ≤ portão` são elegíveis. Entre eles, otimizam-se os critérios
8–10 (`custoSecundário`). **Nenhuma melhoria de afinidade é aceita se empurrar o `diff%`
acima do portão.** É assim que "afinidade nunca passa à frente do equilíbrio" vira uma
propriedade estrutural e não uma questão de calibragem de peso.

Se nem a Fase A conseguir ficar abaixo do limite configurado, o resultado é marcado com
`limiteNaoAtingido: true`, informa o `diff%` alcançado e lista as restrições que causaram
o piso (bloqueios, restrições obrigatórias, cobertura de posição, ou simplesmente a
distribuição de níveis do grupo).

---

## 6. Estratégia de busca

Determinística e barata: para 18 atletas roda em poucos milissegundos.

### 6.1 PRNG semeado

`mulberry32(seed)`. Todo sorteio (embaralhamentos, restarts, desempates) usa exclusivamente
esse gerador. Nenhuma chamada a `Math.random()` ou `Date.now()` existe no domínio.

### 6.2 Construção dos candidatos iniciais

1. **Serpentina (snake draft)** sobre a ordem decrescente de força — o clássico e um ótimo
   ponto de partida para equilíbrio de soma.
2. **Serpentina por fundamento**: uma variante semeada por fundamento dominante, que produz
   pontos de partida com perfis táticos diferentes.
3. **Guloso por déficit**: atende primeiro os atletas de posição rara; cada atleta vai para
   o time de menor força atual que ainda aceita sua posição.
4. **Restarts aleatórios semeados**: `R` permutações (padrão 64) distribuídas em blocos.

Atletas travados são fixados antes de qualquer construção; times travados saem do espaço
de busca.

### 6.3 Melhoria local

Para cada candidato, até convergir ou atingir o teto de iterações:

1. **Trocas 2-opt**: todo par de atletas em times diferentes; aplica a troca de maior ganho
   (steepest descent). Complexidade por passada: `O((n·(n−teamSize))/2)` ≈ 108 avaliações.
2. **Rotações 3-cíclicas**: `a: A→B`, `b: B→C`, `c: C→A`. Escapa de ótimos locais que a
   troca de pares sozinha não alcança.

Trocas que violem restrição dura ou bloqueio são descartadas antes da avaliação.

### 6.4 Canonicalização e deduplicação

Times são **conjuntos não ordenados**. Duas soluções que diferem apenas por trocar o nome
"Time A" com "Time B" são a **mesma** solução. Chave canônica:

```
membros de cada time ordenados por id  →  times ordenados pela lista de ids  →  join
```

Candidatos com a mesma chave são colapsados, mantendo o de menor custo. É isso que garante
o teste "opções equivalentes apenas por troca de nome são removidas".

### 6.5 Diversidade entre as opções

Além da deduplicação exata, as opções retornadas precisam ter **distância mínima** entre si
(padrão: pelo menos 2 atletas em times diferentes), evitando três opções quase idênticas.

---

## 7. As opções apresentadas

Todas partem do mesmo conjunto de candidatos viáveis; mudam apenas os critérios de escolha.

### Opção 1 — Equilíbrio máximo

Menor `custoPrimário` absoluto, após as restrições duras. Ignora afinidade e repetição.

### Opção 2 — Equilíbrio com afinidades

Entre os candidatos dentro do portão (§5.1), o de **melhor escore de afinidade**.

### Opção 3 — Variação social

Entre os candidatos dentro do portão, o de **menor repetição de duplas recentes**.

### Opção 4 — Cobertura de posições _(opcional)_

Entre os candidatos dentro do portão, o de melhor cobertura tática (mais posições exigidas
cobertas, melhor nota média na posição atribuída).

Se duas opções colapsarem na mesma formação, o sistema retorna a formação uma única vez e
informa qual outra intenção ela também atende — em vez de fingir alternativas distintas.

---

## 8. Explicação administrativa

Cada opção devolve dados estruturados (não texto solto) para a UI montar a explicação:

- `diffPct`, força total e média por time, desvio padrão;
- comparação por fundamento;
- cobertura de posições por time, com faltas destacadas;
- preferências **atendidas** e **não atendidas** (com o motivo de cada não atendida);
- restrições obrigatórias respeitadas;
- duplas repetidas recentemente;
- alertas de atletas com avaliação **provisória** ou **sem avaliação**.

Motivo de uma preferência não atendida é calculado por **contrafactual**: força-se o par no
mesmo time, reotimiza-se o restante e mede-se o `diff%` resultante. É isso que produz frases
como:

> "Esta opção apresenta diferença estimada de 2,8%. Duas preferências pessoais e uma
> afinidade tática foram atendidas. Uma preferência positiva não foi atendida porque
> elevaria a diferença estimada para 9,4%."

Essa explicação é **exclusiva de administradores**. A visão pública de um time publicado
não contém notas, afinidades nem justificativas.

---

## 9. Procedência e reprodutibilidade

Toda formação gerada persiste um snapshot JSON imutável:

```jsonc
{
  "algorithmVersion": "cva-balance/1.0.0",
  "seed": 20260721,
  "weights": {/* pesos efetivos usados */},
  "params": { "teamCount": 3, "teamSize": 6, "maxImbalancePct": 5, "gateSlackPct": 0.25 },
  "metrics": {/* métricas completas da opção escolhida */},
  "inputDigest": "fnv1a128:…", // hash da entrada normalizada
}
```

O digest é FNV-1a de 128 bits sobre uma serialização canônica (chaves e listas
ordenadas), implementado em TypeScript puro. Não é criptográfico por escolha: sua
função é provar que duas execuções receberam a mesma entrada, não resistir a
adversário.

`inputDigest` permite provar que uma regeração produziu a mesma entrada. Teste obrigatório:
duas execuções com a mesma entrada e a mesma seed retornam resultados byte-a-byte idênticos.

---

## 10. Recálculo parcial e ajuste manual

- **Recalcular desbloqueados**: atletas travados viram restrição dura; a busca roda apenas
  sobre os livres, com as capacidades restantes de cada time.
- **Ajuste manual**: cada movimento (arrastar, trocar, mover por seleção) recalcula todas as
  métricas na hora e devolve o _delta_ de `diff%`, para o admin ver o impacto antes de confirmar.
- **Versionamento**: publicar cria uma versão imutável; ajustes posteriores criam uma nova
  versão. Nenhuma versão anterior é apagada.

---

## 11. Complexidade e desempenho

| Etapa                      | Custo para n=18, t=3                 |
| -------------------------- | ------------------------------------ |
| Cálculo de forças          | O(n)                                 |
| Construção (68 candidatos) | O(R · n log n)                       |
| 2-opt por candidato        | O(passadas · n²) ≈ 10 × 108          |
| Rotação 3-cíclica          | O(passadas · n³/t) limitado por teto |
| Canonicalização            | O(C · n log n)                       |

Orçamento total < 50 ms em Node em hardware modesto. Há um teto duro de tempo
(`timeBudgetMs`, padrão 750 ms) que interrompe a busca e devolve o melhor encontrado — de
forma determinística, cortando por número de iterações e não por relógio, para não quebrar
a reprodutibilidade.
