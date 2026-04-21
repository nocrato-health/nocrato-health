---
tags: [onboarding, setup, dev]
type: guide
---

# Ambiente de Desenvolvimento do Zero

Guia completo para rodar o Nocrato Health V2 do zero em uma máquina nova — do clone do repo até a conexão com produção.

> Para referência de endpoints e fluxos após o setup: [[onboarding-dev]]
> Para comandos do dia a dia no servidor: [[vps-cheatsheet]]

---

## Pré-requisitos

Instalar antes de começar:

| Ferramenta | Versão mínima | Instalação |
|------------|---------------|------------|
| Node.js | 20+ | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |
| Docker + Docker Compose | 24+ | https://docs.docker.com/get-docker/ |
| Git | qualquer | https://git-scm.com |
| psql (opcional) | 16 | para testar túnel SSH com produção |
| DBeaver (opcional) | qualquer | GUI para o banco de dados |

---

## 1. Clonar o Repositório

```bash
git clone https://github.com/PedroV1dal/nocrato-health.git nocrato-health-v2
cd nocrato-health-v2
```

---

## 2. Instalar Dependências

```bash
pnpm install
```

Instala dependências de todos os workspaces (`apps/api` + `apps/web`) via pnpm workspaces.

---

## 3. Configurar Variáveis de Ambiente

```bash
cp apps/api/.env.example apps/api/.env
```

Editar `apps/api/.env` com os valores de desenvolvimento:

```env
# Banco (local — dev)
DATABASE_URL=postgresql://nocrato:nocrato_secret@localhost:5432/nocrato_health

# JWT
JWT_SECRET=qualquer-string-longa-para-dev

# App
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Email (pode deixar vazio em dev — emails não são enviados)
RESEND_API_KEY=

# OpenAI (opcional em dev — necessário para testar o agente WhatsApp)
OPENAI_API_KEY=

# Meta Cloud API / WhatsApp Business Platform (opcional em dev — necessário para testar o agente WhatsApp)
META_CLOUD_API_TOKEN=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_APP_ID=
```

---

## 4. Subir o Banco de Dados Local

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

Sobe um PostgreSQL 16 local com:

| Campo | Valor |
|-------|-------|
| Host | `localhost` |
| Port | `5432` |
| Database | `nocrato_health` |
| User | `nocrato` |
| Password | `nocrato_secret` |

### Conectar no banco local via DBeaver (opcional)

1. Abra o DBeaver → **Nova Conexão** → PostgreSQL
2. Preencha os campos acima (`localhost`, porta `5432`, database `nocrato_health`, user `nocrato`, password `nocrato_secret`)
3. Clique em **Testar Conexão** → **OK**

> A senha é literalmente a string `nocrato_secret`.

Verificar se está saudável:

```bash
docker compose -f docker/docker-compose.dev.yml ps
```

---

## 5. Rodar Migrations

```bash
cd apps/api
pnpm run migration:run
```

Aplica todas as migrations SQL na sequência correta. Ver [[database/migrations]] para detalhes.

---

## 6. Rodar Seed (dados de teste)

```bash
cd apps/api
pnpm run seed
```

Cria as credenciais de teste:

| Email | Senha | Role |
|-------|-------|------|
| `admin@nocrato.com` | `admin123` | Agency Admin |
| `test-new@nocrato.com` | `Doctor123!` | Doutor (onboarding incompleto) |
| `test-done@nocrato.com` | `Doctor123!` | Doutor (onboarding completo) |

---

## 7. Iniciar os Servidores

Cada um em um terminal separado:

```bash
# Terminal 1 — API (NestJS)
cd apps/api
pnpm run start:dev
# Roda em http://localhost:3000

# Terminal 2 — Frontend (Vite)
cd apps/web
pnpm run dev
# Roda em http://localhost:5173
```

Ou via Turborepo (um terminal só, na raiz):

```bash
pnpm run dev
```

