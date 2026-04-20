---
tags: [onboarding]
type: guide
---

# Onboarding — Desenvolvedores

Referência técnica completa para devs que vão trabalhar no Nocrato Health V2. Cobre ambientes, credenciais de teste, fluxos de autenticação, endpoints, e setup local.

> Para uso pela agência: [onboarding-agency.md](onboarding-agency.md)
> Para QA: [onboarding-qa.md](onboarding-qa.md)

---

## Sumário

1. [Ambientes e URLs](#1-ambientes-e-urls)
2. [Credenciais de Teste](#2-credenciais-de-teste)
3. [Fluxos de Autenticação](#3-fluxos-de-autenticação)
4. [Portal da Agência](#4-portal-da-agência)
5. [Portal do Doutor](#5-portal-do-doutor)
6. [Agendamento Público (Booking)](#6-agendamento-público-booking)
7. [Portal do Paciente](#7-portal-do-paciente)
8. [Agente WhatsApp](#8-agente-whatsapp)
9. [Ciclo de Vida das Consultas](#9-ciclo-de-vida-das-consultas)
10. [Cenários de Teste End-to-End](#10-cenários-de-teste-end-to-end)
11. [Referência de Endpoints](#11-referência-de-endpoints)
12. [Ambiente Local (Dev)](#12-ambiente-local-dev)

---

## 1. Ambientes e URLs

### Produção (Hostinger VPS)

| Serviço | URL |
|---------|-----|
| Frontend (SPA) | `https://app.nocrato.com` |
| API Backend | `https://app.nocrato.com/api/v1` |
| Swagger (docs interativos) | `https://app.nocrato.com/api/docs` |
| Health check | `https://app.nocrato.com/health` |

### Local (Desenvolvimento)

| Serviço | URL |
|---------|-----|
| Frontend (Vite) | `http://localhost:5173` |
| API Backend | `http://localhost:3000` |
| Swagger | `http://localhost:3000/api/docs` |
| PostgreSQL | `localhost:5432` |
| Webhook WhatsApp (Meta Cloud API) | expor publicamente via tunnel (ngrok/cloudflared) se for testar ponta a ponta |

### Portais por Perfil

| Perfil | Rota |
|--------|------|
| Agência | `/agency` |
| Doutor | `/doctor` |
| Onboarding do doutor | `/doctor/onboarding` |
| Agendamento público | `/book/{slug}` |
| Portal do paciente | `/patient/access` |

---

## 2. Credenciais de Teste

> Estas credenciais são criadas pelo `setup-test-data.ts` antes dos testes E2E.
> Em produção, credenciais reais devem ser criadas via fluxo de convite.

### Agência

| Email | Senha | Role | Notas |
|-------|-------|------|-------|
| `admin@nocrato.com` | `admin123` | `agency_admin` | Acesso total: convites, gestão de doutores |

### Doutores

| Email | Senha | Slug | Status do Onboarding | Uso |
|-------|-------|------|----------------------|-----|
| `test-new@nocrato.com` | `Doctor123!` | `test-new-doctor` | **Incompleto** — redireciona para wizard | Testar fluxo de onboarding |
| `test-done@nocrato.com` | `Doctor123!` | `test-done-doctor` | **Completo** — acessa dashboard direto | Testar portal completo |

### Pacientes de Teste (vinculados a `test-done-doctor`)

| Nome | Telefone | Status | Observação |
|------|----------|--------|------------|
| Ana Lima | (11) 91111-0001 | active | Listagem |
| Ana Souza | (11) 91111-0002 | active | Listagem |
| João Costa | (11) 91111-0003 | active | Listagem |
| Fernanda Oliveira | (11) 91111-0004 | inactive | Testar filtro de status |
| Maria Oliveira | (11) 91111-0099 | active | Portal ativo — código `MRS-5678-PAC` |

### Portal do Paciente

| Campo | Valor |
|-------|-------|
| Código de acesso | `MRS-5678-PAC` |
| Rota | `/patient/access` |

### Tokens de Booking (para testes)

| Propósito | Token (64 chars hex) |
|-----------|----------------------|
| Token válido | `abcdef01` repetido 8x (`abcdef01abcdef01...`) |
| Token expirado | `dead0000` repetido 8x |
| Token com paciente existente | `cafe1234` repetido 8x |
| Token conflito de horário | `beef5678` repetido 8x |

---

## 3. Fluxos de Autenticação

### 3.1 Login da Agência

**Rota:** `/agency/login`
**Endpoint:** `POST /api/v1/agency/auth/login`

```
1. Abrir /agency/login
2. Informar email e senha
3. Servidor retorna: { accessToken, refreshToken, member }
4. Frontend armazena tokens e redireciona para /agency
```

**Corpo da requisição:**
```json
{
  "email": "admin@nocrato.com",
  "password": "admin123"
}
```

**Resposta de sucesso:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "member": {
    "id": "uuid",
    "email": "admin@nocrato.com",
    "name": "Admin Nocrato",
    "role": "agency_admin",
    "status": "active"
  }
}
```

---

### 3.2 Login do Doutor (Dois Passos)

**Rota:** `/doctor/login`
**Etapa 1:** `GET /api/v1/doctor/auth/resolve-email/{email}`
**Etapa 2:** `POST /api/v1/doctor/auth/login`

```
1. Abrir /doctor/login
2. Informar o email (etapa 1 — verifica se existe)
3. Informar a senha (etapa 2 — autentica)
4. Se onboardingCompleted=false → redireciona para /doctor/onboarding
5. Se onboardingCompleted=true  → redireciona para /doctor
```

**Resposta da etapa 1:**
```json
{
  "exists": true,
  "slug": "dr-silva",
  "hasPendingInvite": false
}
```

**Resposta da etapa 2:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "doctor": {
    "id": "uuid",
    "email": "dr.silva@email.com",
    "name": "Dr. Maria Silva",
    "tenantId": "uuid",
    "onboardingCompleted": true
  }
}
```

---

### 3.3 Convite + Aceite do Doutor (Fluxo Completo)

```
1. Agency admin envia convite:
   POST /api/v1/agency/doctors/invite
   { "email": "dr.novo@email.com" }
   → Email enviado com link: /doctor/invite?token=xxx

2. Doutor clica no link de email
   → GET /api/v1/doctor/auth/invite/{token} — valida o token
   → Formulário pré-preenchido com email

3. Doutor preenche dados e submete:
   POST /api/v1/doctor/auth/accept-invite
   {
     "token": "xxx",
     "slug": "dr-novo",
     "name": "Dr. Novo Nome",
     "password": "SenhaSegura123!"
   }
   → Cria: tenant + doctor + agent_settings (enabled=false)
   → Retorna JWT pair + onboardingCompleted=false

4. Redireciona para /doctor/onboarding
```

---

### 3.4 Recuperação de Senha

**Endpoint:** `POST /api/v1/{agency|doctor}/auth/forgot-password`

```
1. Submeter email em /forgot-password
2. Servidor cria token de reset (expira em 1h) e envia email
   (sempre retorna 200 — sem enumeração de emails)
3. Usuário clica no link e define nova senha:
   POST /api/v1/{agency|doctor}/auth/reset-password
   { "token": "xxx", "newPassword": "NovaSenha123!" }
4. Redireciona para login
```

---

### 3.5 Refresh de Token

**Endpoint:** `POST /api/v1/auth/refresh`

```json
{ "refreshToken": "eyJ..." }
```

O access token expira em **15 minutos**. O refresh token dura **7 dias**.

---

## 4. Portal da Agência

**Rota base:** `/agency`
**Guard:** JWT com role `agency_admin` ou `agency_member`

### O que é possível fazer

| Ação | Rota | Quem pode |
|------|------|-----------|
| Ver dashboard | `/agency` | todos |
| Listar doutores | `/agency/doctors` | todos |
| Convidar doutor | Botão na lista | `agency_admin` |
| Listar membros | `/agency/members` | `agency_admin` |
| Convidar membro | Botão na lista | `agency_admin` |

### Passo a Passo: Convidar um Doutor

```
1. Login como admin@nocrato.com
2. Menu lateral → Doutores
3. Botão "Convidar doutor"
4. Informar email do doutor → Confirmar
5. Email enviado com link de convite (expira em 7 dias)
6. Doutor aceita e cria o tenant
7. Doctor aparece na lista com status "active"
```

---

## 5. Portal do Doutor

**Rota base:** `/doctor`
**Guard:** JWT com role `doctor`
**Atenção:** Se `onboardingCompleted=false`, o sistema redireciona para `/doctor/onboarding` automaticamente.

### 5.1 Onboarding (Wizard 4 Passos)

Acessível apenas quando o onboarding está **incompleto**.
Use `test-new@nocrato.com` para testar este fluxo.

| Passo | Campos | Endpoint |
|-------|--------|----------|
| 1 — Perfil | Nome, CRM, UF do CRM, especialidade | `PATCH /api/v1/doctor/profile` |
| 2 — Horários | Dias da semana + intervalos (ex: 08:00–12:00) | `PATCH /api/v1/doctor/schedule` |
| 3 — Branding | Cor primária, URL do logo | `PATCH /api/v1/doctor/branding` |
| 4 — Agente | Mensagem de boas-vindas | `PATCH /api/v1/doctor/agent-settings` |

Ao completar todos os 4 passos, `onboardingCompleted` torna-se `true`.

### 5.2 Dashboard

Rota: `/doctor`
Endpoint: `GET /api/v1/doctor/appointments/dashboard`

Exibe:
- Consultas do dia (hoje)
- Consultas com status `waiting` ou `in_progress`
- Contagem de follow-ups pendentes

### 5.3 Pacientes

Rota: `/doctor/patients`

| Ação | Detalhe |
|------|---------|
| Listar | Paginado (10/página), filtro por nome/telefone/status |
| Ver perfil | `/doctor/patients/{id}` — histórico de consultas + documentos |
| Criar manualmente | Botão "Novo paciente" — nome, telefone, email, data de nascimento |
| Editar | Botão "Editar" na lista — campos opcionais (patch parcial) |

### 5.4 Consultas

Rota: `/doctor/appointments`

| Ação | Detalhe |
|------|---------|
| Listar | Filtro por data, status, paciente |
| Ver detalhe | `/doctor/appointments/{id}` — notas clínicas da consulta |
| Mudar status | Botões de ação no detalhe da consulta |
| Adicionar nota clínica | Botão "Adicionar nota" no detalhe |

### 5.5 Documentos e Notas Clínicas

**Documento:** Upload de arquivo (PDF, imagem)
- Vinculado a um paciente (e opcionalmente a uma consulta)
- Tipos: `prescription`, `exam`, `referral`, `other`

**Nota clínica:** Texto livre
- Sempre vinculado a uma consulta específica
- Apenas o doutor visualiza (não aparece no portal do paciente)

### 5.6 Configurações

Rota: `/doctor/settings` — 4 abas:

| Aba | Campos |
|-----|--------|
| Perfil | Nome, CRM, especialidade, fuso horário |
| Horários | Dias + intervalos de atendimento |
| Branding | Cor primária (`#RRGGBB`), preview do logo |
| Agente | Toggle ativo, modo de booking, mensagem de boas-vindas, personalidade, FAQ, regras de consulta |

**Modos de booking:**
- `link` — agente gera apenas link externo
- `chat` — agente faz agendamento direto no chat
- `both` — agente decide conforme o fluxo

---

## 6. Agendamento Público (Booking)

**Rota:** `/book/{slug}`
**Sem autenticação** — protegido por token de 24h, single-use.

### 6.1 Fluxo via Link (Token)

```
1. Agente WhatsApp gera token:
   → bookingService.generateToken(tenantId)
   → Token de 64 chars hex, expira em 24h

2. Agente envia link para paciente:
   https://app.nocrato.com/book/dr-silva?token=abc123...

3. Paciente abre a página
   → Frontend valida: GET /api/v1/public/booking/dr-silva/validate?token=abc123...
   → Retorna: { valid: true, doctor, tenant }

4. Paciente escolhe uma data
   → GET /api/v1/public/booking/dr-silva/slots?date=2024-01-15&token=abc123...
   → Retorna: { slots: [{start, end}], timezone, durationMinutes }

5. Paciente preenche nome, telefone, seleciona o horário

6. Confirmar:
   POST /api/v1/public/booking/dr-silva/book
   {
     "token": "abc123...",
     "name": "João Santos",
     "phone": "+5511999999999",
     "dateTime": "2024-01-15T08:00:00-03:00"
   }
   → Cria appointment + marca token como usado
   → Agente envia confirmação via WhatsApp
```

### 6.2 Regras de Validação do Booking

- Token não expirado (24h)
- Token não utilizado (single-use)
- Horário disponível (sem conflito)
- Máximo 2 consultas ativas por telefone
- Doutor e tenant com status `active`

### 6.3 Geração de Slots

O algoritmo:
1. Pega `working_hours[diaDaSemana]` do doutor (ex: `{"start":"08:00","end":"12:00"}`)
2. Divide em slots pela duração da consulta (padrão: 30 min)
3. Remove slots com conflito com consultas existentes
4. Se a data é hoje, remove slots no passado
5. Retorna slots disponíveis

---

## 7. Portal do Paciente

**Rota:** `/patient/access`
**Autenticação:** Código de acesso (sem senha)

### 7.1 Ativação do Portal

O portal do paciente é ativado automaticamente quando a **primeira consulta é concluída**:

```
Doutor clica "Concluir" na consulta
  → Servidor gera código: ABC-1234-XYZ (formato: 3 letras - 4 dígitos - 3 letras)
  → Salva em patients: portal_access_code + portal_active=true
  → Emite evento: patient.portal_activated
  → Agente envia código via WhatsApp para o paciente
```

### 7.2 Acesso ao Portal

```
1. Paciente abre /patient/access
2. Digita o código (ex: MRS-5678-PAC)
3. POST /api/v1/patient/portal/access
   { "code": "MRS-5678-PAC" }
4. Retorna dados completos
```

### 7.3 O que o Paciente Vê

| Seção | Conteúdo |
|-------|----------|
| Dados pessoais | Nome, telefone, email, data de nascimento |
| Informações do médico | Nome, especialidade |
| Consultas | Histórico completo (passadas + futuras), ordenado por data |
| Documentos | Lista com tipo, nome do arquivo, botão de download |

**O que NÃO aparece no portal:**
- Notas clínicas (registros internos do médico)
- CPF do paciente
- Código de acesso

### 7.4 Testar com Dados Existentes

```
Código: MRS-5678-PAC
Paciente: Maria Oliveira
Consulta futura: +7 dias de hoje às 14:00
Consulta passada: 2025-06-15 (completed)
Documento: test-doc.pdf (tipo: prescription)
```

---

## 8. Agente WhatsApp

### 8.1 Arquitetura

```
Mensagem WhatsApp
  ↓
Meta Cloud API (WhatsApp Business Platform)
  ↓ webhook POST /api/v1/agent/webhook/cloud
  ↓ Header: X-Hub-Signature-256 (HMAC-SHA256 com META_APP_SECRET)
AgentController
  ↓ valida assinatura HMAC
  ↓ roteia por tipo: messages[] → handleMessage | statuses[] sent → handleDoctorMessage
AgentService.handleMessage()
  ├─ Resolve tenant pelo phone_number_id
  ├─ Checa mode da conversa (human vs agent)
  ├─ Busca/cria paciente pelo telefone
  ├─ Carrega/cria conversa (histórico dos últimos 20 msgs)
  ├─ Chama OpenAI gpt-4o-mini com tools disponíveis
  ├─ Executa tool_calls (até 5 iterações)
  ├─ Atualiza histórico da conversa
  └─ Envia resposta via Meta Graph API
```

### 8.2 Ferramentas do Agente (LLM Tools)

| Tool | Quando usar | Disponível em |
|------|-------------|---------------|
| `list_slots` | Listar horários disponíveis | `link`, `chat`, `both` |
| `book_appointment` | Criar consulta direto no chat | `chat`, `both` |
| `generate_booking_link` | Gerar link para o paciente abrir | `link`, `both` |
| `cancel_appointment` | Cancelar consulta agendada | `link`, `chat`, `both` |

### 8.3 Exemplos de Conversa

**Cenário: Agendamento via chat**
```
Paciente: "Oi, quero marcar uma consulta"
Agente:   "Olá! Para qual dia você gostaria?"
Paciente: "Terça-feira"
Agente:   [chama list_slots(date="2024-01-15")]
Agente:   "Tenho disponível: 08:00, 09:00, 10:00, 14:00. Qual prefere?"
Paciente: "09:00"
Agente:   [chama book_appointment(dateTime="2024-01-15T09:00", patientName="...")]
Agente:   "Consulta confirmada! Dr. Maria Silva, 15/01 às 09:00, 30 minutos."
```

**Cenário: Agendamento via link**
```
Paciente: "Quero agendar"
Agente:   [chama generate_booking_link()]
Agente:   "Clique no link para escolher seu horário: https://app.nocrato.com/book/dr-silva?token=..."
```

**Cenário: Cancelamento**
```
Paciente: "Preciso cancelar minha consulta"
Agente:   "Qual o motivo do cancelamento?"
Paciente: "Compromisso de trabalho"
Agente:   [chama cancel_appointment(appointmentId="uuid", reason="Compromisso de trabalho")]
Agente:   "Consulta cancelada. Se quiser remarcar, é só me avisar!"
```

### 8.4 Eventos Automáticos

O agente também responde a eventos do sistema via EventEmitter2:

| Evento | Gatilho | Mensagem enviada |
|--------|---------|-----------------|
| `appointment.created` | Booking confirmado | "Consulta agendada: {data e hora}" |
| `appointment.cancelled` | Consulta cancelada | "Consulta cancelada: {motivo}" |
| `patient.portal_activated` | 1ª consulta concluída | "Seu portal está pronto! Código: ABC-1234-XYZ" |
| `appointment.status_changed` (waiting) | Chegou a vez do paciente | "O consultório está pronto para recebê-lo!" |

---

## 9. Ciclo de Vida das Consultas

### Máquina de Estados

```
                           CANCELLED ←──────────┐
                              ↑                  │
         ┌────────────────────┤                  │
         │                    │                  │
      SCHEDULED → WAITING → IN_PROGRESS → COMPLETED
         │            │
         └────────────┴──→ NO_SHOW

      RESCHEDULED (cria nova consulta em SCHEDULED)
```

### Transições Válidas

| De | Para | Quem | Ação no Frontend |
|----|------|------|-----------------|
| `scheduled` | `waiting` | Sistema / Doutor | Automático ou botão "Iniciar atendimento" |
| `waiting` | `in_progress` | Doutor | Botão "Iniciar consulta" |
| `in_progress` | `completed` | Doutor | Botão "Concluir consulta" |
| `scheduled` / `waiting` | `cancelled` | Doutor / Agente | Botão "Cancelar" + motivo obrigatório |
| `scheduled` / `waiting` | `no_show` | Doutor | Botão "Não compareceu" |
| `scheduled` | `rescheduled` | Doutor | Botão "Reagendar" + nova data/hora |

### Transição Automática scheduled → waiting

O sistema verifica periodicamente se alguma consulta agendada já passou do horário de início. Quando isso ocorre, o status muda para `waiting` automaticamente.

### Endpoint de Mudança de Status

```
PATCH /api/v1/doctor/appointments/{id}/status
Authorization: Bearer {accessToken}

# Cancelar:
{ "status": "cancelled", "cancellationReason": "Motivo obrigatório" }

# Reagendar:
{ "status": "rescheduled", "newDateTime": "2024-01-20T09:00:00-03:00", "cancellationReason": "Motivo opcional" }

# Outros:
{ "status": "in_progress" }
```

---

## 10. Cenários de Teste End-to-End

### Cenário 1: Onboarding Completo de um Doutor (15–20 min)

```
1. Login como admin@nocrato.com → /agency
2. Doutores → "Convidar doutor" → informar email
3. Verificar email recebido (link com token)
4. Abrir link → preencher slug, nome, senha → aceitar convite
5. Redireciona para /doctor/onboarding
6. Step 1: preencher nome, CRM, especialidade → próximo
7. Step 2: configurar horários (ex: Segunda, 08:00–12:00 e 13:00–17:00) → próximo
8. Step 3: escolher cor primária → próximo
9. Step 4: escrever mensagem de boas-vindas → concluir
10. Redireciona para /doctor — dashboard carregado ✓
```

---

### Cenário 2: Ciclo Completo de Consulta (10–15 min)

```
Pré-requisito: Logado como test-done@nocrato.com

1. /doctor/patients → "Novo paciente"
   Informar nome, telefone, email → criar

2. /doctor/appointments → Consulta aparece listada (se criada via booking)
   OU criar via booking público (ver Cenário 3)

3. No detalhe da consulta:
   → Status: scheduled
   → Clicar "Iniciar atendimento" → status: waiting
   → Clicar "Iniciar consulta" → status: in_progress
   → Adicionar nota clínica (texto livre)
   → Clicar "Concluir consulta" → status: completed

4. Se era a primeira consulta do paciente:
   → Portal ativado automaticamente
   → Código de acesso gerado (ex: XYZ-1234-ABC)
```

---

### Cenário 3: Booking Público via Link (5–10 min)

```
Pré-requisito: Doutor com tenant slug conhecido (ex: test-done-doctor)

1. Gerar token via API (Swagger ou Postman):
   GET https://app.nocrato.com/api/v1/doctor/agent-settings
   (pegar tenantId do JWT)

   Ou testar com token fixo: abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01

2. Abrir: /book/test-done-doctor?token={token}

3. Página carrega com nome do doutor e tenant ✓

4. Escolher uma data com horários disponíveis
   (datas com working_hours configurados para o dia da semana)

5. Selecionar um slot disponível

6. Preencher nome e telefone

7. Confirmar agendamento

8. Mensagem de confirmação exibida ✓

9. Verificar em /doctor/appointments que a consulta aparece ✓
```

---

### Cenário 4: Portal do Paciente (5 min)

```
1. Abrir /patient/access
2. Informar código: MRS-5678-PAC
3. Portal carregado com:
   - Nome: Maria Oliveira
   - Médico: Dr. (test-done-doctor)
   - Consulta futura listada
   - Consulta passada (completed) listada
   - Documento test-doc.pdf disponível para download
4. Verificar que notas clínicas NÃO aparecem ✓
```

---

### Cenário 5: Isolamento de Tenant (Segurança)

```
1. Login como test-done@nocrato.com
2. Anotar IDs de pacientes visíveis
3. Logout

4. Login como test-new@nocrato.com (outro tenant)
5. Verificar que os pacientes do outro tenant NÃO aparecem ✓
6. Tentar acessar /api/v1/doctor/patients/{id_de_outro_tenant} via Postman
   → Deve retornar 404 ✓
```

---

### Cenário 6: Reagendamento via Doutor

```
1. Localizar uma consulta com status scheduled
2. Abrir detalhe da consulta
3. Clicar "Reagendar"
4. Informar nova data/hora
5. Confirmar

Resultado esperado:
- Consulta original: status = rescheduled ✓
- Nova consulta criada com status = scheduled ✓
- Ambas visíveis no histórico do paciente ✓
```

---

## 11. Referência de Endpoints

### Autenticação

| Método | Endpoint | Body | Retorno |
|--------|----------|------|---------|
| POST | `/api/v1/agency/auth/login` | `{email, password}` | `{accessToken, refreshToken, member}` |
| POST | `/api/v1/doctor/auth/login` | `{email, password}` | `{accessToken, refreshToken, doctor}` |
| GET | `/api/v1/doctor/auth/resolve-email/{email}` | — | `{exists, slug}` |
| POST | `/api/v1/doctor/auth/accept-invite` | `{token, slug, name, password}` | `{accessToken, refreshToken, doctor}` |
| POST | `/api/v1/agency/auth/forgot-password` | `{email}` | `200 OK` |
| POST | `/api/v1/agency/auth/reset-password` | `{token, newPassword}` | `200 OK` |
| POST | `/api/v1/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken}` |

### Portal da Agência (requer JWT agency)

| Método | Endpoint | Notas |
|--------|----------|-------|
| GET | `/api/v1/agency/doctors` | Lista doutores |
| POST | `/api/v1/agency/doctors/invite` | `{email}` — requer agency_admin |
| GET | `/api/v1/agency/members` | requer agency_admin |
| POST | `/api/v1/agency/members/invite` | `{email, name}` — requer agency_admin |

### Portal do Doutor (requer JWT doctor)

| Método | Endpoint | Notas |
|--------|----------|-------|
| GET | `/api/v1/doctor` | Perfil + status onboarding |
| PATCH | `/api/v1/doctor/profile` | `{name, crm, specialty, timezone}` |
| PATCH | `/api/v1/doctor/schedule` | `{workingHours: {...}}` |
| PATCH | `/api/v1/doctor/branding` | `{primaryColor, logoUrl}` |
| GET | `/api/v1/doctor/agent-settings` | Config do agente |
| PATCH | `/api/v1/doctor/agent-settings` | `{enabled, bookingMode, welcomeMessage, ...}` |
| GET | `/api/v1/doctor/patients` | `?page=1&limit=10&search=...&status=active` |
| GET | `/api/v1/doctor/patients/{id}` | Perfil completo + histórico |
| POST | `/api/v1/doctor/patients` | `{name, phone, email, dateOfBirth}` |
| PATCH | `/api/v1/doctor/patients/{id}` | Campos opcionais (patch parcial) |
| GET | `/api/v1/doctor/appointments` | `?date=YYYY-MM-DD&status=scheduled` |
| GET | `/api/v1/doctor/appointments/dashboard` | Hoje + pendentes |
| GET | `/api/v1/doctor/appointments/{id}` | Detalhe |
| PATCH | `/api/v1/doctor/appointments/{id}/status` | `{status, cancellationReason?, newDateTime?}` |
| GET | `/api/v1/doctor/clinical-notes` | `?patientId=...` ou `?appointmentId=...` |
| POST | `/api/v1/doctor/clinical-notes` | `{appointmentId, content}` |
| GET | `/api/v1/doctor/documents` | `?patientId=...&type=prescription` |
| POST | `/api/v1/doctor/documents` | multipart/form-data: `file`, `patientId`, `type`, `description?`, `appointmentId?` |

### Booking Público (sem auth, com token)

| Método | Endpoint | Notas |
|--------|----------|-------|
| GET | `/api/v1/public/booking/{slug}/validate` | `?token=...` |
| GET | `/api/v1/public/booking/{slug}/slots` | `?date=YYYY-MM-DD&token=...` |
| POST | `/api/v1/public/booking/{slug}/book` | `{token, name, phone, dateTime}` |

### Portal do Paciente (sem auth, com código)

| Método | Endpoint | Notas |
|--------|----------|-------|
| POST | `/api/v1/patient/portal/access` | `{code: "ABC-1234-XYZ"}` |
| GET | `/api/v1/patient/portal/documents/{id}` | `?code=ABC-1234-XYZ` |

### Sistema

| Método | Endpoint | Notas |
|--------|----------|-------|
| GET | `/health` | `{status: "ok", database: true}` |
| GET | `/api/docs` | Swagger interativo |

---

## 12. Ambiente Local (Dev)

### Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### Setup Inicial

```bash
# 1. Clonar o repositório
git clone https://github.com/PedroV1dal/nocrato-health.git
cd nocrato-health-v2

# 2. Instalar dependências
pnpm install

# 3. Subir PostgreSQL (único container de infraestrutura — Evolution API foi removida, ver ADR-018)
docker compose -f docker/docker-compose.dev.yml up -d

# 4. Configurar variáveis de ambiente
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Editar os .env com: JWT_SECRET, OPENAI_API_KEY, RESEND_API_KEY
```

### Variáveis de Ambiente Mínimas (API)

```env
# Banco
DATABASE_URL=postgresql://nocrato:nocrato_secret@localhost:5432/nocrato_health

# Auth (gerar com: openssl rand -base64 64)
JWT_SECRET=sua_chave_super_secreta_aqui

# Frontend
FRONTEND_URL=http://localhost:5173

# Email (opcional para dev)
RESEND_API_KEY=re_xxxx

# OpenAI (necessário apenas para agente)
OPENAI_API_KEY=sk-xxxx

# Meta Cloud API / WhatsApp Business Platform (necessário apenas para agente)
META_CLOUD_API_TOKEN=EAAG...
META_APP_SECRET=...
META_WEBHOOK_VERIFY_TOKEN=...
META_APP_ID=...
```

### Rodar o Projeto

```bash
# Rodar tudo junto (turbo)
pnpm dev

# Ou separadamente:
pnpm --filter @nocrato/api dev   # API na porta 3000
pnpm --filter @nocrato/web dev   # Web na porta 5173
```

### Testes Unitários (Backend)

```bash
# Rodar todos os testes
pnpm --filter @nocrato/api test

# Modo watch
pnpm --filter @nocrato/api test --watch

# Com cobertura
pnpm --filter @nocrato/api test --coverage

# Suíte específica
pnpm --filter @nocrato/api test auth.spec.ts
```

### Testes E2E (Playwright)

```bash
# Subir o projeto primeiro
pnpm dev

# Em outro terminal:
pnpm --filter @nocrato/web test:e2e

# Modo UI (debug visual)
pnpm --filter @nocrato/web test:e2e --ui

# Com browser visível
pnpm --filter @nocrato/web test:e2e --headed

# Arquivo específico
pnpm --filter @nocrato/web test:e2e doctor.spec.ts
```

> **Nota:** O `global-setup.ts` do Playwright popula o banco com dados de teste automaticamente antes de cada rodada.

### Acessar o Banco em Produção (via SSH Tunnel)

Se o PostgreSQL não está exposto na porta do host (apenas internamente no Docker):

```bash
# Criar tunnel SSH
ssh -L 5433:localhost:5432 root@IP_DO_VPS -N

# Conectar no DBeaver (ou psql):
# Host: localhost
# Port: 5433
# Database: nocrato_health
# User/Password: definidos no .env de produção
```

### Projeto no VPS

```bash
# Localização no servidor
/opt/nocrato-health-v2/

# Ver logs em tempo real
docker logs nocrato_api_prod -f

# Status dos containers
docker compose -f docker/docker-compose.prod.yml ps

# Reiniciar API (ex: após mudança de .env)
docker compose -f docker/docker-compose.prod.yml restart api
```

---

## Notas Importantes

### Segurança

- **Isolamento de tenant:** toda query filtra por `tenant_id` extraído do JWT — nunca do body
- **Tokens de booking:** 64 chars hex, single-use, 24h de validade
- **Notas clínicas:** nunca expostas no portal do paciente
- **trust proxy:** configurado para funcionar corretamente atrás do Nginx em produção

### Limitações do MVP (Não Implementado)

- RBAC granular além de admin/member/doctor
- Agency acessar portal do doutor
- Pagamentos
- WebSocket (usa polling a cada 30s)
- Redis para token blacklist
- Object storage S3/R2 (usa disco local)
- CAPTCHA no booking
- Row-Level Security no PostgreSQL

### Débitos Técnicos Abertos

| ID | Prioridade | Descrição |
|----|-----------|-----------|
| TD-01 | P2 | Slots de booking assumem timezone UTC fixo |
| ~~TD-20~~ | — | Não-aplicável após ADR-018 (Evolution removida) — resolução agora via `whatsapp_phone_number_id` |
| TD-21 | P2 | Erros OpenAI sem try/catch com contexto adequado |
| TD-23 | P2 | ErrorBoundary não invalida cache TanStack Query no retry |