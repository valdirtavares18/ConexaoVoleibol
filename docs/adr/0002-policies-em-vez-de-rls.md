# ADR-0002 — Autorização em policies TypeScript em vez de Row Level Security

**Status:** aceita · **Data:** 2026-07-21

## Contexto

A especificação pede *"Row Level Security **ou uma camada equivalente de
autorização**"*. As regras de acesso deste sistema não são triviais:

- financeiro é **totalmente** invisível a atletas (páginas, endpoints, actions,
  consultas, relatórios);
- afinidades são **direcionais e assimétricas**: o autor vê a própria
  preferência, o alvo não pode nem saber que ela existe;
- a avaliação oficial do próprio atleta é oculta **por padrão**, com uma
  configuração administrativa que pode liberá-la;
- papéis não são exclusivos: um administrador também pode ser atleta.

## Decisão

Autorização em um módulo puro de policies (`src/server/policies/`), obrigatório
em toda fronteira de servidor. Como decorre da ADR-0001 (sessão própria, sem
JWT do Supabase), não haveria `auth.uid()` para o RLS consumir de qualquer forma.

Três garantias de projeto:

1. **Falha fechada.** Sem `Actor`, tudo é negado.
2. **Erro, não lista vazia.** Atleta em rota financeira recebe `403` explícito —
   uma lista vazia pareceria "não há dados" e esconderia o bug de permissão.
3. **Sanitização remove o campo do objeto.** `sanitizeAthlete` e
   `sanitizeFormation` **deletam** `adminNotes`, `healthRestrictions`, métricas e
   afinidades do payload. Um atleta que inspecione a resposta do RSC não acha os
   campos — não é ocultação no frontend.

## Consequências

**A favor**

- Regras testáveis sem infraestrutura: 28 testes unitários rodam em 10 ms e
  cobrem exatamente os casos de §23.2, §23.3 e §23.7.
- As regras ficam legíveis em um lugar só, em vez de espalhadas por políticas SQL.
- Mensagens de erro em pt-BR já adequadas ao usuário final.

**Contra**

- **A proteção não vale para acesso direto ao banco.** Quem tiver a
  `DATABASE_URL` lê tudo. Aceitável: a connection string é segredo de servidor,
  nunca vai ao cliente, e o Supabase permite restringir por rede.
- Exige disciplina: uma consulta nova precisa passar pela policy. Mitigado por
  concentrar o acesso em repositórios que exigem `Actor` na assinatura.

## Reversibilidade

Se o acesso direto ao banco virar uma preocupação real, dá para **somar** RLS a
esta camada sem removê-la: as policies continuariam valendo na aplicação, e o
RLS seria uma segunda barreira. As decisões não são excludentes.
