# CVA Gestão — Especificação de Produto

> Sistema de gestão do **Conexão Voleibol Alegrete (CVA)**.
> Este documento é a fonte de verdade das regras de negócio. Código e testes devem
> referenciar as seções daqui (ex.: `§10.2`) quando implementarem uma regra.

---

## 1. Contexto

O CVA é um grupo de voleibol amador de Alegrete/RS, criado em 06/11/2023, com o lema
"Apenas vôlei e amizades". O sistema organiza atletas, avaliações técnicas, afinidades,
presenças, formação de times, rodízio das partidas, histórico dos jogos e o caixa interno.

**Operação padrão de um encontro:**

| Parâmetro            | Valor padrão                                  |
| -------------------- | --------------------------------------------- |
| Atletas por encontro | 18                                            |
| Times                | 3                                             |
| Atletas por time     | 6                                             |
| Times em quadra      | 2 (1 aguardando)                              |
| Valor por atleta     | R$ 10,00                                      |
| Arrecadação esperada | R$ 180,00                                     |
| Custo da quadra      | variável — normalmente R$ 150,00 ou R$ 160,00 |
| Destino do excedente | caixa do grupo                                |

Não existem mensalidades. Eventos extraordinários (churrasco, confraternização) têm
cobrança personalizada.

Todos esses números são **configuração** (`club_settings`), não constantes de código.

---

## 2. Princípios

1. Equilíbrio esportivo tem precedência sobre preferências pessoais.
2. Afinidades são consideradas quando não causam desequilíbrio relevante.
3. A avaliação **oficial** é definida pelos administradores.
4. A **autoavaliação** é referência e nunca substitui a oficial.
5. Avaliações, afinidades negativas e finanças são dados privados.
6. A montagem dos times é explicável, reproduzível e ajustável.
7. Mobile-first para o atleta; densidade de informação para o administrador em desktop.
8. Nada de aparência de template genérico.
9. O sistema é para uso real, não para demonstração.

---

## 3. Papéis e permissões

Papéis **não são mutuamente exclusivos**: um administrador também pode ser atleta.
Modelado como `user_roles` (N:N), não como coluna `role` única.

### 3.1 Matriz de permissões

| Recurso                               | Administrador | Atleta                                                                        |
| ------------------------------------- | ------------- | ----------------------------------------------------------------------------- |
| Cadastrar/editar qualquer atleta      | ✅            | ❌ (só o próprio, campos permitidos)                                          |
| Aprovar cadastros                     | ✅            | ❌                                                                            |
| Definir avaliação oficial             | ✅            | ❌                                                                            |
| Ver avaliação oficial de terceiros    | ✅            | ❌                                                                            |
| Ver a **própria** avaliação oficial   | ✅            | ❌ por padrão — liberável em `club_settings.self_official_evaluation_visible` |
| Enviar autoavaliação                  | ✅            | ✅ (própria)                                                                  |
| Ver afinidades de terceiros           | ✅            | ❌                                                                            |
| Cadastrar as próprias afinidades      | ✅            | ✅                                                                            |
| Criar restrição obrigatória           | ✅            | ❌                                                                            |
| Criar/gerenciar eventos               | ✅            | ❌                                                                            |
| Confirmar/cancelar a própria presença | ✅            | ✅                                                                            |
| Confirmar presença de terceiros       | ✅            | ❌                                                                            |
| Gerar / editar / publicar times       | ✅            | ❌                                                                            |
| Ver times publicados                  | ✅            | ✅                                                                            |
| Operar rodízio e registrar resultados | ✅            | ❌                                                                            |
| **Qualquer** recurso financeiro       | ✅            | ❌ (403)                                                                      |
| Observações administrativas           | ✅            | ❌                                                                            |
| Restrições médicas de terceiros       | ✅            | ❌                                                                            |
| Auditoria                             | ✅            | ❌                                                                            |
| Configurações do clube                | ✅            | ❌                                                                            |

