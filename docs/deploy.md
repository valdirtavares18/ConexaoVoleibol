# Publicação

Vercel para a aplicação, Supabase para o Postgres gerenciado e o Storage.

---

## 1. Banco no Supabase

1. Crie um projeto em <https://supabase.com>.
2. Em **Project Settings → Database → Connection string**, copie a string do
   **Connection pooler** (porta `6543`).
3. Acrescente `?sslmode=require`.

```
postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:6543/postgres?sslmode=require
```

> **Use o pooler, não a conexão direta.** Funções serverless abrem e fecham
> conexões o tempo todo; a porta 5432 esgota o limite rapidamente. O cliente já
> está configurado com `prepare: false`, que é o exigido pelo pooler em modo
> transaction.

---

## 2. Migrations

Rode da sua máquina, apontando para o banco de produção:

```bash
DATABASE_URL="postgresql://...:6543/postgres?sslmode=require" npm run db:migrate
```

No PowerShell:

```powershell
$env:DATABASE_URL="postgresql://...:6543/postgres?sslmode=require"
npm run db:migrate
```

As migrations são idempotentes e versionadas em `src/db/migrations/`.

---

## 3. Aplicação na Vercel

1. Importe o repositório na Vercel. O framework é detectado automaticamente.
2. Configure as variáveis de ambiente (**Production** e **Preview**):

| Variável              | Valor                            |
| --------------------- | -------------------------------- |
| `DATABASE_URL`        | string do pooler do Supabase     |
| `AUTH_SECRET`         | gere com o comando abaixo        |
| `NEXT_PUBLIC_APP_URL` | `https://seu-dominio.vercel.app` |
| `CLUB_TIMEZONE`       | `America/Sao_Paulo`              |
| `ALLOW_DEMO_SEED`     | `false`                          |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> Trocar `AUTH_SECRET` invalida todas as sessões ativas. Guarde-o em um
> gerenciador de senhas.

3. Faça o deploy.

---

## 4. Primeiro administrador

Não existe conta padrão e nenhuma credencial está no código. Rode da sua
máquina, apontando para o banco de produção:

```bash
DATABASE_URL="<string do supabase>" npm run bootstrap:admin
```

O comando pergunta e-mail e nome, e imprime a senha gerada **uma única vez**.
Guarde-a e troque no primeiro acesso.

Para definir a senha você mesmo:

```bash
ADMIN_PASSWORD="uma senha longa e sua" DATABASE_URL="..." \
  npm run bootstrap:admin -- --email=voce@exemplo.com --name=SeuNome
```

O script é idempotente: se a conta já existir, ela é apenas promovida a
administrador, sem alterar a senha.

---

## 5. Marca

Adicione os arquivos do brasão em `public/brand/` antes do deploy — ver
[`public/brand/README.md`](../public/brand/README.md). Sem eles a aplicação
funciona, mas o espaço do brasão fica vazio.

---

## 6. Verificação pós-deploy

- [ ] `/entrar` carrega e o brasão aparece
- [ ] Login do administrador funciona
- [ ] `/admin` mostra o painel sem erro de configuração
- [ ] `/admin/configuracoes` exibe os valores padrão (R$ 10,00, 18, 3×6, 5%)
- [ ] Criar um encontro de teste e publicá-lo
- [ ] Um atleta **não** consegue abrir `/admin/financeiro` (redireciona)
- [ ] `/admin/auditoria` registra as ações feitas acima

---

## Backup

O Supabase faz backup automático nos planos pagos. No plano gratuito, agende:

```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom > cva-$(date +%F).dump
```

O histórico de avaliações, o financeiro e a auditoria são **append-only** e não
podem ser reconstruídos a partir de outra fonte. Vale a pena guardar cópias.

---

## Seed em produção

O seed de demonstração é **bloqueado** quando `NODE_ENV=production`, a menos que
`ALLOW_DEMO_SEED=true`. Mantenha em `false`. Se em algum momento você rodá-lo por
engano, os registros de demonstração usam o domínio `@demo.cva.local`, o que
torna simples encontrá-los e removê-los.