---

## 8. Verificar se Está Funcionando

```bash
curl http://localhost:3000/health
# Esperado: {"status":"ok","database":true}
```

| URL | O que abre |
|-----|-----------|
| `http://localhost:5173/agency/login` | Portal da agência |
| `http://localhost:5173/doctor/login` | Portal do doutor |
| `http://localhost:3000/api/docs` | Swagger (documentação interativa) |

---

## 9. Rodar Testes

```bash
# Backend — todos os testes
cd apps/api
pnpm run test

# Backend — coverage
pnpm run test:cov

# E2E com Playwright (requer servidores rodando)
cd apps/web
npx playwright test
```

---

## 10. Conectar no Banco de Produção via DBeaver

O banco de produção não tem porta pública — acesso via túnel SSH.

### Passo 1 — Abrir o túnel (deixar o terminal aberto)

```bash
ssh -L 5433:localhost:5432 root@IP_DO_VPS -N
```

O terminal fica "travado" sem output — é o comportamento correto, o túnel está ativo.

### Passo 2 — Verificar se o túnel funciona

```bash
psql -h localhost -p 5433 -U nocrato -d nocrato
```

Se pedir senha e aceitar, está funcionando.

### Passo 3 — Configurar DBeaver

| Campo | Valor |
|-------|-------|
| Host | `localhost` |
| Port | `5433` |
| Database | `nocrato` |
| Username | `nocrato` |
| Password | valor de `DB_PASSWORD` no `.env` do servidor |

Para ver a senha no VPS:

```bash
grep DB_PASSWORD /opt/nocrato-health-v2/.env
```

> Copie a senha direto do terminal — é um hash longo e qualquer caractere errado falha na autenticação.

---

## 11. Configurar Obsidian (Contexto do Projeto)

O vault do Obsidian está dentro do repositório em `docs/`. Toda a documentação — arquitetura, flows, roadmap, banco de dados — está lá e se atualiza junto com o código.

### Passo 1 — Instalar Obsidian

https://obsidian.md/download

### Passo 2 — Abrir o vault do projeto

1. Abrir Obsidian
2. **Open folder as vault**
3. Selecionar a pasta `docs/` dentro do repo clonado
   - Ex: `/home/seu-usuario/nocrato-health-v2/docs`

O Graph View vai mostrar toda a documentação conectada.

### Passo 3 — Instalar plugins

Dentro do Obsidian:

1. Settings → Community Plugins → **Turn on community plugins**
2. Browse → buscar **"Local REST API"** → Install → Enable
3. Anotar a **API Key** gerada (Settings → Local REST API)

### Passo 4 — Conectar ao Claude Code via MCP

```bash
claude mcp add obsidian \
  -e OBSIDIAN_API_KEY=SUA_API_KEY_AQUI \
  -- npx -y mcp-obsidian /caminho/para/nocrato-health-v2/docs
```

Reiniciar o Claude Code. Com isso o Claude consegue ler e escrever no vault diretamente.

### O que você tem após esse setup

| Pasta | Conteúdo |
|-------|----------|
| `architecture/` | Stack, estrutura backend/frontend, ADRs |
| `database/` | Schema SQL, migrations, diagrama ER |
| `flows/` | Auth, booking, agente WhatsApp, portal do paciente |
| `roadmap/v1/` | Epics 0-11 (MVP completo) com casos de teste |
| `security/` | Auditoria OWASP |
| `guides/` | Este arquivo e os outros guias |
| `tech-debt.md` | Débitos técnicos abertos com prioridade |

---

## Referências

- [[onboarding-dev]] — endpoints completos, credenciais, fluxos de autenticação
- [[onboarding-qa]] — setup para testes E2E com Playwright
- [[vps-cheatsheet]] — comandos do dia a dia no servidor de produção
- [[database/schema]] — schema completo do banco
- [[architecture/tech-stack]] — stack tecnológica e justificativas