### 3.2 Regras invioláveis

- **Não existe ranking técnico público.**
- Times publicados **nunca** exibem notas, afinidades ou justificativas privadas.
- Ocultar no frontend não é proteção. Toda leitura sensível passa por uma _policy_ no
  servidor (`src/server/policies`). Um atleta que chame um endpoint financeiro recebe
  `403`, não uma lista vazia.
- O alvo de uma afinidade **nunca** é notificado nem consegue descobrir que foi alvo.

---

## 4. Cadastro de atletas

### 4.1 Autocadastro

Onboarding em 6 etapas, com rascunho persistido entre etapas:

1. Dados pessoais
2. Informações esportivas
3. Posições
4. Autoavaliação técnica
5. Preferências de afinidade
6. Revisão e envio

Ao enviar, o cadastro fica `aguardando_aprovacao`. O administrador pode **aprovar**,
**solicitar ajustes**, **rejeitar** ou **vincular a um perfil existente**.

### 4.2 Cadastro pelo administrador

O administrador cria um atleta **sem conta** (perfil "gerenciado"). Esse perfil participa
de eventos, recebe avaliação, entra em times, tem presença, histórico e pagamentos.

### 4.3 Vínculo de conta (claim)

Um perfil gerenciado vira uma conta por:

- **Convite** — o admin gera um token de uso único com validade (padrão 7 dias); ou
- **Reivindicação** — o atleta se cadastra, o sistema detecta e-mail ou telefone
  coincidente e cria uma solicitação de vínculo que o admin aprova.

Invariante: `athlete_account_links` garante no máximo **um** atleta por usuário e
**um** usuário por atleta (índices únicos parciais sobre registros ativos).

### 4.4 Campos do atleta

Nome completo, apelido, foto, telefone, e-mail, data de nascimento (opcional), número da
camisa, tamanho do uniforme, data de entrada, status (`ativo | inativo | afastado |
lesionado`), posição principal, posições secundárias, posições que prefere não jogar,
observações do atleta, **observações privadas dos admins**, **restrições físicas/médicas**.

Os dois últimos campos jamais são serializados para um cliente de atleta.
Exclusão é **lógica** (`deleted_at`) para preservar histórico.

---

## 5. Posições

Padrão: Levantador, Ponteiro, Central, Oposto, Líbero, Coringa. Configuráveis.

Cada atleta tem uma posição principal, N secundárias, N indesejadas, e — por posição —
uma nota oficial e uma nota de autoavaliação.

**Escala:** 1,0 a 5,0 em incrementos de 0,5. `null` = "não avaliado" e **nunca** é
tratado como zero em nenhum cálculo.

---

## 6. Avaliações

Autoavaliação e avaliação oficial são tabelas **totalmente separadas**.

### 6.1 Fundamentos avaliados

`nivel_geral`, `saque`, `recepcao`, `levantamento`, `ataque`, `bloqueio`, `defesa`,
`cobertura`, `posicionamento`, `regularidade`, `condicionamento`, `comunicacao`.

Cada critério: nota 1–5 (passo 0,5), opção "não sei avaliar" (`null`), descrição objetiva
de cada nível, observação opcional.

### 6.2 Autoavaliação

Reenvio permitido; cada envio cria uma **nova revisão** (`revision` incremental) e
preserva as anteriores. Apenas a revisão mais recente é "atual".

**A autoavaliação nunca alimenta o gerador de times.**

### 6.3 Avaliação oficial

O admin vê lado a lado: autoavaliação atual · diferença · avaliação oficial atual, mais o
histórico e observações anteriores. Define nível geral, notas por fundamento, notas por
posição, status (`provisoria | definitiva`), observação interna e justificativa.

Somente a avaliação oficial (definitiva ou provisória aprovada) alimenta o algoritmo.

### 6.4 Avaliação provisória

