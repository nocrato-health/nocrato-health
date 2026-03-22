---
tags: [architecture]
type: architecture
---

# Frontend Structure - Nocrato Health V2

## Overview

The frontend is a single-page application built with **Vite + React 19 + TanStack Router**, located at `apps/web/` in the monorepo. It serves four distinct user-facing surfaces through a unified codebase: the **Agency Portal**, the **Doctor Portal**, the **Patient Portal**, and the **Public Booking Page**.

---

## Directory Structure

```
apps/web/src/
├── main.tsx                    # Entry point: code-based router + QueryClientProvider
├── app.css                     # @import "tailwindcss" + @theme com design tokens
├── lib/
│   ├── api-client.ts           # fetch wrapper: auto-inject token, auto-refresh 401
│   ├── auth.ts                 # Zustand store: accessToken, refreshToken, user, userType
│   ├── query-client.ts         # TanStack Query (refetchInterval: 30s)
│   ├── utils.ts                # cn() helper (clsx + tailwind-merge)
│   └── queries/                # TanStack Query hooks por domínio
│       ├── agency.ts
│       ├── doctor.ts
│       ├── patients.ts
│       ├── appointments.ts
│       ├── clinical.ts
│       ├── booking.ts
│       └── patient-portal.ts
├── types/
│   └── api.ts                  # DTOs das respostas do backend
├── components/
│   └── ui/                     # shadcn/ui + componentes customizados
└── routes/
    ├── __root.tsx
    ├── agency/
    │   ├── login.tsx            # Agency member login
    │   ├── reset-password.tsx   # Forgot/reset password
    │   ├── _layout.tsx          # Auth guard + agency sidebar
    │   ├── dashboard.tsx        # Agency dashboard (doctors, members stats)
    │   ├── doctors/
    │   │   ├── index.tsx        # Doctor list + invite
    │   │   └── $doctorId.tsx    # Doctor profile view
    │   └── members/
    │       └── index.tsx        # Member list
    ├── doctor/
    │   ├── login.tsx            # Doctor login (email → resolve slug → senha)
    │   ├── invite.tsx           # Accept invite (token na URL)
    │   ├── reset-password.tsx   # Forgot/reset password
    │   ├── _layout.tsx          # Auth guard + doctor sidebar + onboarding redirect
    │   ├── dashboard.tsx        # Today's appointments, stats
    │   ├── onboarding.tsx       # Post-invite wizard (4 steps)
    │   ├── settings.tsx         # Profile, schedule, branding, agent config
    │   ├── patients/
    │   │   ├── index.tsx        # Patient list (search + filter)
    │   │   └── $patientId.tsx   # Patient profile (tabs: info, consultas, notas, docs)
    │   └── appointments/
    │       ├── index.tsx        # Appointment list (filter by status/date)
    │       └── $appointmentId.tsx # Appointment detail (status, notes, summary)
    ├── patient/
    │   ├── access.tsx           # Enter access code
    │   └── portal.tsx           # Read-only profile
    └── book/
        └── $slug.tsx            # Public booking page (calendar + slots)
```

---

## Routing Strategy: TanStack Router (Code-Based)

The frontend uses **TanStack Router** with **code-based routing**. As rotas são declaradas diretamente em `main.tsx` usando `createRoute()` — não há geração automática de `routeTree.gen.ts`. Isso garante type safety total sem dependência de um passo de build adicional.

### Como o roteamento code-based funciona

| Padrão | Rota | Propósito |
|--------|------|-----------|
| `createRootRoute()` | `/` | Root layout (providers, error boundaries) |
| `createRoute({ path: '/agency/login' })` | `/agency/login` | Página standalone (sem layout wrapper) |
| `createRoute({ id: 'doctor-layout' })` | `/doctor/*` | Layout route (auth guard + sidebar, wraps children) |
| `createRoute({ path: '/doctor/dashboard' })` | `/doctor/dashboard` | Página dentro do layout |
| `createRoute({ path: '/doctor/patients/$patientId' })` | `/doctor/patients/:patientId` | Rota dinâmica |
| `createRoute({ path: '/book/$slug' })` | `/book/:slug` | Rota pública dinâmica |

### Key Conventions

- **`_layout.tsx`** files define layout routes that wrap their children with shared UI (sidebar, auth guards). The underscore prefix means the segment does not appear in the URL.
- **`$param.tsx`** files use the `$` prefix for dynamic parameters (`$patientId`, `$appointmentId`, `$slug`).
- Todas as rotas são registradas no `routeTree` em `main.tsx` — adicionar uma rota nova requer atualizar o `main.tsx`.
- **`__root.tsx`** defines the application root layout (providers, global error boundaries).

---

## The Four Portals

### 1. Agency Portal (`/agency/*`)

The internal administration portal for Nocrato staff. Agency members (admins and collaborators) use this to manage doctors and oversee the platform.

| Route | Page | Description |
|-------|------|-------------|
| `/agency/login` | Login | Email + password authentication for agency members |
| `/agency` | Dashboard | Overview cards with total doctors, active doctors, total patients |
| `/agency/doctors` | Doctor List | Paginated list of all doctors with invite, activate, and deactivate actions |
| `/agency/doctors/:doctorId` | Doctor Profile | Read-only view of a specific doctor's profile and stats |
| `/agency/members` | Member List | List of agency collaborators with status management |

