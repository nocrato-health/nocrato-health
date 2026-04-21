---
tags: [architecture]
type: architecture
---

# Backend Structure - Nocrato Health V2

## Overview

The backend is built with **NestJS + TypeScript**, following a modular architecture where each domain feature is encapsulated in its own module with explicit imports. The API runs at `apps/api/` inside the monorepo.

---

## NestJS Module Structure

```
apps/api/src/
├── main.ts                         # Bootstrap NestJS app
├── app.module.ts                   # Root module (imports all feature modules)
├── config/
│   ├── env.ts                      # Zod env schema
│   └── env.module.ts               # ConfigModule with Zod validation
├── database/
│   ├── database.module.ts          # KnexModule provider
│   ├── knex.provider.ts            # Knex instance factory
│   ├── knexfile.ts                 # Connection config
│   └── migrations/                 # 001_ to 017_
├── common/
│   ├── decorators/
│   │   ├── roles.decorator.ts      # @Roles('agency_admin', 'doctor')
│   │   ├── current-user.decorator.ts # @CurrentUser() extracts user from request
│   │   └── tenant.decorator.ts     # @TenantId() extracts tenant_id from request
│   ├── guards/
│   │   ├── jwt-auth.guard.ts       # Verifies valid JWT
│   │   ├── roles.guard.ts          # Verifies user role
│   │   ├── tenant.guard.ts         # Verifies tenant_id in token
│   │   └── api-key.guard.ts        # (removido - nao ha mais endpoints de webhook externo)
│   ├── filters/
│   │   └── http-exception.filter.ts # Global error handler
│   ├── interceptors/
│   │   └── event-log.interceptor.ts # Auto-logs events on mutations
│   └── pipes/
│       └── zod-validation.pipe.ts  # Zod validation pipe
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts         # login (agency + doctor), refresh, resolve
│   │   ├── auth.controller.ts      # Public auth routes
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts     # Passport JWT strategy
│   │   └── dto/
│   │       ├── login.dto.ts        # Zod schema
│   │       └── register.dto.ts
│   ├── invite/
│   │   ├── invite.module.ts
│   │   ├── invite.service.ts       # create, accept, validate, sendEmail
│   │   ├── invite.controller.ts
│   │   ├── invite.repository.ts
│   │   └── dto/
│   │       └── create-invite.dto.ts
│   ├── agency/
│   │   ├── agency.module.ts
│   │   ├── agency-member.service.ts
│   │   ├── agency-member.repository.ts
│   │   ├── agency.controller.ts    # CRUD members + dashboard stats
│   │   └── dto/
│   │       └── create-member.dto.ts
│   ├── doctor/
│   │   ├── doctor.module.ts
│   │   ├── doctor.service.ts       # onboarding, profile, CRUD
│   │   ├── doctor.repository.ts
│   │   ├── doctor.controller.ts    # Doctor portal endpoints
│   │   └── dto/
│   │       ├── onboarding.dto.ts
│   │       └── update-doctor.dto.ts
│   ├── patient/
│   │   ├── patient.module.ts
│   │   ├── patient.service.ts      # CRUD + portal access code
│   │   ├── patient.repository.ts
│   │   ├── patient.controller.ts   # Doctor-side endpoints
│   │   ├── patient-portal.controller.ts # Patient portal endpoints (public)
│   │   └── dto/
│   │       ├── create-patient.dto.ts
│   │       └── update-patient.dto.ts
│   ├── appointment/
│   │   ├── appointment.module.ts
│   │   ├── appointment.service.ts  # CRUD + status transitions
│   │   ├── appointment.repository.ts
│   │   ├── appointment.controller.ts
│   │   └── dto/
│   │       ├── create-appointment.dto.ts
│   │       └── update-status.dto.ts
│   ├── clinical-note/
│   │   ├── clinical-note.module.ts
│   │   ├── clinical-note.service.ts
│   │   ├── clinical-note.repository.ts
│   │   ├── clinical-note.controller.ts
│   │   └── dto/
│   │       └── create-note.dto.ts
│   ├── document/
│   │   ├── document.module.ts
│   │   ├── document.service.ts
│   │   ├── document.repository.ts
│   │   ├── document.controller.ts
│   │   └── dto/
│   │       └── create-document.dto.ts
│   ├── event-log/
│   │   ├── event-log.module.ts
│   │   ├── event-log.service.ts    # append + query by tenant (audit trail)
│   │   ├── event-log.repository.ts
│   │   └── (sem controller - nao exposto externamente)
│   ├── booking/
│   │   ├── booking.module.ts
│   │   ├── booking.service.ts      # Calculate slots + validate tokens + rate limit by phone
│   │   │                           # tambem: generateToken() chamado pelo agent.service
│   │   ├── booking.controller.ts   # PUBLIC endpoints (protected by token):
│   │   │                           #   GET  /api/v1/public/booking/:slug/validate?token=X
│   │   │                           #   GET  /api/v1/public/booking/:slug/slots?date=YYYY-MM-DD&token=X
│   │   │                           #   POST /api/v1/public/booking/:slug/book { token, name, phone, slot }
│   │   └── dto/
│   │       └── book-appointment.dto.ts
│   └── agent/
│       ├── agent.module.ts
│       ├── agent.service.ts        # Orquestracao: processa mensagem → LLM → resposta
│       │                           # @OnEvent handlers para eventos internos (EventEmitter2)
│       ├── conversation.service.ts # Gerencia estado da conversa por phone (tabela conversations)
│       ├── whatsapp.service.ts     # Envia mensagens via Meta Cloud API (Graph API)
│       └── dto/
│           └── whatsapp-webhook.dto.ts  # Payload do webhook da Meta Cloud API
└── email/
    ├── email.module.ts
    ├── email.service.ts            # Resend client
    └── templates/
        ├── invite-doctor.ts        # Doctor invite email template
        └── invite-member.ts        # Member invite email template
```

