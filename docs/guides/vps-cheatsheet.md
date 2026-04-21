---
tags: [ops, devops]
type: reference
---

# VPS Cheatsheet — Comandos do Dia a Dia

Referência rápida para operações no servidor Hostinger (produção).

---

## Acesso ao Servidor

```bash
ssh root@IP_DO_VPS
```

---

## Docker — Status e Logs

```bash
# Ver todos os containers rodando
docker ps

# Status dos containers do projeto
docker compose -f /opt/nocrato-health-v2/docker/docker-compose.prod.yml ps

# Logs em tempo real (todos os serviços)
docker compose -f /opt/nocrato-health-v2/docker/docker-compose.prod.yml logs -f

# Logs de um serviço específico
docker logs nocrato_api_prod -f
docker logs nocrato_postgres_prod -f
docker logs nocrato_nginx_prod -f
docker logs nocrato_web_prod -f
```

---

## Docker — Reiniciar Serviços

```bash
# Reiniciar um serviço (ex: após mudar .env)
docker compose -f /opt/nocrato-health-v2/docker/docker-compose.prod.yml restart api

# Reiniciar todos os serviços
docker compose -f /opt/nocrato-health-v2/docker/docker-compose.prod.yml restart

# Parar tudo
docker compose -f /opt/nocrato-health-v2/docker/docker-compose.prod.yml down

# Subir tudo
docker compose -f /opt/nocrato-health-v2/docker/docker-compose.prod.yml up -d
```

---

## Docker — Deploy de Nova Versão

```bash
cd /opt/nocrato-health-v2

# Puxar código novo
git pull origin main

# Rebuildar e subir (zero-downtime parcial)
docker compose -f docker/docker-compose.prod.yml build
docker compose -f docker/docker-compose.prod.yml up -d

# Se houver migrations novas
docker compose -f docker/docker-compose.prod.yml run --rm api node dist/database/migrate.js
```

> **Nota:** o deploy também acontece automaticamente via GitHub Actions a cada push na branch `main`.

---

## Banco de Dados — Acesso

```bash
# Conectar no psql
docker exec -it nocrato_postgres_prod psql -U nocrato nocrato

# Sair do psql
\q
```

### Comandos úteis dentro do psql

```sql
-- Listar tabelas
\dt

-- Ver estrutura de uma tabela
\d agency_members

-- Listar todos os membros da agência
SELECT id, email, name, role, status, created_at FROM agency_members;

-- Listar todos os doutores
SELECT d.email, d.name, d.onboarding_completed, d.status, t.slug
FROM doctors d
JOIN tenants t ON t.id = d.tenant_id;

-- Listar tenants
SELECT id, slug, name, status FROM tenants;

-- Listar últimos agendamentos
SELECT a.id, a.date_time, a.status, p.name as patient, t.slug as tenant
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN tenants t ON t.id = a.tenant_id
ORDER BY a.date_time DESC
LIMIT 20;

-- Listar conversas do agente WhatsApp
SELECT phone, tenant_id, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 20;

-- Listar tokens de booking ativos
SELECT token, tenant_id, used, expires_at FROM booking_tokens WHERE used = false ORDER BY expires_at DESC;
```

---

## Banco de Dados — Acesso via DBeaver (do computador local)

O PostgreSQL em produção não expõe porta pública — o acesso é feito via túnel SSH.

### Passo 1 — Criar o túnel SSH

Abra um terminal e deixe-o **aberto enquanto usar o DBeaver**:

```bash
ssh -L 5433:localhost:5432 root@IP_DO_VPS -N
```

O terminal ficará "travado" sem mostrar nada — isso é normal, significa que o túnel está ativo.

### Passo 2 — Configurar conexão no DBeaver

Crie uma nova conexão PostgreSQL com:

| Campo    | Valor                                          |
|----------|------------------------------------------------|
| Host     | `localhost`                                    |
| Port     | `5433`                                         |
| Database | `nocrato`                                      |
| Username | `nocrato`                                      |
| Password | valor de `DB_PASSWORD` no `.env` do servidor   |

Para ver a senha:

```bash
grep DB_PASSWORD /opt/nocrato-health-v2/.env
```

> **Dica:** copie a senha direto do terminal — o valor é longo e qualquer caractere errado vai falhar na autenticação.

### Verificar se o túnel funciona (antes de abrir o DBeaver)

```bash
# No seu computador local (requer psql instalado)
psql -h localhost -p 5433 -U nocrato -d nocrato
```