Atletas novos recebem avaliação provisória. Após `club_settings.provisional_review_after_events`
participações (padrão **3**), o sistema **avisa** os administradores. Nunca altera nota
automaticamente — o admin mantém ou altera, e a decisão é registrada.

### 6.5 Histórico imutável

Toda alteração oficial grava em `evaluation_history`: atleta, admin responsável, valor
anterior, novo valor, critérios alterados, data/hora, justificativa e status. A tabela é
append-only (sem `UPDATE`/`DELETE` na camada de aplicação).

---

## 7. Afinidades

**Direcionais.** João → Pedro `+2` não implica Pedro → João. Reciprocidade nunca é presumida.

- **Tipos:** pessoal, tática (pesos configuráveis separadamente).
- **Intensidade:** −3 … +3 (positivo = jogar junto; negativo = jogar separado).
- **Rigidez:** `preferencia_flexivel` ou `restricao_obrigatoria`. Só o admin cria restrição obrigatória.

### 7.1 Privacidade

O atleta vê **apenas** o que ele mesmo cadastrou. O alvo não é informado. Afinidades
negativas nunca são públicas. Explicações públicas de times não citam afinidades;
explicações administrativas podem dizer quais preferências foram ou não atendidas.

### 7.2 Uso no algoritmo

- Positivas são preferências flexíveis.
- Negativas pesam **mais** que positivas de mesma intensidade (multiplicador configurável).
- Relações mútuas ganham peso adicional.
- Uma afinidade positiva **nunca** justifica ultrapassar o limite de desequilíbrio.
- Restrições obrigatórias **jamais** são violadas (restrição dura, não penalidade).

---

## 8. Eventos e presenças

Tipos: `encontro`, `treino`, `amistoso`, `campeonato`, `confraternizacao`, `outro`.

Campos: título, data, horário, local, endereço, observações, prazo de confirmação, custo
da quadra, valor por atleta, limite de participantes, status
(`rascunho | publicado | em_andamento | finalizado | cancelado`).

### 8.1 Status de participação

`confirmado`, `talvez`, `nao_participa`, `lista_espera`, `cancelou_apos_prazo`,
`presente`, `faltou`, `falta_avisada`, `falta_sem_aviso`, `chegou_atrasado`,
`saiu_antecipadamente`.

### 8.2 Lista de espera

- O 19º **não** é confirmado: entra na lista de espera com posição de fila.
- Em cancelamento, o primeiro da fila é promovido **na mesma transação**.
- **Invariante de concorrência:** duas confirmações simultâneas nunca produzem 19
  confirmados. Implementado com `SELECT ... FOR UPDATE` na linha do evento +
  índice único parcial de contagem. Testado com transações concorrentes reais.
- O admin pode reordenar a fila, confirmar ou remover manualmente, e confirmar em nome
  de um perfil gerenciado.

### 8.3 Formação inválida após cancelamento

Se os times já foram publicados e alguém cancela: alerta claro, formação marcada como
`needs_review`, opção de substituir pelo primeiro da lista de espera, opção de recalcular
somente os atletas **não bloqueados**, e preservação de todas as versões anteriores.

---

## 9. Gerador de times

Ver `docs/team-balancing-algorithm.md` para a especificação completa.

Resumo das garantias:

- 18 confirmados ⇒ exatamente 3 times de 6.
- Sem 18 confirmados, o modo padrão **não roda**: o sistema explica o problema e exige
  override administrativo explícito.
- Determinístico: mesma entrada + mesma seed ⇒ mesmo resultado.
- Prioridade **lexicográfica** (§10.2 do prompt): tamanho → restrições obrigatórias →
  bloqueios → posições → equilíbrio geral → equilíbrio por fundamento → distribuição →
  afinidades → repetição de duplas → variação.
- Métrica principal: `diff% = (maiorForça − menorForça) / forçaMédia × 100`, limite
  padrão **5%** (configurável). Se inatingível: devolve a melhor combinação e explica
  quais restrições impediram.
