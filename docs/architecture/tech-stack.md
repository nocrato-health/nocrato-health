# Tech Stack - Nocrato Health V2

## Overview

Nocrato Health V2 is a complete rebuild of the original V1 project. The V1 was a "vibe coding" prototype that served as domain learning. During development, fundamental domain modeling problems became clear, leading to the decision to rebuild from scratch with correct modeling, simplified architecture, and MVP focus.

---

## Technology Choices

| Layer | Technology | Why It Was Chosen |
|-------|-----------|-------------------|
| **Monorepo** | pnpm workspaces + Turborepo | Proven setup from V1. pnpm provides efficient disk usage with symlinked node_modules, and Turborepo handles task orchestration with caching for fast builds across apps/api and apps/web. |
| **Backend** | NestJS + TypeScript | Provides built-in structure (modules, controllers, services), Guards for RBAC, dependency injection out of the box, and automatic Swagger documentation. Eliminates the need to wire up middleware manually. |
| **Database** | PostgreSQL 16 + Knex | PostgreSQL is the industry standard for relational data with strong JSONB support (used for working_hours). Knex provides a lightweight query builder with raw SQL migrations, avoiding ORM overhead. |
| **Auth** | @nestjs/jwt + @nestjs/passport | JWT access + refresh token strategy with built-in Guards. Integrates natively with NestJS decorator-based auth (`@UseGuards`). Stateless refresh tokens (7-day expiration) simplify the architecture. |
| **Validation** | Zod + nestjs-zod | Zod provides TypeScript-first schema validation with type inference. nestjs-zod integrates it as automatic NestJS validation pipes, ensuring DTOs are validated before reaching controllers. |
| **Email** | Resend | Free tier covers up to 100 emails/day (sufficient for MVP). Simple SDK, modern API, and reliable delivery for invite and password reset emails. |
| **Frontend** | Vite + React 19 + TanStack Router | Vite provides fast HMR and builds. React 19 is the latest stable version. TanStack Router offers file-based routing with full type safety, which maps cleanly to the multi-portal architecture. |
| **UI** | shadcn/ui + Tailwind CSS v4 | shadcn/ui provides copy-paste components that are fully customizable (not a dependency). Tailwind v4 brings faster compilation and a streamlined config. Both were proven in V1. |
| **Data Fetching** | TanStack Query | Provides caching, background refetching (refetchInterval: 30s for near-real-time updates), and optimistic updates. Handles loading/error states declaratively. |
| **Agent** | Modulo NestJS interno | Modulo `agent/` dentro do proprio NestJS que orquestra o agente WhatsApp. Recebe webhooks diretamente da Evolution API, processa com LLM (OpenAI SDK — gpt-4o-mini, mais barato e rapido para chatbot), gerencia estado de conversa no banco, e envia respostas de volta. Sem dependencia de ferramenta externa. |
| **Container** | Docker (PostgreSQL) | Provides consistent local development with `docker compose up -d`. PostgreSQL 16 runs in a container, matching the production environment on Hetzner. |

---

## V1 vs V2 Architecture Comparison

| Aspect | V1 (Original) | V2 (Rebuild) |
|--------|---------------|--------------|
| **Backend Framework** | Fastify + manual routing | NestJS (structured modules, DI, Guards) |
| **Architecture Pattern** | Individual Use Cases, VOs, Repository interfaces | Simplified services + repositories per module |
| **Auth & RBAC** | Custom middleware implementation | Built-in `@UseGuards`, `@Roles` decorators |
| **Domain Model** | Agency treated as clinic/tenant (incorrect) | Agency and Tenant are separate entities; Tenant = doctor portal only |
| **Login Flow** | Single auth domain | Separate auth domains: agency_members vs doctors |
| **Tenant Isolation** | Mixed concept (clinic = tenant) | Clear: Tenant is the doctor's portal (slug-based) |
| **API Documentation** | Manual / none | Automatic Swagger via `@ApiTags`, `@ApiOperation` |
| **Complexity** | Over-engineered for solo developer | Right-sized for MVP with clear module boundaries |
| **Booking System** | Not implemented | Token-based public booking + in-chat via agente interno |
| **Patient Portal** | Not implemented | Access code-based read-only portal (no JWT) |

---

## Key Architectural Decisions Behind the Stack

### Why NestJS over Fastify (V1)?

The V1 used Fastify with manual routing, which required implementing middleware for auth, RBAC, validation, and error handling from scratch. NestJS provides all of this as first-class features:

- **RBAC in one line**: `@Roles('doctor')` vs writing custom middleware
- **Auth in one line**: `@UseGuards(JwtAuthGuard)` per controller or per route
- **Tenant extraction**: `@TenantId()` custom decorator extracts tenant from JWT automatically
- **Dependency Injection**: Services are injected automatically without manual setup
- **Module encapsulation**: Each feature is isolated with explicit imports

### Why Knex over an ORM?

Knex was kept from V1 because it provides the right level of abstraction for this project:

- Raw SQL migrations give full control over the schema (important for partial indexes, JSONB columns, triggers)
- Query builder is expressive enough without the overhead of an ORM
- No "magic" - queries are predictable and debuggable

### Why Local Uploads over S3?

For the MVP phase, files are stored locally at `./uploads/{tenantId}/`. This simplifies deployment (single Hetzner server with Nginx) and avoids the cost/complexity of cloud storage. Migration to S3/R2 is planned for post-MVP when scaling requires it.

### Why Stateless Refresh Tokens?

Refresh tokens are stateless JWTs with 7-day expiration, stored only on the client side. This avoids the need for a token table or Redis, keeping the architecture simple. The tradeoff (cannot revoke individual sessions) is acceptable for the MVP.

---

## Production Environment

| Component | Specification |
|-----------|--------------|
| **Server** | Hetzner CX22 (2 vCPU, 4 GB RAM) |
| **Reverse Proxy** | Nginx + SSL (Let's Encrypt) |
| **Database** | PostgreSQL 16 (Docker container) |
| **WhatsApp** | Evolution API (Docker container) |
| **Agent** | Modulo interno do NestJS (sem container separado) |
| **File Storage** | Local disk (`./uploads/`) |
| **Domain** | app.nocrato.com |
