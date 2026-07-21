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
npm test           # domínio, policies e integração com Postgres
npm run test:e2e   # end-to-end (pare o `npm run dev` antes — veja abaixo)
```

> **Pare o servidor de desenvolvimento antes do `test:e2e`.** Os testes rodam
> contra o build de produção, e `next dev` e `next build` escrevem na mesma
> pasta `.next`: com os dois ativos, o servidor de produção sobe com artefatos
> misturados e falha com `TypeError: a[d] is not a function`.

Os testes de integração usam **Postgres real** (um banco por worker do Vitest),
não um banco em memória: provar que duas confirmações simultâneas não produzem
19 confirmados depende de `SELECT ... FOR UPDATE` com conexões concorrentes, e
um banco de conexão única passaria no teste sem provar nada.

Sem Docker rodando, os testes de integração são **pulados** em vez de falharem.

---

## Identidade visual

Os arquivos de marca em `public/brand/` são **gerados** a partir do PDF vetorial
oficial do brasão:

```bash
node scripts/gerar-marca.mjs "caminho/para/LOGO CONEXÃO VETOR.pdf"
```

O sistema **não redesenha** o brasão — o script apenas rasteriza em alta
resolução, recorta a margem e gera os tamanhos; o componente `ClubMark` cuida do
enquadramento (proporção preservada, respiro para não cortar as três estrelas).

Se o clube atualizar a arte, rode o comando com o PDF novo e faça commit do
resultado. Detalhes em [`public/brand/README.md`](public/brand/README.md).

---

## Integrações opcionais

Tudo abaixo funciona **sem configurar nada** em desenvolvimento; as variáveis
apenas trocam o destino em produção.

### E-mail

Sem `RESEND_API_KEY`, o e-mail é impresso no terminal com o link clicável — o
fluxo de recuperação de acesso é testável de ponta a ponta sem provedor. Com a
chave definida, os mesmos e-mails saem pelo [Resend](https://resend.com).

Mensagens implementadas: recuperação de acesso, cadastro aprovado, vaga liberada
na lista de espera e times publicados.

O envio é sempre **em segundo plano**: um provedor lento ou fora do ar não pode
segurar a confirmação de presença nem estourar o tempo de uma transação.

### Storage de avatares

Sem `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, os arquivos vão para
`public/uploads/`. Com as chaves, vão para o bucket do Supabase (que precisa ser
público). Em ambos os casos a validação é a mesma: até 2 MB, JPG/PNG/WEBP,
conferindo a **assinatura dos bytes** e não só o `Content-Type` declarado.

### Arte compartilhável

`GET /api/eventos/[id]/arte` devolve um PNG 1080×1350 com a identidade do CVA e
os três times, gerado sob demanda. Exige sessão ativa — a arte lista nomes de
pessoas. O botão "Arte" aparece ao lado de "Compartilhar" nas telas de times.

### PWA

O app é instalável (`manifest.ts`), abre direto em `/app` sem barra de endereço e
avisa de forma destacada quando a conexão cai — importante no ginásio, onde o
sinal é ruim e quem opera o painel de quadra precisa saber na hora que o
resultado não foi salvo.

---

## Limitações conhecidas

1. **Sem push notification.** Os avisos aparecem no app (`/app/avisos`, com
   contador no cabeçalho) e por e-mail. Push no navegador exigiria chaves VAPID
   e um service worker próprio — não implementado.
2. **Sem sincronização offline.** O app avisa quando a conexão cai, mas não
   enfileira ações para reenviar depois. Fazer isso no painel de quadra exigiria
   resolução de conflito e mudaria a semântica do rodízio.
3. **Estatísticas avançadas** (aproveitamento de duplas, comparação entre
   equilíbrio previsto e placar real) não foram implementadas — estavam listadas
   como fase complementar.
4. **Sem gestão de campeonatos, uniformes ou enquetes** — também fase
   complementar.