**Auth**: Protected by `_layout.tsx` auth guard. Requires valid JWT with an agency role (`agency_admin` or `agency_member`).

**Sidebar**: Dashboard, Doctors, Members.

### 2. Doctor Portal (`/doctor/*`)

The primary workspace for doctors. This is where doctors manage their practice: patients, appointments, clinical notes, documents, and agent settings.

| Route | Page | Description |
|-------|------|-------------|
| `/doctor/login` | Login | Two-step: enter email, resolve slug, then enter password |
| `/doctor/invite` | Accept Invite | Create slug + password from invite link |
| `/doctor` | Dashboard | Today's appointments, total patients, pending follow-ups |
| `/doctor/onboarding` | Onboarding Wizard | 4-step wizard: Profile, Schedule, Branding, Agent |
| `/doctor/patients` | Patient List | Searchable, filterable list with status badges |
| `/doctor/patients/:patientId` | Patient Profile | Tabbed view: Info, Appointments, Notes, Documents |
| `/doctor/appointments` | Appointment List | Filterable by status, date, and patient |
| `/doctor/appointments/:appointmentId` | Appointment Detail | Status transition buttons, clinical notes, agent summary |
| `/doctor/settings` | Settings | Profile, working hours, branding, and WhatsApp agent config |

**Auth**: Protected by `_layout.tsx` auth guard. Requires valid JWT with the `doctor` role. Automatically redirects to `/doctor/onboarding` if onboarding is not completed.

**Sidebar**: Dashboard, Patients, Appointments, Settings.

### 3. Patient Portal (`/patient/*`)

A minimal, read-only portal for patients to view their medical information. Designed to be mobile-first with a clean interface.

| Route | Page | Description |
|-------|------|-------------|
| `/patient/access` | Access Form | Patient enters their portal access code (received via WhatsApp) |
| `/patient/portal` | Portal View | Read-only display of personal data, appointment history, and downloadable documents |

**Auth**: No JWT. The patient authenticates with a unique access code (e.g., `ABC-1234-XYZ`) generated after their first completed appointment. The access is stateless and session-less.

**Design**: Mobile-first, clean, minimal. Patients can view everything but edit nothing.

### 4. Public Booking Page (`/book/*`)

A public-facing appointment booking page that patients access via a link sent by the WhatsApp agent.

| Route | Page | Description |
|-------|------|-------------|
| `/book/:slug` | Booking Page | Calendar date picker, available time slots, and booking form |

**Auth**: Token-based. The URL includes a temporary token (e.g., `/book/dr-silva?token=abc123xyz`) that is validated against the `booking_tokens` table. The token expires after 24 hours and can only be used once.

**Flow**:
1. Patient opens the link received from the WhatsApp agent
2. Frontend validates the token via `GET /api/v1/public/booking/:slug/validate?token=X`
3. Patient selects a date and sees available time slots
4. Patient fills in name + phone number and selects a slot
5. Frontend submits the booking via `POST /api/v1/public/booking/:slug/book`
6. Confirmation screen is displayed

**Security**: Rate limited (max 5 requests/hour per IP), max 2 active appointments per phone per doctor, token expires in 24h, and an invalid/used token returns 403.

---

## Shared Infrastructure

### `lib/api-client.ts`

A `fetch` wrapper that handles:
- Automatic JWT injection in the `Authorization` header
- Automatic token refresh when a 401 is received
- Base URL configuration
- JSON serialization/deserialization

### `lib/auth.ts`

Zustand store persistido em `localStorage` (key: `nocrato-auth`). Armazena `accessToken`, `refreshToken`, `user`, `userType`, `tenantId`, `onboardingCompleted`. Actions: `setAuth()`, `clearAuth()`, `updateTokens()`. Não usa React Context.

### `lib/query-client.ts`

TanStack Query client configured with sensible defaults including `refetchInterval: 30000` (30 seconds) for near-real-time data updates across the application.

### `lib/queries/`

TanStack Query hooks por domínio (queries + mutations). Organizados por entidade:
- `patients.ts` — CRUD de pacientes, perfil completo
- `appointments.ts` — listagem, criação, transições de status, dashboard
- `clinical.ts` — criação de notas clínicas, upload de documentos
- `doctor.ts` — onboarding, perfil, schedule, branding, agent settings
- `agency.ts` — gestão de membros, doutores, convites
- `booking.ts` — validação de token, slots, agendamento público
- `patient-portal.ts` — acesso via código, dados read-only

### `components/ui/`

shadcn/ui components (Button, Card, Dialog, Table, etc.) that are copied into the project and fully customizable. These are styled with Tailwind CSS v4.

---

## Data Flow

```
User Interaction
    │
    ▼
TanStack Router (route matching + params)
    │
    ▼
Route Component (renders page)
    │
    ▼
Custom Hook (use-patients, use-appointments, etc.)
    │
    ▼
TanStack Query (caching, refetching, optimistic updates)
    │
    ▼
api-client.ts (fetch + auth headers + token refresh)
    │
    ▼
NestJS API (/api/v1/*)
```