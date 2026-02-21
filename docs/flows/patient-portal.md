# Patient Portal

The patient portal provides read-only access to a patient's medical information. It is activated automatically after the patient's first completed appointment and accessed via a unique code delivered through WhatsApp.

---

## Table of Contents

1. [When the Portal Is Created](#1-when-the-portal-is-created)
2. [Access Code Generation and Delivery](#2-access-code-generation-and-delivery)
3. [Portal Access Flow](#3-portal-access-flow)
4. [What the Patient Sees](#4-what-the-patient-sees)
5. [Portal Deactivation](#5-portal-deactivation)
6. [Security Considerations](#6-security-considerations)

---

## 1. When the Portal Is Created

The patient portal is **not** created when the patient record is created. It is activated only when the patient has their **first completed appointment** with the doctor.

### Trigger Condition

```
appointment.status transitions to 'completed'
  AND patient.portal_access_code IS NULL
  AND patient.portal_active = false
```

### Timeline

```
1. Patient created (via booking or manual)
   → portal_access_code = NULL
   → portal_active = false
   → Patient has NO portal access

2. First appointment (scheduled → waiting → in_progress)
   → Still no portal access

3. First appointment marked as 'completed'
   → System generates portal_access_code
   → portal_active = true
   → Event emitted: patient.portal_activated
   → Agente interno envia codigo via WhatsApp (@OnEvent('patient.portal_activated'))

4. Subsequent completed appointments
   → No change to portal (already active)
```

### Why This Design

- Patients are often created by the WhatsApp agent during booking, long before they actually see the doctor
- Giving portal access before the first consultation provides no value (there is nothing to see)
- The first completed appointment guarantees the patient has a real relationship with the doctor
- The access code delivery via WhatsApp is a natural moment in the patient journey

---

## 2. Access Code Generation and Delivery

### Code Format

```
ABC-1234-XYZ
```

- 3 uppercase letters - 4 digits - 3 uppercase letters
- Letters exclude `I` and `O` to avoid ambiguity with `1` and `0`
- Globally unique across all tenants (not just per doctor)
- Stored in `patients.portal_access_code`

### Generation Process

Triggered inside `appointment.service.ts` when a status transition to `completed` occurs:

1. **Check if portal already active**
   ```sql
   SELECT portal_access_code, portal_active
   FROM patients
   WHERE id = :patient_id AND tenant_id = :tenant_id
   ```

2. **If `portal_access_code IS NULL`**, generate and save:
   ```typescript
   const code = generateUniqueAccessCode();
   // Retry loop in case of collision (extremely unlikely)
   ```

3. **Update patient record**
   ```sql
   UPDATE patients
   SET portal_access_code = 'ABC-1234-XYZ',
       portal_active = true,
       updated_at = now()
   WHERE id = :patient_id AND tenant_id = :tenant_id
   ```

4. **Emit event**
   ```sql
   INSERT INTO event_log (tenant_id, event_type, payload, actor_type)
   VALUES (
     :tenant_id,
     'patient.portal_activated',
     '{
       "patient_id": "uuid",
       "patient_name": "Joao Santos",
       "patient_phone": "+5511999999999",
       "portal_access_code": "ABC-1234-XYZ"
     }',
     'system'
   );
   ```

### WhatsApp Delivery

O agente interno recebe o evento `patient.portal_activated` via `EventEmitter2` (zero latencia) e envia uma mensagem WhatsApp:

```
Ola Joao! Sua consulta com Dr. Silva foi concluida.

Seu portal de paciente foi ativado! Nele voce pode ver:
- Seus agendamentos
- Documentos (receitas, atestados, exames)

Acesse: https://app.nocrato.com/patient/access
Seu codigo de acesso: ABC-1234-XYZ

Guarde este codigo. Voce vai precisar dele para acessar o portal.
```

---

## 3. Portal Access Flow

The patient portal does **not** use JWT tokens. Access is stateless, based on the access code.

### Steps

1. **Patient navigates to the portal**
   - URL: `https://app.nocrato.com/patient/access`
   - Frontend route: `routes/patient/access.tsx`

2. **Patient enters their access code**
   - Input field accepts the format: `ABC-1234-XYZ`
   - Frontend may auto-format (add hyphens) as the patient types

3. **Frontend sends access request**
   ```
   POST /api/v1/patient/portal/access
   Content-Type: application/json

   {
     "code": "ABC-1234-XYZ"
   }
   ```

4. **Server validates the code**
   ```sql
   SELECT p.*, t.name as tenant_name, t.slug, t.primary_color, t.logo_url,
          d.name as doctor_name, d.specialty
   FROM patients p
   JOIN tenants t ON t.id = p.tenant_id
   JOIN doctors d ON d.tenant_id = p.tenant_id
   WHERE p.portal_access_code = :code
     AND p.portal_active = true
     AND p.status = 'active'
     AND t.status = 'active'
   ```

   Note: The code is globally unique, so no tenant context is needed for the lookup.

5. **Server returns the patient's data (single response, no session)**
   ```json
   {
     "patient": {
       "id": "uuid",
       "name": "Joao Santos",
       "phone": "+5511999999999",
       "email": "joao@email.com",
       "dateOfBirth": "1990-05-15"
     },
     "doctor": {
       "name": "Dr. Maria Silva",
       "specialty": "Cardiologia"
     },
     "tenant": {
       "name": "Dr. Maria Silva - Cardiologia",
       "primaryColor": "#0066CC",
       "logoUrl": "https://..."
     },
     "appointments": [
       {
         "id": "uuid",
         "dateTime": "2024-01-15T08:00:00-03:00",
         "durationMinutes": 30,
         "status": "completed",
         "completedAt": "2024-01-15T08:35:00Z"
       },
       {
         "id": "uuid",
         "dateTime": "2024-02-10T09:00:00-03:00",
         "durationMinutes": 30,
         "status": "scheduled"
       }
     ],
     "documents": [
       {
         "id": "uuid",
         "type": "prescription",
         "fileName": "receita_2024_01_15.pdf",
         "fileUrl": "/api/v1/patient/portal/documents/uuid",
         "description": "Receita medica - consulta 15/01",
         "createdAt": "2024-01-15T09:00:00Z"
       }
     ]
   }
   ```

6. **Frontend displays the portal**
   - Route: `routes/patient/portal.tsx`
   - Branded with the doctor's primary color and logo
   - All data is read-only

### Error Responses

| Condition | HTTP Status | Response |
|-----------|-------------|----------|
| Code not found | 404 | `{ "error": "Invalid access code" }` |
| Portal inactive (`portal_active = false`) | 403 | `{ "error": "Portal access is not available" }` |
| Patient inactive (`status = 'inactive'`) | 403 | `{ "error": "Portal access has been deactivated" }` |
| Tenant inactive | 403 | `{ "error": "This portal is no longer available" }` |

---

## 4. What the Patient Sees

The portal is entirely **read-only**. The patient cannot edit any information, create appointments, or upload documents.

### Portal Sections

#### 4.1 Personal Information
- Name
- Phone
- Email (if provided)
- Date of birth (if provided)

The patient **cannot** edit these fields. To update personal information, the patient must contact the doctor's office.

#### 4.2 Appointment History

A chronological list of all appointments with the doctor:

| Field | Display |
|-------|---------|
| Date and time | Formatted in the doctor's timezone |
| Duration | In minutes |
| Status | With visual badge (colored) |

Status badges:
- `scheduled` - Blue badge - "Agendada"
- `waiting` - Yellow badge - "Em espera"
- `in_progress` - Orange badge - "Em atendimento"
- `completed` - Green badge - "Concluida"
- `cancelled` - Gray badge - "Cancelada"
- `no_show` - Red badge - "Nao compareceu"
- `rescheduled` - Purple badge - "Reagendada"

The list shows future appointments at the top, past appointments below, sorted by date descending.

#### 4.3 Documents

A list of all documents uploaded by the doctor for this patient:

| Field | Display |
|-------|---------|
| Type | Icon + label (Receita, Atestado, Exame, Outro) |
| File name | Original file name |
| Description | Doctor-provided description (if any) |
| Date | When the document was uploaded |
| Download | Download button/link |

Document download is proxied through the API to avoid exposing internal file URLs:
```
GET /api/v1/patient/portal/documents/{documentId}?code=ABC-1234-XYZ
```

The server validates the access code, verifies the document belongs to the patient, and streams the file.

#### 4.4 Clinical Notes

Clinical notes are **not** shown in the patient portal. They are internal medical records visible only to the doctor. This is a deliberate design decision -- clinical notes may contain sensitive observations not meant for the patient.

### Mobile-First Design

The portal is designed mobile-first since most patients will access it from the WhatsApp link on their phone:
- Single-column layout
- Large touch targets
- Minimal navigation (scrollable single page or simple tabs)
- Doctor branding (color, logo) applied throughout

---

## 5. Portal Deactivation

The portal can be deactivated in two scenarios:

### 5.1 Patient Inactivated by Doctor

When the doctor sets a patient's status to `inactive`:

```
PATCH /api/v1/doctor/patients/{id}
Authorization: Bearer {accessToken}

{
  "status": "inactive"
}
```

**What happens:**
1. `patients.status` set to `'inactive'`
2. `patients.portal_active` set to `false`
3. Event emitted: `patient.updated`

```sql
UPDATE patients
SET status = 'inactive',
    portal_active = false,
    updated_at = now()
WHERE id = :patient_id AND tenant_id = :tenant_id
```

**Effect:** The patient's access code still exists in the database but any attempt to use it will fail because `portal_active = false` and `status = 'inactive'`.

**Reversible:** If the doctor reactivates the patient (`status = 'active'`), the portal can be reactivated with the same access code:
```sql
UPDATE patients
SET status = 'active',
    portal_active = true,
    updated_at = now()
WHERE id = :patient_id AND tenant_id = :tenant_id
```

### 5.2 Tenant Deactivated by Agency

When the agency deactivates a doctor's tenant:

```
PATCH /api/v1/agency/doctors/{id}/status
Authorization: Bearer {accessToken}

{
  "status": "inactive"
}
```

**Effect:** All patients under the tenant lose portal access because the query checks `tenants.status = 'active'`. The patient records themselves are not modified.

**Reversible:** Reactivating the tenant restores all patient portal access.

### 5.3 Access Code Deletion

The access code is **not** deleted when the portal is deactivated. It remains in the database so that:
- If the patient is reactivated, the same code works
- The patient does not need to receive a new code
- Audit trail is preserved

To fully remove a patient's portal access (e.g., data deletion request), the code would be set to NULL:
```sql
UPDATE patients
SET portal_access_code = NULL,
    portal_active = false,
    updated_at = now()
WHERE id = :patient_id
```

This is not a standard MVP operation but may be needed for LGPD compliance in the future.

---

## 6. Security Considerations

### No JWT / No Session

The patient portal is intentionally stateless:
- No JWT token is issued
- No session cookie is set
- Every request includes the access code for validation
- The access code acts as a "bearer credential"

**Rationale:** Patients access the portal infrequently (after appointments). A full auth session adds complexity with no meaningful benefit for read-only access.

### Access Code Entropy

The code format `AAA-9999-AAA` provides:
- 22 possible letters x 3 positions = 10,648 letter combinations (first part)
- 10 possible digits x 4 positions = 10,000 number combinations
- 22 possible letters x 3 positions = 10,648 letter combinations (last part)
- Total: ~1.13 billion possible codes
- Sufficient entropy for the expected patient volume

### Rate Limiting

The portal access endpoint should be rate-limited to prevent brute-force attempts:
- Max 5 attempts per IP per 15 minutes
- After 5 failures, temporarily block the IP

### HTTPS Only

The access code is transmitted in the request body (POST), not in the URL, to avoid:
- Code appearing in browser history
- Code appearing in server access logs
- Code appearing in referrer headers

### Document Access

Documents are not served with direct file URLs. Instead, they are proxied through the API with access code validation:
```
GET /api/v1/patient/portal/documents/{id}?code=ABC-1234-XYZ
```

This ensures:
- Documents cannot be accessed without a valid code
- Internal file storage paths are never exposed
- Access can be revoked by deactivating the portal

### Data Scope

The portal only returns data belonging to the patient within their tenant:
- Only their own appointments
- Only their own documents
- No other patients' data is ever returned
- Clinical notes are excluded entirely