---

## Module Breakdown

### Core Infrastructure

| Module | Purpose |
|--------|---------|
| `config/` | Environment variable validation using Zod schemas. Validates DB_*, JWT_SECRET, RESEND_API_KEY, META_CLOUD_API_TOKEN, META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET, OPENAI_API_KEY at startup. |
| `database/` | Knex provider with connection pooling. Exposes a global `KnexModule` that all feature modules can inject. Migrations are raw SQL for full control. |
| `common/` | Shared decorators, guards, filters, interceptors, and pipes used across all modules. |
| `email/` | Resend email client with HTML templates for invite and password reset flows. |

### Feature Modules

| Module | Auth Domain | Description |
|--------|-------------|-------------|
| `auth` | Public | Login (agency + doctor), refresh tokens, email resolution, password reset. |
| `invite` | Agency (admin) | Polymorphic invite system for both agency members and doctors. |
| `agency` | Agency | Member management, dashboard stats, doctor oversight. |
| `doctor` | Doctor | Profile management, onboarding wizard, settings. |
| `patient` | Doctor + Public | Patient CRUD (doctor-side) and read-only portal (public with access code). |
| `appointment` | Doctor | Appointment lifecycle (scheduled, waiting, in_progress, completed, cancelled, no_show, rescheduled). |
| `clinical-note` | Doctor | Clinical notes tied to appointments and patients. |
| `document` | Doctor | Document management (prescription, certificate, exam) with file upload. |
| `agent-settings` | Doctor | WhatsApp agent configuration (welcome message, personality, FAQ, booking mode). |
| `event-log` | System | Audit trail append-only. Registra todas as acoes relevantes para debugging e historico. Nao exposto externamente. |
| `booking` | Public (token) | Public appointment booking with temporary tokens and rate limiting. Tambem expoe `generateToken()` para o modulo `agent`. |
| `agent` | Meta Cloud API (webhook) | Modulo do agente WhatsApp. Recebe webhooks da Meta Cloud API em `/api/v1/agent/webhook/cloud` (com validação HMAC-SHA256), gerencia estado de conversa, chama LLM, e envia respostas via Graph API. Subscreve eventos internos via `EventEmitter2`. |

---

## Example Controller (NestJS)

This example demonstrates the key NestJS advantages over the V1 Fastify approach: decorators for auth, RBAC, and tenant isolation, all in a clean, declarative style.