Se pedir senha e aceitar, o túnel está funcionando corretamente.

---

## Banco de Dados — Trocar Senha do Admin

```bash
# Passo 1: gerar o hash da nova senha (substituir MinhaNovaSenh@123)
docker exec nocrato_api_prod node -e "
  const bcrypt = require('bcrypt');
  bcrypt.hash('MinhaNovaSenh@123', 10).then(h => console.log(h));
"

# Passo 2: conectar no banco
docker exec -it nocrato_postgres_prod psql -U nocrato nocrato
```

```sql
-- Passo 3: atualizar (colar o hash gerado no passo 1)
UPDATE agency_members
SET password_hash = 'HASH_AQUI'
WHERE email = 'admin@nocrato.com';

-- Verificar
SELECT email, role, status FROM agency_members;
```

> **Atenção:** o `DB_PASSWORD` (senha do PostgreSQL) e o `password_hash` (senha do admin no app) são coisas diferentes. O DBeaver usa o `DB_PASSWORD`. O login no portal usa o hash bcrypt.

---

## Banco de Dados — Backup e Restore

```bash
# Backup completo
docker exec nocrato_postgres_prod pg_dump -U nocrato nocrato > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore (cuidado: sobrescreve dados existentes)
docker exec -i nocrato_postgres_prod psql -U nocrato nocrato < backup_YYYYMMDD_HHMMSS.sql
```

---

## Banco de Dados — Migrations

```bash
# Rodar migrations pendentes
docker compose -f /opt/nocrato-health-v2/docker/docker-compose.prod.yml \
  run --rm api node dist/database/migrate.js

# Rodar seed (idempotente — não duplica dados)
docker compose -f /opt/nocrato-health-v2/docker/docker-compose.prod.yml \
  run --rm api node dist/database/seed.js
```

---

## Variáveis de Ambiente

```bash
# Ver o .env atual
cat /opt/nocrato-health-v2/.env

# Ver uma variável específica
grep DB_PASSWORD /opt/nocrato-health-v2/.env

# Editar
nano /opt/nocrato-health-v2/.env

# Após editar, reiniciar a API para aplicar
docker compose -f /opt/nocrato-health-v2/docker/docker-compose.prod.yml restart api
```

---

## Rate Limiting — Auth

A API tem rate limit de **5 tentativas de login por hora por IP** (em memória). Se bloquear durante testes:

```bash
# Resetar o rate limit (reinicia o processo Node, limpa o store in-memory)
docker restart nocrato_api_prod
```

---

## Testar Endpoints de Dentro do Container

O container da API não tem `curl` instalado. Use `node` com `fetch`:

```bash
# Exemplo: testar health check de dentro do container
docker exec nocrato_api_prod node -e "
  fetch('http://localhost:3000/health')
    .then(r => r.json())
    .then(console.log)
"

# Exemplo: testar login de dentro do container
docker exec nocrato_api_prod node -e "
  fetch('http://localhost:3000/api/v1/agency/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@nocrato.com', password: 'SuaSenha' })
  }).then(r => r.json()).then(console.log)
"
```

---

## Nginx — SSL e Certificados

```bash
# Verificar validade do certificado
certbot certificates

# Renovar certificado manualmente (normalmente é automático via cron)
certbot renew

# Recarregar nginx após mudança de config
docker exec nocrato_nginx_prod nginx -s reload

# Testar config do nginx (sem recarregar)
docker exec nocrato_nginx_prod nginx -t
```

---

## Health Check

```bash
# Verificar se a API está respondendo
curl https://app.nocrato.com/health

# Resposta esperada:
# {"status":"ok","database":true}

# Verificar se o frontend carrega
curl -I https://app.nocrato.com
# Resposta esperada: HTTP/2 200
```

---

## Nomes dos Containers em Produção

| Container | Serviço |
|-----------|---------|
| `nocrato_postgres_prod` | Banco de dados PostgreSQL |
| `nocrato_api_prod` | Backend NestJS |
| `nocrato_web_prod` | Frontend React |
| `nocrato_nginx_prod` | Reverse proxy + SSL |

> **Nota**: o container `nocrato_evolution_prod` (Evolution API) foi removido em 2026-04-20 via ADR-018. O provider de WhatsApp atual é a Meta Cloud API (serviço SaaS do Meta), sem container local.

---

## Projeto no Servidor

```
/opt/nocrato-health-v2/     ← raiz do projeto
/opt/nocrato-health-v2/.env ← variáveis de ambiente (nunca commitar)
```