# Permissões

Referência de quem pode ver e fazer o quê. As regras vivem em
`src/server/policies/` e são cobertas por 28 testes unitários que rodam sem
infraestrutura.

---

## Princípios

1. **Falha fechada.** Sem `Actor`, tudo é negado.
2. **Erro, não lista vazia.** Um atleta que acessa um recurso financeiro recebe
   `403` explícito. Devolver lista vazia pareceria "não há dados" e esconderia
   um bug de permissão.
3. **Sanitização remove o campo do objeto.** `sanitizeAthlete` e
   `sanitizeFormation` **deletam** os campos sensíveis do payload. Um atleta que
   inspecione a resposta do servidor não encontra `adminNotes`, métricas ou
   afinidades — não é ocultação na interface.
4. **Papéis não são exclusivos.** Um administrador também pode ser atleta. É
   modelado como `user_roles` (N:N), não como uma coluna `role` única.

---

## Matriz

| Recurso                                        | Administrador                       | Atleta                                     |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------------ |
| Cadastrar/editar qualquer atleta               | ✅                                  | ❌ (só o próprio, campos permitidos)       |
| Aprovar, recusar ou pedir ajustes em cadastros | ✅                                  | ❌                                         |
| Vincular conta a perfil existente              | ✅                                  | ❌                                         |
| Remover atleta (exclusão lógica)               | ✅                                  | ❌                                         |
| Definir avaliação oficial                      | ✅                                  | ❌                                         |
| Ver avaliação oficial de terceiros             | ✅                                  | ❌ **sempre**                              |
| Ver a **própria** avaliação oficial            | ✅                                  | ❌ por padrão · liberável em configurações |
| Enviar autoavaliação                           | ✅                                  | ✅ (a própria)                             |
| Ver autoavaliação de terceiros                 | ✅                                  | ❌                                         |
| Ver histórico de avaliação                     | ✅                                  | ❌                                         |
| Cadastrar as próprias preferências             | ✅                                  | ✅                                         |
| Ver preferências de terceiros                  | ✅                                  | ❌                                         |
| Descobrir quem o marcou como preferência       | ❌ _(nem admin expõe isso ao alvo)_ | ❌                                         |
| Criar restrição obrigatória                    | ✅                                  | ❌                                         |
| Criar/editar/publicar encontros                | ✅                                  | ❌                                         |
| Confirmar a própria presença                   | ✅                                  | ✅                                         |
| Confirmar presença de terceiros                | ✅                                  | ❌                                         |
| Reordenar a lista de espera                    | ✅                                  | ❌                                         |
| Gerar, ajustar e publicar times                | ✅                                  | ❌                                         |
| Ver times publicados                           | ✅                                  | ✅                                         |
| Ver métricas, afinidades e alertas da formação | ✅                                  | ❌                                         |
| Operar o painel de quadra                      | ✅                                  | ❌                                         |
| **Qualquer** recurso financeiro                | ✅                                  | ❌ (403)                                   |
| Observações internas dos administradores       | ✅                                  | ❌ _(nem o próprio atleta)_                |
| Restrições médicas                             | ✅                                  | ✅ (as próprias)                           |
| Auditoria                                      | ✅                                  | ❌                                         |
| Configurações do clube                         | ✅                                  | ❌                                         |

---

## Regras invioláveis

- **Não existe ranking técnico público.** Nenhuma tela lista atletas por nota.
- **Times publicados nunca exibem** notas, afinidades ou justificativas.
- **O alvo de uma afinidade nunca é informado.** Não existe — nem no servidor —
  consulta de "quem me marcou". A visibilidade depende sempre de `fromAthleteId`;
  se dependesse de `toAthleteId`, bastaria inverter um parâmetro para descobrir.
- **A autoavaliação nunca vira nota oficial.** As tabelas são separadas e a
  consulta que alimenta o gerador de times não toca nas de autoavaliação.

---

## Camadas de proteção

Uma requisição a um recurso financeiro passa por três barreiras independentes:

1. **Layout** `src/app/(admin)/admin/layout.tsx` — redireciona antes de renderizar.
2. **Serviço** — toda função exportada de `src/server/services/finance.ts` chama
   `requireFinanceAccess` como primeira instrução. Não existe função de leitura
   sem ator nesse módulo.
3. **Server action** — valida com Zod e busca o ator no servidor, nunca
   confiando em um id vindo do formulário.

A redundância é deliberada: um layout esquecido no futuro não abre o caixa.

---

## Campos por visibilidade

### `athletes`

| Campo                                        | Terceiros | O próprio | Admin |
| -------------------------------------------- | --------- | --------- | ----- |
| nome, apelido, foto, camisa, status, entrada | ✅        | ✅        | ✅    |
| telefone, e-mail, nascimento, uniforme       | ❌        | ✅        | ✅    |
| `athleteNotes` (observação do atleta)        | ❌        | ✅        | ✅    |
| `healthRestrictions` (restrição física)      | ❌        | ✅        | ✅    |
| `adminNotes` (observação interna)            | ❌        | ❌        | ✅    |

### Formação de times

| Campo                                      | Atleta | Admin |
| ------------------------------------------ | ------ | ----- |
| times e nomes dos atletas                  | ✅     | ✅    |
| `metrics` (diferença, forças, fundamentos) | ❌     | ✅    |
| `affinityOutcomes`                         | ❌     | ✅    |
| `alerts`                                   | ❌     | ✅    |
| `provenance` (seed, pesos, digest)         | ❌     | ✅    |

---

## Outras proteções (§20)

- **Rate limit** em login (8/15 min), recuperação (4/h) e cadastro (5/h), por
  e-mail **e** por IP, com contador no banco — memória local não funcionaria
  entre instâncias serverless.
- **Mensagem genérica** em falha de login e em recuperação de acesso: credencial
  errada e conta inexistente respondem exatamente igual, para não permitir
  enumerar quem faz parte do grupo.
- **Auditoria append-only** para ações sensíveis, com justificativa obrigatória
  em override de rodízio, ajuste de caixa, dispensa/estorno de cobrança,
  remoção de atleta e cancelamento de encontro.
- **Troca de senha revoga todas as sessões.**
- Cookie `httpOnly`, `sameSite=lax`, `secure` em produção.
