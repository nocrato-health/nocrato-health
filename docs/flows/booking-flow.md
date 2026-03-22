---
tags: [flow]
type: flow
---

# Booking Flow

Two options for patient appointment booking: external calendar with token security, or in-chat via the internal WhatsApp agent (NestJS module). The doctor chooses their preferred mode in agent settings (`bookingMode: 'link' | 'chat' | 'both'`).

---

## Table of Contents

1. [Option A: External Calendar with Token](#option-a-external-calendar-with-token)
2. [Option B: In-Chat via Agente Interno](#option-b-in-chat-via-agente-interno)
3. [Slot Calculation Algorithm](#slot-calculation-algorithm)
4. [Security Measures](#security-measures)
5. [Booking Tokens Lifecycle](#booking-tokens-lifecycle)
6. [Database Records Created](#database-records-created)

---

## Option A: External Calendar with Token

The patient receives a link from the WhatsApp agent, opens it in a browser, selects a date and time, and confirms. This is the primary booking mode.

### Full Flow

**Step 1: Agente interno gera um booking token**

O `agent.service.ts` chama `bookingService.generateToken(tenantId, phone)` diretamente (chamada interna de servico, sem HTTP):

```typescript
// agent.service.ts (tool_call: generate_booking_link)
const { token, bookingUrl } = await this.bookingService.generateToken(tenantId, phone);
await this.whatsappService.sendText(phone, `Aqui esta o link: ${bookingUrl}`);
```

Response:
```json
{
  "token": "abc123xyz789def456",
  "expiresAt": "2024-01-16T14:30:00Z",
  "bookingUrl": "https://app.nocrato.com/book/dr-silva?token=abc123xyz789def456"
}
```

What happens server-side:
```sql
INSERT INTO booking_tokens (tenant_id, token, phone, expires_at, used)
VALUES ({tenant_id}, 'abc123xyz789def456', '+5511999999999', now() + interval '24 hours', false)
```

**Step 2: Agent sends link to patient via WhatsApp**
```
"Aqui esta o link para agendar sua consulta com Dr. Silva:
https://app.nocrato.com/book/dr-silva?token=abc123xyz789def456
O link e valido por 24 horas."
```

**Step 3: Patient opens the page in browser**
- Frontend route: `/book/{slug}` (`routes/book/$slug.tsx`)
- Extracts `token` from URL query parameter

**Step 4: Frontend validates the token**
```
GET /api/v1/public/booking/{slug}/validate?token=abc123xyz789def456
```

Response (success):
```json
{
  "valid": true,
  "doctor": {
    "name": "Dr. Maria Silva",
    "specialty": "Cardiologia",
    "slug": "dr-silva"
  },
  "tenant": {
    "name": "Dr. Maria Silva - Cardiologia",
    "primaryColor": "#0066CC",
    "logoUrl": "https://..."
  }
}
```

Response (invalid token):
```json
{
  "valid": false,
  "reason": "expired"
}
```
HTTP 403 Forbidden

**Step 5: Patient selects a date**
- Frontend shows a calendar component
- Patient picks a date (e.g., 2024-01-15)

**Step 6: Frontend fetches available slots for that date**
```
GET /api/v1/public/booking/{slug}/slots?date=2024-01-15&token=abc123xyz789def456
```

Response:
```json
{
  "date": "2024-01-15",
  "slots": [
    { "start": "08:00", "end": "08:30" },
    { "start": "08:30", "end": "09:00" },
    { "start": "09:00", "end": "09:30" },
    { "start": "10:00", "end": "10:30" },
    { "start": "14:00", "end": "14:30" },
    { "start": "14:30", "end": "15:00" }
  ],
  "timezone": "America/Sao_Paulo",
  "durationMinutes": 30
}
```

**Step 7: Patient fills the booking form**
- Selects a slot from the list
- Fills in name and phone number
- If `booking_tokens.phone` was pre-set pelo agente interno, the phone field is pre-filled and read-only

**Step 8: Patient confirms booking**
```
POST /api/v1/public/booking/{slug}/book
Content-Type: application/json

{
  "token": "abc123xyz789def456",
  "name": "Joao Santos",
  "phone": "+5511999999999",
  "dateTime": "2024-01-15T08:00:00-03:00"
}
```

**Step 9: Server processes the booking**

Validations (in order):
1. Token exists and `used = false`
2. Token not expired (`expires_at > now()`)
3. Token belongs to the correct tenant (via slug lookup)
4. Rate limit: max 5 requests/hour per IP (`@nestjs/throttler`)
5. Max 2 active appointments per phone per doctor
6. Slot still available (no conflicting appointment -- uses `SELECT ... FOR UPDATE`)

Processing (in transaction):
1. `findOrCreate` patient by phone within tenant
   ```sql
   -- Find
   SELECT * FROM patients WHERE tenant_id = {tenant_id} AND phone = '+5511999999999';
   -- Or Create
   INSERT INTO patients (tenant_id, name, phone, source, status)
   VALUES ({tenant_id}, 'Joao Santos', '+5511999999999', 'whatsapp_agent', 'active');
   ```
2. Create appointment
   ```sql
   INSERT INTO appointments (tenant_id, patient_id, date_time, duration_minutes, status, created_by)
   VALUES ({tenant_id}, {patient_id}, '2024-01-15T11:00:00Z', 30, 'scheduled', 'agent');
   ```
3. Mark token as used
   ```sql
   UPDATE booking_tokens SET used = true WHERE token = 'abc123xyz789def456';
   ```
4. Emit event
   ```sql
   INSERT INTO event_log (tenant_id, event_type, payload, actor_type)
   VALUES ({tenant_id}, 'appointment.created', '{"appointment_id":"...","patient_id":"...","date_time":"...","source":"booking_link"}', 'agent');
   ```

**Step 10: Server returns confirmation**
```json
{
  "appointment": {
    "id": "uuid",
    "dateTime": "2024-01-15T08:00:00-03:00",
    "durationMinutes": 30,
    "status": "scheduled"
  },
  "patient": {
    "name": "Joao Santos"
  },
  "doctor": {
    "name": "Dr. Maria Silva",
    "specialty": "Cardiologia"
  },
  "message": "Consulta agendada com sucesso!"
}
```

**Step 11: Patient sees confirmation page**
- Frontend displays: doctor name, date, time, duration
- Message: "Voce recebera confirmacao no WhatsApp"

**Step 12: Agent confirms on WhatsApp**
- O `agent.service.ts` recebe o evento `appointment.created` via `EventEmitter2` (zero latencia)
- Envia mensagem WhatsApp confirmando os detalhes da consulta via `whatsappService.sendText()`

---

## Option B: In-Chat via Agente Interno

O agente NestJS gerencia todo o fluxo de agendamento dentro da conversa WhatsApp. Nenhuma pagina externa e aberta.

### Full Flow

**Step 1: Patient asks to schedule via WhatsApp**
```
Patient: "Quero agendar uma consulta"
Agent: "Claro! Para qual dia voce gostaria? (Disponivel de segunda a sexta)"
Patient: "Quarta-feira dia 15"
```

**Step 2: Agent fetches available slots (chamada interna de servico)**
```typescript
// agent.service.ts (tool_call: list_slots)
const slots = await this.bookingService.getSlots(tenantId, '2024-01-15');
```

Response:
```json
{
  "date": "2024-01-15",
  "slots": [
    { "start": "08:00", "end": "08:30" },
    { "start": "09:00", "end": "09:30" },
    { "start": "10:00", "end": "10:30" },
    { "start": "14:00", "end": "14:30" }
  ],
  "timezone": "America/Sao_Paulo",
  "durationMinutes": 30
}
```

Note: This endpoint is under `/api/v1/webhook/` and uses API key auth (no booking token needed).

**Step 3: Agent presents options in chat**
```
Agent: "Horarios disponiveis para quarta 15/01:
1) 08:00
2) 09:00
3) 10:00
4) 14:00

Qual horario voce prefere?"
```

**Step 4: Patient chooses**
```
Patient: "2"
Agent: "Otimo! Vou agendar para 09:00 do dia 15/01. Pode confirmar seu nome completo?"
Patient: "Joao Santos"
```

**Step 5: Agent creates the booking (chamada interna de servico)**
```typescript
// agent.service.ts (tool_call: book_appointment)
const result = await this.bookingService.bookInChat(tenantId, {
  name: 'Joao Santos',
  phone: '+5511999999999',
  dateTime: '2024-01-15T09:00:00-03:00',
});
```

Note: Sem token e sem HTTP — e uma chamada direta entre modulos NestJS.

**Step 6: Server processes the booking**

Same processing as Option A steps 9, but:
- No booking token validation (chamada interna, sem autenticacao HTTP)
- No token to mark as used
- Max 2 active appointments per phone still enforced

Response:
```json
{
  "appointment": {
    "id": "uuid",
    "dateTime": "2024-01-15T09:00:00-03:00",
    "durationMinutes": 30,
    "status": "scheduled"
  },
  "patient": {
    "id": "uuid",
    "name": "Joao Santos"
  }
}
```

**Step 7: Agent confirms in chat**
```
Agent: "Consulta agendada! Resumo:
- Dr. Maria Silva (Cardiologia)
- Quarta, 15/01/2024 as 09:00
- Duracao: 30 minutos

Voce recebera um lembrete antes da consulta."
```

---

## Slot Calculation Algorithm

Implemented in `booking.service.ts`. Used by both Option A and Option B.

### Algorithm Steps

```
Input:
  - slug (resolves to tenant_id)
  - date (YYYY-MM-DD)

Step 1: Resolve tenant and doctor
  SELECT d.working_hours, d.appointment_duration, d.timezone
  FROM doctors d
  JOIN tenants t ON t.id = d.tenant_id
  WHERE t.slug = :slug AND t.status = 'active' AND d.status = 'active'

Step 2: Get working hours for the day of the week
  dayOfWeek = getDayOfWeek(date, doctor.timezone)  // e.g., "monday"
  blocks = doctor.working_hours[dayOfWeek]
  // Example: [{"start": "08:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}]
  // If empty or undefined -> no slots (doctor doesn't work that day)

Step 3: Fetch existing appointments for that date
  SELECT date_time, duration_minutes
  FROM appointments
  WHERE tenant_id = :tenant_id
    AND date_time >= :startOfDay (in doctor's timezone, converted to UTC)
    AND date_time < :endOfDay (in doctor's timezone, converted to UTC)
    AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
  // Only active/valid appointments are considered as conflicts

Step 4: Generate all possible slots from working hour blocks
  For each block in blocks:
    cursor = block.start
    while cursor + duration <= block.end:
      slots.push({ start: cursor, end: cursor + duration })
      cursor += duration
  // Example with duration=30: 08:00-12:00 generates:
  // 08:00-08:30, 08:30-09:00, 09:00-09:30, ..., 11:30-12:00

Step 5: Remove slots that conflict with existing appointments
  For each slot in slots:
    slotStart = toUTC(date + slot.start, doctor.timezone)
    slotEnd = toUTC(date + slot.end, doctor.timezone)
    For each appointment in existingAppointments:
      apptStart = appointment.date_time
      apptEnd = appointment.date_time + appointment.duration_minutes
      if (slotStart < apptEnd AND slotEnd > apptStart):
        // Overlap detected -> remove slot
        mark slot as unavailable

Step 6: Filter past slots (if date is today)
  if date == today:
    now = getCurrentTime(doctor.timezone)
    remove slots where slot.start <= now
    // Optionally add a buffer: remove slots where slot.start <= now + 30min

Step 7: Return available slots
  Return remaining slots sorted by start time
```

### Example

Doctor working hours (Wednesday):
```json
{
  "wednesday": [
    { "start": "08:00", "end": "12:00" },
    { "start": "14:00", "end": "18:00" }
  ]
}
```

Duration: 30 minutes

Existing appointments on 2024-01-15:
- 08:30 - 09:00 (scheduled)
- 10:00 - 10:30 (waiting)
- 14:00 - 14:30 (scheduled)

Generated slots (all):
```
08:00-08:30, 08:30-09:00, 09:00-09:30, 09:30-10:00, 10:00-10:30,
10:30-11:00, 11:00-11:30, 11:30-12:00, 14:00-14:30, 14:30-15:00,
15:00-15:30, 15:30-16:00, 16:00-16:30, 16:30-17:00, 17:00-17:30,
17:30-18:00
```

After removing conflicts:
```
08:00-08:30, 09:00-09:30, 09:30-10:00, 10:30-11:00, 11:00-11:30,
11:30-12:00, 14:30-15:00, 15:00-15:30, 15:30-16:00, 16:00-16:30,
16:30-17:00, 17:00-17:30, 17:30-18:00
```

---

## Security Measures

### 1. Booking Token (Option A only)

| Aspect | Detail |
|--------|--------|
| Format | 64-character cryptographically random string |
| Generation | `crypto.randomBytes(32).toString('hex')` |
| Expiry | 24 hours from creation |
| Usage | Single-use (marked `used = true` after successful booking) |
| Scope | Tied to a specific tenant |
| Phone binding | Optional -- o agente interno pode vincular um telefone ao token na geracao |

**Validation checks (every request):**
1. Token exists in `booking_tokens` table
2. `used = false`
3. `expires_at > now()`
4. Token's `tenant_id` matches the resolved slug's tenant

### 2. Rate Limiting

| Rule | Value | Scope |
|------|-------|-------|
| IP rate limit | 5 requests per hour | Per IP address (Option A public endpoints) |
| Implementation | `@nestjs/throttler` | Applied to all `/api/v1/public/booking/*` routes |

### 3. Max Appointments Per Phone

| Rule | Value |
|------|-------|
| Max active appointments | 2 per phone per doctor |
| Active statuses | `scheduled`, `waiting`, `in_progress` |
| Excluded statuses | `completed`, `cancelled`, `no_show`, `rescheduled` |

Query:
```sql
SELECT COUNT(*) FROM appointments a
JOIN patients p ON p.id = a.patient_id
WHERE a.tenant_id = :tenant_id
  AND p.phone = :phone
  AND a.status IN ('scheduled', 'waiting', 'in_progress')
```

If count >= 2, the booking is rejected with:
```json
{
  "error": "Maximum active appointments reached for this phone number.",
  "code": "MAX_APPOINTMENTS_REACHED"
}
```

### 4. Slot Conflict Prevention

```sql
-- Lock the time range to prevent race conditions
SELECT id FROM appointments
WHERE tenant_id = :tenant_id
  AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
  AND date_time < :slotEnd
  AND date_time + (duration_minutes || ' minutes')::interval > :slotStart
FOR UPDATE
```

If a conflicting appointment is found, the booking is rejected with:
```json
{
  "error": "This time slot is no longer available.",
  "code": "SLOT_CONFLICT"
}
```

### 5. Doctor/Tenant Status Validation

Before any booking operation:
- `tenants.status` must be `'active'`
- `doctors.status` must be `'active'`

If inactive:
```json
{
  "error": "This doctor is not currently accepting appointments.",
  "code": "DOCTOR_UNAVAILABLE"
}
```

---

## Booking Tokens Lifecycle

### Token States

```
                    ┌──────────────────────────────────────┐
                    │                                      │
  Agente interno    │    ┌─────────┐                       │
  ─────────────────>│    │ ACTIVE  │                       │
                    │    │(unused) │                       │
                    │    └────┬────┘                       │
                    │         │                            │
                    │    ┌────┴──────────────┐             │
                    │    │                   │             │
                    │    ▼                   ▼             │
                    │ ┌──────┐         ┌─────────┐        │
                    │ │ USED │         │ EXPIRED │        │
                    │ └──────┘         └─────────┘        │
                    │                                      │
                    └──────────────────────────────────────┘
```

### Database Schema

```sql
CREATE TABLE booking_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token       VARCHAR(64)  NOT NULL,
    phone       VARCHAR(20),           -- optional, pre-bound pelo agente interno
    expires_at  TIMESTAMPTZ  NOT NULL,  -- default: now() + 24h
    used        BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT booking_tokens_token_unique UNIQUE (token)
);
CREATE INDEX idx_booking_tokens_token ON booking_tokens (token) WHERE used = false;
```

### Token Query (validation)

```sql
SELECT * FROM booking_tokens
WHERE token = :token
  AND used = false
  AND expires_at > now()
```

The partial index `WHERE used = false` ensures this query is efficient even with many historical tokens.

### Cleanup

Expired and used tokens can be cleaned up periodically (e.g., daily cron):
```sql
DELETE FROM booking_tokens
WHERE used = true OR expires_at < now() - interval '7 days'
```

This is optional since the partial index ensures expired/used tokens do not affect query performance.

---

## Database Records Created

When a booking succeeds, these records are created/modified:

| Table | Action | Details |
|-------|--------|---------|
| `patients` | `findOrCreate` | Found by `(tenant_id, phone)`. Created with `source = 'whatsapp_agent'` if new |
| `appointments` | `INSERT` | `status = 'scheduled'`, `created_by = 'agent'` |
| `booking_tokens` | `UPDATE` | `used = true` (Option A only) |
| `event_log` | `INSERT` | `event_type = 'appointment.created'` |

### Endpoints Summary

| Endpoint | Auth | Used By | Purpose |
|----------|------|---------|---------|
| `bookingService.generateToken()` | Chamada interna | Agente NestJS | Generate booking token |
| `GET /api/v1/public/booking/{slug}/validate` | Token (query param) | Browser | Validate token |
| `GET /api/v1/public/booking/{slug}/slots` | Token (query param) | Browser | List available slots |
| `POST /api/v1/public/booking/{slug}/book` | Token (body) | Browser | Create appointment |
| `bookingService.getSlots()` | Chamada interna | Agente NestJS | List slots (in-chat) |
| `bookingService.bookInChat()` | Chamada interna | Agente NestJS | Create appointment (in-chat) |