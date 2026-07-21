# CVA Gestão

Sistema de gestão do **Conexão Voleibol Alegrete** — atletas, avaliações,
afinidades, presenças, formação de times, rodízio das partidas, histórico e o
caixa do grupo.

> **Grupo criado em 06/11/2023 · "Apenas vôlei e amizades"**

---

## Stack

| Camada       | Escolha                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Aplicação    | Next.js 15 (App Router), React 19, TypeScript **strict**                                                    |
| Estilo       | Tailwind CSS v4 com tokens próprios da identidade do CVA                                                    |
| Banco        | PostgreSQL + Drizzle ORM, migrations SQL versionadas                                                        |
| Autenticação | Própria: Argon2id + sessão em banco com cookie assinado ([ADR-0001](docs/adr/0001-autenticacao-propria.md)) |
| Autorização  | Policies TypeScript no servidor ([ADR-0002](docs/adr/0002-policies-em-vez-de-rls.md))                       |
| Testes       | Vitest (unitário e integração com Postgres real) + Playwright (E2E)                                         |
| Deploy       | Vercel + Supabase (Postgres gerenciado e Storage)                                                           |

---

## Como rodar

Pré-requisitos: **Node 20.11+** e **Docker** (para o Postgres local).

```bash
# 1. Dependências
npm install

# 2. Ambiente
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# cole o valor em AUTH_SECRET no .env.local

# 3. Banco
docker compose up -d
npm run db:migrate

# 4. Dados de demonstração (opcional, mas recomendado para conhecer o sistema)
npm run db:seed

# 5. Primeiro administrador
npm run bootstrap:admin -- --email=voce@exemplo.com --name=SeuNome

# 6. Subir
npm run dev
```

Acesse <http://localhost:3000>.

> **Atenção ao passo 5 no PowerShell:** um nome com espaço precisa de aspas em
> volta do argumento inteiro — `--name="Seu Nome"` é quebrado pelo PowerShell.
> Prefira `npm run bootstrap:admin` sem argumentos e responda aos prompts.

A senha do administrador é exibida **uma única vez** no terminal. Para definir
uma senha específica, exporte `ADMIN_PASSWORD` antes de rodar.

### O que o seed cria

18 atletas fictícios (níveis de 1,5 a 5, posições variadas, três com avaliação
provisória), metade com conta e metade como perfil gerenciado; afinidades
positivas, negativas e uma restrição obrigatória; dois encontros finalizados
(quadra de R$ 150 e de R$ 160, um com pagamento pendente); um encontro aberto
com 18 confirmados; e um churrasco. Contas de demonstração usam o domínio
`@demo.cva.local` com a senha `demo123456789`.

Os times e as partidas do seed passam pelo mesmo algoritmo e pela mesma máquina
de rodízio da aplicação — não são dados inventados.

---

## Scripts

| Comando                       | O que faz                          |
| ----------------------------- | ---------------------------------- |
| `npm run dev`                 | Servidor de desenvolvimento        |
| `npm run build` / `npm start` | Build e execução de produção       |
| `npm run lint` / `lint:fix`   | ESLint                             |
| `npm run typecheck`           | TypeScript sem emitir              |
| `npm test`                    | Vitest (unitário + integração)     |
| `npm run test:e2e`            | Playwright                         |
| `npm run verify`              | lint + typecheck + test + build    |
| `npm run db:generate`         | Gera migration a partir do schema  |
| `npm run db:migrate`          | Aplica migrations                  |
| `npm run db:seed`             | Seed de demonstração               |
| `npm run db:reset`            | Esvazia o banco (pede confirmação) |
| `npm run bootstrap:admin`     | Cria o primeiro administrador      |

---

## Estrutura

```
src/
  domain/          Regras puras: sem banco, sem rede, sem React
    team-balancing/  Gerador de times (determinístico, sem IA)
    rotation/        Rodízio das partidas
    finance/         Dinheiro em centavos inteiros
    positions/       Posições e fundamentos
    shared/          Notas, dinheiro, PRNG, erros de domínio
  db/
    schema/          Tabelas por domínio
    migrations/      SQL versionado
    scripts/         migrate, seed, reset, bootstrap-admin
  server/
    policies/        Autorização — puro e testável sem infraestrutura
    auth/            Senha, sessão, rate limit
    services/        Ponte entre domínio e banco
    actions/         Server actions (fronteira: Zod + policy)
  app/
    (publico)/       entrar, cadastro, aguardando-aprovacao, recuperar-acesso
    (atleta)/app/    início, agenda, evento, times, perfil, autoavaliação…
    (admin)/admin/   painel, atletas, avaliações, afinidades, encontros…
  components/        Design system e componentes de domínio
e2e/                 Playwright
docs/                Especificação, algoritmo e ADRs
```

O domínio não importa nada de `server/`, `db/` ou `app/`. É o que permite testar
o gerador de times e o rodízio em milissegundos, sem banco.

---

## Documentação

- [`docs/product-spec.md`](docs/product-spec.md) — regras de negócio, fonte de verdade
- [`docs/team-balancing-algorithm.md`](docs/team-balancing-algorithm.md) — como os times são montados
- [`docs/permissions.md`](docs/permissions.md) — quem pode ver e fazer o quê
- [`docs/deploy.md`](docs/deploy.md) — publicação em Vercel + Supabase
- [`docs/adr/`](docs/adr/) — decisões arquiteturais e seus motivos

---

## Testes

```bash
npm test           # 141 testes: domínio, policies e integração com Postgres
npm run test:e2e   # 28 testes end-to-end
```

Os testes de integração usam **Postgres real** (um banco por worker do Vitest),
não um banco em memória: provar que duas confirmações simultâneas não produzem
19 confirmados depende de `SELECT ... FOR UPDATE` com conexões concorrentes, e
um banco de conexão única passaria no teste sem provar nada.

Sem Docker rodando, os testes de integração são **pulados** em vez de falharem.

---

## Identidade visual

O brasão oficial precisa ser adicionado em `public/brand/` — ver
[`public/brand/README.md`](public/brand/README.md). O sistema **não redesenha** o
brasão; o componente `ClubMark` cuida apenas do enquadramento (proporção
preservada, área de respiro para não cortar as três estrelas).

Enquanto o arquivo não existir, as telas funcionam normalmente, mas o espaço do
brasão aparece vazio.

---

## Limitações conhecidas

1. **Sem envio de e-mail.** A recuperação de acesso gera e armazena o token com
   hash e expiração, mas não existe provedor de e-mail configurado — a conclusão
   depende de um administrador. Integrar um provedor é o próximo passo natural.
2. **Storage de avatares não conectado.** As colunas e a interface existem; falta
   ligar o upload ao Supabase Storage.
3. **Arte de compartilhamento é texto.** A mensagem para WhatsApp está pronta e
   testada; a imagem com o brasão e os três times ainda não é gerada.
4. **Notificações são apenas registro em banco.** A tabela existe e é populada;
   não há push nem badge na interface.
5. **PWA e modo offline** do painel de quadra não foram implementados (estavam
   listados como fase complementar).