```typescript
// NestJS - Doctor Appointments Controller
@Controller('api/v1/doctor/appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('doctor')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Get()
  async list(@TenantId() tenantId: string, @Query() query: ListAppointmentsDto) {
    return this.appointmentService.listByTenant(tenantId, query);
  }

  @Post()
  async create(@TenantId() tenantId: string, @Body() dto: CreateAppointmentDto) {
    return this.appointmentService.create(tenantId, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.appointmentService.updateStatus(tenantId, id, dto);
  }
}
```

### What this demonstrates

- **`@UseGuards(JwtAuthGuard, RolesGuard)`** - Authentication and authorization applied to the entire controller in one line. Every route requires a valid JWT and the `doctor` role.
- **`@Roles('doctor')`** - RBAC declaration. The `RolesGuard` reads this metadata and rejects requests from non-doctor users with 403.
- **`@TenantId()`** - Custom parameter decorator that extracts `tenant_id` from the JWT payload. Guarantees tenant isolation without manual token parsing in every method.
- **`@Body() dto: CreateAppointmentDto`** - Zod validation pipe automatically validates the request body against the DTO schema before it reaches the handler.

---

## Advantages of NestJS for This Project

### 1. RBAC in One Line
```typescript
@Roles('doctor')  // vs implementing custom middleware in Fastify
```
The `RolesGuard` reads the `@Roles` metadata and compares it against the user's role from the JWT payload. No manual middleware wiring.

### 2. Tenant Isolation via Decorators
```typescript
@TenantId()  // Custom decorator extracts tenant_id from JWT automatically
```
Every doctor-side endpoint receives the tenant ID without any boilerplate. The `TenantGuard` ensures the token contains a valid tenant.

### 3. Auth in One Line per Controller or Route
```typescript
@UseGuards(JwtAuthGuard)  // Applied at controller or method level
```
No need to register middleware per route or per router. Guards are composable and stackable.

### 4. Automatic Swagger Documentation
```typescript
@ApiTags('appointments')
@ApiOperation({ summary: 'List doctor appointments' })
@ApiResponse({ status: 200, description: 'Paginated appointment list' })
```
Swagger is auto-generated from decorators. Accessible at `/api/docs` without maintaining separate API documentation.

### 5. Dependency Injection
Services are injected automatically through constructor parameters. No manual instantiation, no factory functions, no service locator pattern. NestJS resolves the dependency graph at startup.

### 6. Module Encapsulation
Each feature is a self-contained module with explicit imports and exports. This makes it clear which modules depend on each other and prevents unintended coupling.

---

## Guard Hierarchy

The guards are applied in a specific order and serve different purposes:

```
Request
  │
  ├── JwtAuthGuard        → Is the JWT valid? (401 if not)
  │     │
  │     ├── RolesGuard    → Does the user have the required role? (403 if not)
  │     │     │
  │     │     └── TenantGuard → Does the token contain a tenant_id? (403 if not)
  │     │
  │     └── (Route handler executes)
  │
  └── (Agent webhook: validacao HMAC-SHA256 do header X-Hub-Signature-256 da Meta Cloud API)
```

- **JwtAuthGuard**: Used for all authenticated routes (agency and doctor portals).
- **RolesGuard**: Used in combination with `@Roles()` decorator to enforce role-based access.
- **TenantGuard**: Used on doctor-side routes to ensure tenant isolation.
- **ApiKeyGuard**: Removido. O endpoint do agente (`/api/v1/agent/webhook/cloud`) valida o payload via HMAC-SHA256 (`X-Hub-Signature-256`) usando `META_APP_SECRET`, sem guard separado.

---

## API Route Conventions

| Prefix | Auth | Description |
|--------|------|-------------|
| `/api/v1/agency/auth/*` | Public | Agency login, invite acceptance, password reset |
| `/api/v1/agency/*` | JWT + agency role | Agency portal endpoints |
| `/api/v1/doctor/auth/*` | Public | Doctor login, invite acceptance, password reset |
| `/api/v1/doctor/*` | JWT + doctor role | Doctor portal endpoints |
| `/api/v1/public/booking/*` | Token-based | Public booking page endpoints |
| `/api/v1/patient/portal/*` | Access code | Patient portal (no JWT) |
| `/api/v1/agent/webhook/cloud` | Meta Cloud API (HMAC-SHA256) | Recebe eventos do WhatsApp (mensagens, status) |
| `/health` | Public | Health check |