- Mínimo de **3 opções distintas**: Equilíbrio máximo · Equilíbrio com afinidades ·
  Variação social. Opcional: Cobertura de posições.
- Roda no servidor. Registra versão do algoritmo, pesos, seed, parâmetros e métricas.

### 9.1 Ajuste manual e publicação

Arrastar entre times, trocar dois atletas, mover por seleção (alternativa acessível ao
drag & drop), bloquear atleta ou time inteiro, recalcular só os desbloqueados, desfazer,
restaurar a sugestão original, ver impacto de cada troca, publicar versão.

Publicar cria uma **versão imutável** com admin, data/hora, e gera texto de WhatsApp e
arte compartilhável — sem notas, afinidades ou dados financeiros.

---

## 10. Rodízio das partidas

Três times: dois jogam, um aguarda.

**Regras:**

1. Partida 1: A × B, C aguarda. Vencedor permanece, perdedor sai, quem aguardava entra.
2. A partir daí, **nenhum time joga mais de 2 partidas consecutivas**. Ao completar a
   segunda consecutiva o time sai obrigatoriamente, tenha vencido ou perdido.
3. O vencedor só permanece quando isso não viola o limite de 2.
4. Nenhum time descansa duas partidas seguidas.

**Sequência canônica** (A vence a partida 1):

| #   | Jogam | Aguarda | Observação                                 |
| --- | ----- | ------- | ------------------------------------------ |
| 1   | A × B | C       | A vence                                    |
| 2   | A × C | B       | A está na 2ª consecutiva                   |
| 3   | B × C | A       | A sai obrigatoriamente, qualquer resultado |
| 4   | A × B | C       | C sai obrigatoriamente (2ª consecutiva)    |

Empate na primeira partida: o administrador escolhe quem permanece.
Override manual: permitido, **exige justificativa** e gera registro de auditoria.
Corrigir a última ação restaura exatamente o estado anterior.

### 10.1 Painel de quadra

Modo operacional para uso durante o encontro: confronto atual em destaque, time da
esquerda/direita, time aguardando, placar opcional, número da partida, jogos consecutivos
de cada time, quem sai depois, próximo confronto previsto, "Encerrar partida", "Corrigir
última ação", histórico da sequência. Botões grandes, sem ruído administrativo.

---

## 11. Financeiro

**Exclusivo de administradores.** Protegidos: páginas, endpoints, server actions,
consultas, dados serializados, arquivos e relatórios. Atleta recebe erro de autorização.

**Todo valor monetário é armazenado em centavos (`integer`).** Nunca ponto flutuante.

### 11.1 Fórmulas

```
valorEsperado      = qtdAtletasCobrados × valorPorAtleta
excedenteEsperado  = valorEsperado − custoDaQuadra
excedenteRealizado = valorRecebido   − despesasPagas
```

Exemplos obrigatórios (cobertos por teste):

| Cenário                 | Resultado                               |
| ----------------------- | --------------------------------------- |
| 18 × R$ 10,00           | R$ 180,00 esperado                      |
| quadra R$ 150,00        | excedente esperado R$ 30,00             |
| quadra R$ 160,00        | excedente esperado R$ 20,00             |
| 17 pagamentos recebidos | R$ 170,00 recebidos, R$ 10,00 pendentes |

### 11.2 Pagamentos individuais

Status: `pendente | pago | parcial | dispensado | estornado`.
Campos: valor devido, valor pago, método (`pix | dinheiro | outro`), data, observação,
admin responsável. O atleta não visualiza nada disso.

### 11.3 Fechamento e caixa

Status financeiro do evento: `aberto | parcialmente_recebido | fechado`.

**O saldo do caixa considera apenas valores efetivamente recebidos e pagos.**
Receita esperada nunca conta como dinheiro disponível.

Ajustes manuais exigem motivo e geram auditoria.

### 11.4 Eventos extraordinários

Nome, data, participantes, valor por pessoa **ou** valor total rateado, valores recebidos,
despesas, resultado e incorporação do excedente ao caixa.

