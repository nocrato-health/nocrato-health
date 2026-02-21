# Appointment Lifecycle

Complete documentation of appointment status transitions, events emitted, side effects, and access control.

---

## Table of Contents

1. [Status Overview](#1-status-overview)
2. [Transition Diagram](#2-transition-diagram)
3. [Valid Transitions Detail](#3-valid-transitions-detail)
4. [Auto-Transition: Scheduled to Waiting](#4-auto-transition-scheduled-to-waiting)
5. [Portal Access Code Generation](#5-portal-access-code-generation)
6. [Who Can Trigger Each Transition](#6-who-can-trigger-each-transition)
7. [API Endpoint](#7-api-endpoint)
8. [Transition Validation Matrix](#8-transition-validation-matrix)

---

## 1. Status Overview

| Status | Meaning | Terminal? |
|--------|---------|-----------|
| `scheduled` | Appointment booked, waiting for the date/time | No |
| `waiting` | Appointment time has arrived, patient is in the waiting room | No |
| `in_progress` | Doctor has started the consultation | No |
| `completed` | Consultation finished | Yes |
| `cancelled` | Appointment was cancelled before it happened | Yes |
| `no_show` | Patient did not show up | Yes |
| `rescheduled` | Appointment moved to a new date/time (creates a new appointment) | Yes |

Terminal statuses cannot transition to any other status.

---

## 2. Transition Diagram

```
                              ┌───────────────────────────────────────────┐
                              │                                           │
                              │                CANCELLED                  │
                              │           (cancellation_reason)           │
                              │                                           │
                              └───────────────────────────────────────────┘
                                        ▲                    ▲
                                        │                    │
                                        │                    │
    ┌───────────┐  auto/manual   ┌──────┴────┐   doctor   ┌─┴───────────┐   doctor   ┌───────────┐
    │           │ ─────────────> │           │ ─────────> │             │ ─────────> │           │
    │ SCHEDULED │                │  WAITING  │            │ IN_PROGRESS │            │ COMPLETED │
    │           │                │           │            │             │            │           │
    └─────┬─────┘                └──────┬────┘            └─────────────┘            └───────────┘
          │                             │                                               │
          │                             │                                               │
          ├──────────────┐              │                                    portal_access_code
          │              │              │                                    generated if first
          ▼              ▼              ▼                                    completed appointment
    ┌───────────┐  ┌───────────┐  ┌───────────┐
    │           │  │           │  │           │
    │ NO_SHOW   │  │RESCHEDULED│  │  NO_SHOW  │
    │           │  │           │  │           │
    └───────────┘  └───────────┘  └───────────┘
```

---

## 3. Valid Transitions Detail

### 3.1 scheduled -> waiting

**Trigger:** Automatic (when appointment time passes) or manual (doctor clicks "Patient arrived")

**What happens:**
1. Status updated to `waiting`
2. Event emitted: `appointment.status_changed`

**Event payload:**
```json
{
  "appointment_id": "uuid",
  "patient_id": "uuid",
  "old_status": "scheduled",
  "new_status": "waiting",
  "trigger": "auto|manual"
}
```

**Side effects:** None. This is a passive state indicating the patient should be present.

---

### 3.2 waiting -> in_progress

**Trigger:** Doctor clicks "Start Consultation"

**What happens:**
1. Status updated to `in_progress`
2. `started_at` set to `now()`
3. Event emitted: `appointment.status_changed`

**Event payload:**
```json
{
  "appointment_id": "uuid",
  "patient_id": "uuid",
  "old_status": "waiting",
  "new_status": "in_progress",
  "started_at": "2024-01-15T08:05:00Z"
}
```

**Side effects:**
- `started_at` timestamp recorded (used for consultation duration metrics)

---

### 3.3 in_progress -> completed

**Trigger:** Doctor clicks "Finish Consultation"

**What happens:**
1. Status updated to `completed`
2. `completed_at` set to `now()`
3. Event emitted: `appointment.status_changed`
4. **If this is the patient's first completed appointment:** generates `portal_access_code` (see [Section 5](#5-portal-access-code-generation))

**Event payload:**
```json
{
  "appointment_id": "uuid",
  "patient_id": "uuid",
  "old_status": "in_progress",
  "new_status": "completed",
  "completed_at": "2024-01-15T08:35:00Z",
  "duration_minutes": 30,
  "portal_activated": true
}
```

**Side effects:**
- `completed_at` timestamp recorded
- Consultation duration calculated (`completed_at - started_at`)
- Portal access code generated for patient (if first completed appointment)
- Event `patient.portal_activated` emitted (if portal was just activated)

---

### 3.4 scheduled -> cancelled

**Trigger:** Doctor or agent cancels a future appointment

**What happens:**
1. Status updated to `cancelled`
2. `cancellation_reason` set (required)
3. Event emitted: `appointment.status_changed`

**Event payload:**
```json
{
  "appointment_id": "uuid",
  "patient_id": "uuid",
  "old_status": "scheduled",
  "new_status": "cancelled",
  "cancellation_reason": "Patient requested cancellation"
}
```

**Side effects:**
- The cancelled appointment no longer counts toward:
  - Max appointments per phone (booking limit)
  - Slot availability (the slot becomes available again)

---

### 3.5 waiting -> cancelled

**Trigger:** Doctor cancels while the patient is waiting

**What happens:**
1. Status updated to `cancelled`
2. `cancellation_reason` set (required)
3. Event emitted: `appointment.status_changed`

**Event payload:**
```json
{
  "appointment_id": "uuid",
  "patient_id": "uuid",
  "old_status": "waiting",
  "new_status": "cancelled",
  "cancellation_reason": "Doctor emergency - rescheduling needed"
}
```

**Side effects:** Same as scheduled -> cancelled.

---

### 3.6 scheduled -> no_show

**Trigger:** Doctor marks patient as no-show (appointment time passed, patient did not arrive)

**What happens:**
1. Status updated to `no_show`
2. Event emitted: `appointment.status_changed`

**Event payload:**
```json
{
  "appointment_id": "uuid",
  "patient_id": "uuid",
  "old_status": "scheduled",
  "new_status": "no_show"
}
```

**Side effects:**
- The no-show appointment no longer counts toward slot availability
- O agente interno pode usar este evento para enviar uma mensagem de acompanhamento ao paciente

---

### 3.7 waiting -> no_show

**Trigger:** Doctor marks patient as no-show (patient was in waiting but left)

**What happens:**
1. Status updated to `no_show`
2. Event emitted: `appointment.status_changed`

**Event payload:**
```json
{
  "appointment_id": "uuid",
  "patient_id": "uuid",
  "old_status": "waiting",
  "new_status": "no_show"
}
```

**Side effects:** Same as scheduled -> no_show.

---

### 3.8 scheduled -> rescheduled

**Trigger:** Doctor reschedules to a new date/time

**What happens:**
1. Original appointment status updated to `rescheduled`
2. `cancellation_reason` set (optional, e.g., "Rescheduled to 2024-01-20")
3. New appointment created with `status = 'scheduled'`
4. `rescheduled_to_id` on the original appointment points to the new appointment
5. Event emitted: `appointment.status_changed` (for the original)
6. Event emitted: `appointment.created` (for the new one)

**Event payload (original):**
```json
{
  "appointment_id": "uuid-original",
  "patient_id": "uuid",
  "old_status": "scheduled",
  "new_status": "rescheduled",
  "rescheduled_to_id": "uuid-new",
  "new_date_time": "2024-01-20T09:00:00Z"
}
```

**Event payload (new):**
```json
{
  "appointment_id": "uuid-new",
  "patient_id": "uuid",
  "date_time": "2024-01-20T09:00:00Z",
  "source": "rescheduled",
  "rescheduled_from_id": "uuid-original"
}
```

**Side effects:**
- Original slot becomes available
- New slot is occupied
- O agente interno notifica o paciente sobre o reagendamento via `@OnEvent('appointment.status_changed')`

---

## 4. Auto-Transition: Scheduled to Waiting

When the current time passes an appointment's `date_time`, the system automatically transitions its status from `scheduled` to `waiting`.

### Implementation Options

**Option A: Polling (recommended for MVP)**
A periodic task (cron job or `setInterval` in NestJS) runs every minute:

```sql
UPDATE appointments
SET status = 'waiting', updated_at = now()
WHERE status = 'scheduled'
  AND date_time <= now()
RETURNING id, tenant_id, patient_id;
```

For each updated appointment, emit an event:
```sql
INSERT INTO event_log (tenant_id, event_type, payload, actor_type)
VALUES (
  {tenant_id},
  'appointment.status_changed',
  '{"appointment_id":"...","old_status":"scheduled","new_status":"waiting","trigger":"auto"}',
  'system'
);
```

**Database index used:**
```sql
CREATE INDEX idx_appointments_status_datetime ON appointments (status, date_time)
    WHERE status = 'scheduled';
```

This partial index ensures the query is fast even with millions of appointments -- only `scheduled` appointments are indexed.

**Option B: On-read transition**
When fetching today's appointments, the service checks each one:
```typescript
// In appointment.service.ts
async listTodayAppointments(tenantId: string) {
  const appointments = await this.repository.findToday(tenantId);
  for (const appt of appointments) {
    if (appt.status === 'scheduled' && new Date(appt.dateTime) <= new Date()) {
      await this.updateStatus(tenantId, appt.id, { status: 'waiting' });
    }
  }
  return appointments;
}
```

**Frequency:** Every 1 minute (if using polling)

**Actor:** `system` (not doctor or agent)

---

## 5. Portal Access Code Generation

When an appointment transitions to `completed`, the system checks if this is the patient's first completed appointment.

### Steps

1. **Check if patient already has a portal access code**
   ```sql
   SELECT portal_access_code FROM patients
   WHERE id = :patient_id AND tenant_id = :tenant_id
   ```

2. **If `portal_access_code IS NULL`:**

   a. Generate a unique code:
   ```typescript
   // Format: ABC-1234-XYZ (3 letters - 4 digits - 3 letters)
   function generateAccessCode(): string {
     const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O (ambiguous)
     const digits = '0123456789';
     const part1 = Array.from({length: 3}, () => letters[randomInt(letters.length)]).join('');
     const part2 = Array.from({length: 4}, () => digits[randomInt(digits.length)]).join('');
     const part3 = Array.from({length: 3}, () => letters[randomInt(letters.length)]).join('');
     return `${part1}-${part2}-${part3}`;
   }
   ```

   b. Update patient record:
   ```sql
   UPDATE patients
   SET portal_access_code = :code, portal_active = true, updated_at = now()
   WHERE id = :patient_id AND tenant_id = :tenant_id
   ```

   c. Emit event:
   ```sql
   INSERT INTO event_log (tenant_id, event_type, payload, actor_type)
   VALUES (
     :tenant_id,
     'patient.portal_activated',
     '{"patient_id":"...","portal_access_code":"ABC-1234-XYZ"}',
     'system'
   );
   ```

   d. O agente interno recebe o evento `patient.portal_activated` via `EventEmitter2` e envia o codigo ao paciente via WhatsApp:
   ```
   "Ola Joao! Seu portal de paciente foi ativado.
   Acesse: https://app.nocrato.com/patient/access
   Seu codigo: ABC-1234-XYZ
   Com ele voce pode ver seus agendamentos e documentos."
   ```

3. **If `portal_access_code IS NOT NULL`:** No action needed (portal already active).

---

## 6. Who Can Trigger Each Transition

| Transition | Doctor (UI) | Agent (interno) | System (auto) |
|-----------|:-----------:|:---------------:|:-------------:|
| scheduled -> waiting | Yes | No | Yes (auto) |
| waiting -> in_progress | Yes | No | No |
| in_progress -> completed | Yes | No | No |
| scheduled -> cancelled | Yes | Yes | No |
| waiting -> cancelled | Yes | No | No |
| scheduled -> no_show | Yes | No | No |
| waiting -> no_show | Yes | No | No |
| scheduled -> rescheduled | Yes | Yes | No |

### Notes:
- **Doctor (UI):** Via the doctor portal at `PATCH /api/v1/doctor/appointments/:id/status`
- **Agent (interno):** Via chamada direta a `appointmentService.cancel()` dentro do `agent.service.ts` (limitado a cancelamento e reagendamento de consultas futuras)
- **System:** Via the auto-transition cron job (scheduled -> waiting only)
- O agente interno **nao pode** iniciar ou completar consultas -- essas acoes sao exclusivas do doutor
- O agente **pode** cancelar consultas agendadas se o paciente solicitar via WhatsApp

---

## 7. API Endpoint

### Update Appointment Status

```
PATCH /api/v1/doctor/appointments/{id}/status
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "status": "in_progress"
}
```

For cancellation, a reason is required:
```json
{
  "status": "cancelled",
  "cancellationReason": "Patient requested cancellation via phone"
}
```

For rescheduling, the new date/time is required:
```json
{
  "status": "rescheduled",
  "newDateTime": "2024-01-20T09:00:00-03:00",
  "cancellationReason": "Doctor unavailable on original date"
}
```

### Response

Success (200):
```json
{
  "appointment": {
    "id": "uuid",
    "status": "in_progress",
    "startedAt": "2024-01-15T08:05:00Z",
    "updatedAt": "2024-01-15T08:05:00Z"
  }
}
```

For rescheduling, the response includes the new appointment:
```json
{
  "originalAppointment": {
    "id": "uuid-original",
    "status": "rescheduled",
    "rescheduledToId": "uuid-new"
  },
  "newAppointment": {
    "id": "uuid-new",
    "dateTime": "2024-01-20T09:00:00-03:00",
    "status": "scheduled"
  }
}
```

### Error Response

Invalid transition (400):
```json
{
  "error": "Invalid status transition",
  "code": "INVALID_TRANSITION",
  "details": {
    "currentStatus": "completed",
    "requestedStatus": "in_progress",
    "message": "Cannot transition from 'completed' to 'in_progress'"
  }
}
```

---

## 8. Transition Validation Matrix

The `appointment.service.ts` enforces valid transitions using a validation map:

```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled:   ['waiting', 'cancelled', 'no_show', 'rescheduled'],
  waiting:     ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed'],
  completed:   [],  // terminal
  cancelled:   [],  // terminal
  no_show:     [],  // terminal
  rescheduled: [],  // terminal
};
```

### Transition Summary Table

| From \ To | scheduled | waiting | in_progress | completed | cancelled | no_show | rescheduled |
|-----------|:---------:|:-------:|:-----------:|:---------:|:---------:|:-------:|:-----------:|
| **scheduled** | - | Yes | No | No | Yes | Yes | Yes |
| **waiting** | No | - | Yes | No | Yes | Yes | No |
| **in_progress** | No | No | - | Yes | No | No | No |
| **completed** | No | No | No | - | No | No | No |
| **cancelled** | No | No | No | No | - | No | No |
| **no_show** | No | No | No | No | No | - | No |
| **rescheduled** | No | No | No | No | No | No | - |

### Automatic Timestamps

| Transition Target | Field Set |
|------------------|-----------|
| `in_progress` | `started_at = now()` |
| `completed` | `completed_at = now()` |
| All transitions | `updated_at = now()` (via trigger) |

### Events Emitted on Every Transition

Every valid status transition emits an `appointment.status_changed` event to the `event_log` table:

```sql
INSERT INTO event_log (tenant_id, event_type, payload, actor_type, actor_id)
VALUES (
  :tenant_id,
  'appointment.status_changed',
  '{
    "appointment_id": "...",
    "patient_id": "...",
    "old_status": "...",
    "new_status": "...",
    "cancellation_reason": "...",
    "rescheduled_to_id": "..."
  }',
  :actor_type,  -- 'doctor', 'agent', or 'system'
  :actor_id     -- doctor.id, NULL for agent/system
);
```

O agente interno subscreve esses eventos via `EventEmitter2` para reagir em tempo real as acoes manuais do doutor pelo portal.