**Fora de escopo:** mensalidades, juros, multas automáticas, planos, assinaturas, boletos,
gateway de pagamento, cobrança recorrente, contabilidade empresarial.

---

## 12. Comunicação

Comunicados internos, aviso de novo evento, confirmação de presença, alerta de lista de
espera, aviso de vaga liberada, aviso de times publicados, mensagem pronta para WhatsApp,
compartilhamento nativo (Web Share API) e arte dos times com a identidade do CVA.

A mensagem compartilhável contém: nome do evento, data/hora, local, Times A/B/C, confronto
inicial, time que começa aguardando e observações.
**Nunca contém** notas, afinidades, dados financeiros ou observações internas.

Sem integração com a API oficial do WhatsApp nesta versão.

---

## 13. Configurações do clube

| Configuração                              | Valor inicial                   |
| ----------------------------------------- | ------------------------------- |
| Nome / nome curto                         | Conexão Voleibol Alegrete / CVA |
| Valor por atleta                          | R$ 10,00                        |
| Custo padrão da quadra                    | R$ 150,00                       |
| Capacidade                                | 18                              |
| Times                                     | 3                               |
| Atletas por time                          | 6                               |
| Limite de desequilíbrio                   | 5%                              |
| Revisão de provisória                     | 3 participações                 |
| Visibilidade da própria avaliação oficial | oculta                          |
| Fuso                                      | America/Sao_Paulo               |
| Idioma / moeda                            | pt-BR / BRL                     |

Também configuráveis: logo, pesos do algoritmo, pesos das afinidades, critérios
obrigatórios de posição, nomes e cores dos times, horário do clube.

---

## 14. Segurança

Autorização no servidor, validação e sanitização de entrada (Zod em toda fronteira),
proteção contra acesso horizontal e vertical, rate limit em autenticação e ações
sensíveis, auditoria, logs de erro, confirmação em ações destrutivas, política de senha,
recuperação de acesso, expiração de convites, restrição de tipo e tamanho de upload.

**Nunca enviado ao cliente de um atleta:** avaliações oficiais de terceiros, afinidades de
terceiros, notas privadas, dados financeiros, logs internos, informações médicas de terceiros.

---

## 15. Acessibilidade

Navegação por teclado, foco visível, labels reais, erros associados aos campos, contraste
WCAG AA, áreas de toque adequadas, status que não dependem só de cor, `prefers-reduced-motion`,
alternativa ao drag & drop, layout funcional a partir de ~360 px.

---

## 16. Rotas

**Públicas:** `/entrar` · `/cadastro` · `/aguardando-aprovacao` · `/recuperar-acesso`

**Atleta:** `/app` · `/app/agenda` · `/app/eventos/[id]` · `/app/times` · `/app/perfil` ·
`/app/autoavaliacao` · `/app/preferencias` · `/app/historico`

**Admin:** `/admin` · `/admin/atletas[/id]` · `/admin/avaliacoes` · `/admin/afinidades` ·
`/admin/eventos[/id]` (+ `/presencas`, `/times`, `/quadra`) · `/admin/historico` ·
`/admin/financeiro[/eventos/id]` · `/admin/configuracoes` · `/admin/auditoria`

---

## 17. Decisões arquiteturais assumidas

Registradas em `docs/adr/`. Resumo:

| #    | Decisão                                                                         |
| ---- | ------------------------------------------------------------------------------- |
| 0001 | Auth própria (cookie assinado + Argon2) em vez de Supabase Auth / NextAuth beta |
| 0002 | Autorização em _policies_ TypeScript no servidor em vez de RLS                  |
| 0003 | Dinheiro em centavos inteiros                                                   |
| 0004 | Drizzle ORM com migrations SQL versionadas                                      |
| 0005 | PGlite para testes de integração de banco                                       |
| 0006 | Algoritmo de times determinístico, sem IA                                       |
