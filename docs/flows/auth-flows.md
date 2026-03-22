---
tags: [flow]
type: flow
---

# Authentication Flows

All authentication flows for the Nocrato Health V2 platform. Covers agency members, doctors, password recovery, and token refresh.

---

## Table of Contents

1. [Login Agency Member](#1-login-agency-member)
2. [Invite + Accept Agency Member](#2-invite--accept-agency-member)
3. [Invite + Accept Doctor](#3-invite--accept-doctor)
4. [Login Doctor](#4-login-doctor)
5. [Forgot Password (Agency)](#5-forgot-password-agency)
6. [Forgot Password (Doctor)](#6-forgot-password-doctor)
7. [Refresh Token](#7-refresh-token)
8. [JWT Token Structure](#8-jwt-token-structure)
9. [Auth Domains Summary](#9-auth-domains-summary)

---

## 1. Login Agency Member

Agency members (Nocrato internal staff) authenticate against the `agency_members` table.

### Steps

1. **Client sends credentials**
   ```
   POST /api/v1/agency/auth/login
   Content-Type: application/json

   {
     "email": "admin@nocrato.com",
     "password": "admin123"
   }
   ```

2. **Server looks up `agency_members` by email**
   - Verifies `status = 'active'` (pending or inactive members cannot log in)
   - Compares `password_hash` using bcrypt

3. **Server generates JWT pair**
   - Access token (15 min expiry) with payload: `{ sub: member.id, role: member.role, type: 'agency' }`
   - Refresh token (7 days expiry)

4. **Server updates `last_login_at`**

5. **Server returns response**
   ```json
   {
     "accessToken": "eyJhbGciOi...",
     "refreshToken": "eyJhbGciOi...",
     "member": {
       "id": "uuid",
       "email": "admin@nocrato.com",
       "name": "Admin Nocrato",
       "role": "agency_admin",
       "status": "active"
     }
   }
   ```

### Error Cases
| Condition | HTTP Status | Error |
|-----------|-------------|-------|
| Email not found | 401 | Invalid credentials |
| Wrong password | 401 | Invalid credentials |
| Member status = pending | 401 | Account not activated. Check your invite email |
| Member status = inactive | 401 | Account deactivated. Contact admin |

---

## 2. Invite + Accept Agency Member

An agency admin invites a new collaborator via email. The collaborator accepts and sets their password.

### Steps

1. **Admin sends invite**
   ```
   POST /api/v1/agency/members/invite
   Authorization: Bearer {accessToken}

   {
     "email": "new-member@nocrato.com"
   }
   ```
   - Requires role: `agency_admin`
   - Validates no existing active member with that email
   - Validates no pending invite for that email

2. **Server creates invite record**
   ```sql
   INSERT INTO invites (type, email, invited_by, token, status, expires_at)
   VALUES ('agency_member', 'new-member@nocrato.com', {admin_id}, {random_token}, 'pending', now() + interval '7 days')
   ```

3. **Server creates pending agency member record**
   ```sql
   INSERT INTO agency_members (email, name, role, status)
   VALUES ('new-member@nocrato.com', 'new-member@nocrato.com', 'agency_member', 'pending')
   ```

4. **Server sends invite email via Resend**
   - Template: `invite-member.ts`
   - Link: `https://app.nocrato.com/agency/invite?token={token}`

5. **Collaborator clicks link in email**
   ```
   GET /api/v1/agency/auth/invite/{token}
   ```
   - Server validates: token exists, status = 'pending', not expired
   - Returns invite info (email, type) for UI pre-fill

6. **Collaborator sets password**
   ```
   POST /api/v1/agency/auth/accept-invite
   Content-Type: application/json

   {
     "token": "{token}",
     "password": "securePassword123",
     "name": "Maria Santos"
   }
   ```

7. **Server processes acceptance (in transaction)**
   - Marks invite: `status = 'accepted'`, `accepted_at = now()`
   - Updates agency member: `password_hash = bcrypt(password)`, `name = 'Maria Santos'`, `status = 'active'`

8. **Server generates JWT pair and returns**
   ```json
   {
     "accessToken": "eyJhbGciOi...",
     "refreshToken": "eyJhbGciOi...",
     "member": {
       "id": "uuid",
       "email": "new-member@nocrato.com",
       "name": "Maria Santos",
       "role": "agency_member",
       "status": "active"
     }
   }
   ```

9. **Client redirects to agency dashboard**

### Error Cases
| Condition | HTTP Status | Error |
|-----------|-------------|-------|
| Token not found | 404 | Invite not found |
| Token expired | 410 | Invite expired |
| Token already accepted | 409 | Invite already accepted |
| Email already has active member | 409 | Email already registered |

---

## 3. Invite + Accept Doctor

An agency admin invites a doctor. Accepting the invite creates three records: tenant, doctor, and agent_settings.

### Steps

1. **Admin sends doctor invite**
   ```
   POST /api/v1/agency/doctors/invite
   Authorization: Bearer {accessToken}

   {
     "email": "dr.silva@email.com"
   }
   ```
   - Requires role: `agency_admin` or `agency_member`
   - Validates no existing doctor with that email
   - Validates no pending invite for that email

2. **Server creates invite record**
   ```sql
   INSERT INTO invites (type, email, invited_by, token, status, expires_at)
   VALUES ('doctor', 'dr.silva@email.com', {admin_id}, {random_token}, 'pending', now() + interval '7 days')
   ```

3. **Server sends invite email via Resend**
   - Template: `invite-doctor.ts`
   - Link: `https://app.nocrato.com/doctor/invite?token={token}`

4. **Doctor clicks link in email**
   ```
   GET /api/v1/doctor/auth/invite/{token}
   ```
   - Server validates: token exists, type = 'doctor', status = 'pending', not expired
   - Returns invite info for UI pre-fill

5. **Doctor fills form: name, slug, and password**
   ```
   POST /api/v1/doctor/auth/accept-invite
   Content-Type: application/json

   {
     "token": "{token}",
     "slug": "dr-silva",
     "password": "securePassword123",
     "name": "Dr. Maria Silva"
   }
   ```

6. **Server processes acceptance (in transaction)**

   a. Validates slug uniqueness against `tenants.slug`

   b. Creates tenant:
   ```sql
   INSERT INTO tenants (slug, name, status, invite_id)
   VALUES ('dr-silva', 'Dr. Maria Silva', 'active', {invite_id})
   ```

   c. Creates doctor:
   ```sql
   INSERT INTO doctors (tenant_id, email, password_hash, name, crm, crm_state, onboarding_completed, status)
   VALUES ({tenant_id}, 'dr.silva@email.com', bcrypt('...'), 'Dr. Maria Silva', '', '', false, 'active')
   ```
   Note: `crm` and `crm_state` are empty at this stage; filled during onboarding.

   d. Creates agent_settings with defaults:
   ```sql
   INSERT INTO agent_settings (tenant_id, welcome_message, personality, faq, appointment_rules, enabled)
   VALUES ({tenant_id}, '', '', '', '', true)
   ```

   e. Marks invite: `status = 'accepted'`, `accepted_at = now()`

7. **Server generates JWT pair**
   - Access token payload: `{ sub: doctor.id, role: 'doctor', type: 'doctor', tenantId: tenant.id }`

8. **Server returns response**
   ```json
   {
     "accessToken": "eyJhbGciOi...",
     "refreshToken": "eyJhbGciOi...",
     "doctor": {
       "id": "uuid",
       "email": "dr.silva@email.com",
       "name": "Dr. Maria Silva",
       "onboardingCompleted": false
     },
     "tenant": {
       "id": "uuid",
       "slug": "dr-silva",
       "name": "Dr. Maria Silva",
       "status": "active"
     }
   }
   ```

9. **Client redirects to `/doctor/onboarding`** (because `onboardingCompleted = false`)

### What Gets Created
| Table | Record |
|-------|--------|
| `invites` | Marked as `accepted` |
| `tenants` | New tenant with chosen slug |
| `doctors` | New doctor linked to tenant (CRM blank, onboarding pending) |
| `agent_settings` | Default settings for the WhatsApp agent |

### Error Cases
| Condition | HTTP Status | Error |
|-----------|-------------|-------|
| Token not found | 404 | Invite not found |
| Token expired | 410 | Invite expired |
| Token already accepted | 409 | Invite already accepted |
| Slug already taken | 409 | Slug already in use |
| Slug format invalid | 400 | Slug must be URL-friendly (lowercase, hyphens only) |

---

## 4. Login Doctor

Doctor login uses a two-step flow: first resolve the email to get the slug, then authenticate with password.

### Steps

1. **Doctor enters email**
   ```
   GET /api/v1/doctor/auth/resolve-email/{email}
   ```

2. **Server resolves email**

   a. Looks up `doctors` table by email:
   - If found and active: returns `{ exists: true, slug: "dr-silva" }`
   - If found but inactive: returns `{ exists: false, inactive: true }` with error

   b. If not found in doctors, checks `invites` table:
   - If pending invite exists: returns `{ exists: false, hasPendingInvite: true }`
   - If no invite: returns `{ exists: false }`

3. **Frontend behavior based on response**
   - `exists: true` -> Shows slug (read-only) + password field
   - `hasPendingInvite: true` -> Redirects to invite acceptance page
   - `exists: false` -> Shows "No account found. Contact Nocrato to get started."

4. **Doctor enters password**
   ```
   POST /api/v1/doctor/auth/login
   Content-Type: application/json

   {
     "email": "dr.silva@email.com",
     "password": "securePassword123"
   }
   ```

5. **Server authenticates**
   - Looks up doctor by email
   - Verifies `status = 'active'`
   - Compares password_hash using bcrypt
   - Fetches associated tenant via `tenant_id`

6. **Server generates JWT pair**
   - Access token payload: `{ sub: doctor.id, role: 'doctor', type: 'doctor', tenantId: tenant.id }`

7. **Server updates `last_login_at`**

8. **Server returns response**
   ```json
   {
     "accessToken": "eyJhbGciOi...",
     "refreshToken": "eyJhbGciOi...",
     "doctor": {
       "id": "uuid",
       "email": "dr.silva@email.com",
       "name": "Dr. Maria Silva",
       "onboardingCompleted": true
     },
     "tenant": {
       "id": "uuid",
       "slug": "dr-silva",
       "name": "Dr. Maria Silva",
       "status": "active"
     }
   }
   ```

9. **Client redirects based on `onboardingCompleted`**
   - `true` -> `/doctor` (dashboard)
   - `false` -> `/doctor/onboarding`

### Error Cases
| Condition | HTTP Status | Error |
|-----------|-------------|-------|
| Email not found | 401 | Invalid credentials |
| Wrong password | 401 | Invalid credentials |
| Doctor inactive | 401 | Account deactivated. Contact Nocrato |
| Tenant inactive | 401 | Portal deactivated. Contact Nocrato |

---

## 5. Forgot Password (Agency)

Uses the `invites` table with `type = 'password_reset'` to generate reset tokens.

### Steps

1. **Agency member requests reset**
   ```
   POST /api/v1/agency/auth/forgot-password
   Content-Type: application/json

   {
     "email": "member@nocrato.com"
   }
   ```

2. **Server validates email exists in `agency_members`**
   - If not found: returns 200 anyway (prevents email enumeration)
   - If found: proceeds to step 3

3. **Server creates password reset invite**
   ```sql
   INSERT INTO invites (type, email, invited_by, token, status, expires_at)
   VALUES ('password_reset', 'member@nocrato.com', {member_id}, {random_token}, 'pending', now() + interval '1 hour')
   ```
   Note: `invited_by` is the member themselves. `expires_at` is 1 hour (shorter than regular invites).

4. **Server sends reset email via Resend**
   - Link: `https://app.nocrato.com/agency/reset-password?token={token}`

5. **Server returns 200** (always, regardless of email existence)
   ```json
   {
     "message": "If the email exists, a reset link has been sent."
   }
   ```

6. **Member clicks link in email**
   - Frontend extracts token from URL query param
   - Optionally validates token: `GET /api/v1/agency/auth/invite/{token}`

7. **Member sets new password**
   ```
   POST /api/v1/agency/auth/reset-password
   Content-Type: application/json

   {
     "token": "{token}",
     "newPassword": "newSecurePassword456"
   }
   ```

8. **Server processes reset (in transaction)**
   - Validates token: exists, type = 'password_reset', status = 'pending', not expired
   - Updates `agency_members.password_hash` with new bcrypt hash
   - Marks invite: `status = 'accepted'`, `accepted_at = now()`

9. **Server returns success**
   ```json
   {
     "message": "Password updated successfully."
   }
   ```

10. **Client redirects to agency login page**

---

## 6. Forgot Password (Doctor)

Same flow as agency, but operates on the `doctors` table.

### Steps

1. **Doctor requests reset**
   ```
   POST /api/v1/doctor/auth/forgot-password
   Content-Type: application/json

   {
     "email": "dr.silva@email.com"
   }
   ```

2. **Server validates email exists in `doctors`**
   - If not found: returns 200 anyway (prevents email enumeration)
   - If found: proceeds to step 3

3. **Server creates password reset invite**
   ```sql
   INSERT INTO invites (type, email, invited_by, token, status, expires_at, metadata)
   VALUES ('password_reset', 'dr.silva@email.com', {agency_system_id}, {random_token}, 'pending', now() + interval '1 hour', '{"target": "doctor"}')
   ```
   Note: `metadata.target = 'doctor'` differentiates from agency resets. `invited_by` references a system agency member since doctors cannot self-reference in invites.

4. **Server sends reset email via Resend**
   - Link: `https://app.nocrato.com/doctor/reset-password?token={token}`

5. **Server returns 200** (always)
   ```json
   {
     "message": "If the email exists, a reset link has been sent."
   }
   ```

6. **Doctor clicks link in email**
   - Frontend extracts token from URL query param

7. **Doctor sets new password**
   ```
   POST /api/v1/doctor/auth/reset-password
   Content-Type: application/json

   {
     "token": "{token}",
     "newPassword": "newSecurePassword456"
   }
   ```

8. **Server processes reset (in transaction)**
   - Validates token: exists, type = 'password_reset', status = 'pending', not expired
   - Reads `metadata.target` to determine: update `doctors.password_hash`
   - Marks invite: `status = 'accepted'`, `accepted_at = now()`

9. **Server returns success**
   ```json
   {
     "message": "Password updated successfully."
   }
   ```

10. **Client redirects to doctor login page**

---

## 7. Refresh Token

Stateless JWT refresh. No refresh tokens stored in the database.

### Steps

1. **Client detects access token expired** (401 response or local expiry check)

2. **Client sends refresh request**
   ```
   POST /api/v1/auth/refresh
   Content-Type: application/json

   {
     "refreshToken": "eyJhbGciOi..."
   }
   ```
   Note: This endpoint works for both agency members and doctors. The `type` field in the refresh token payload determines which table to query.

3. **Server validates refresh token**
   - Verifies JWT signature
   - Checks expiry (7 days)
   - Extracts payload: `{ sub, type, role, tenantId? }`

4. **Server looks up user**
   - If `type = 'agency'`: queries `agency_members` by `sub`
   - If `type = 'doctor'`: queries `doctors` by `sub`
   - Verifies user still exists and `status = 'active'`

5. **Server generates new JWT pair**
   - New access token (15 min)
   - New refresh token (7 days from now)

6. **Server returns response**
   ```json
   {
     "accessToken": "eyJhbGciOi...(new)",
     "refreshToken": "eyJhbGciOi...(new)"
   }
   ```

### Error Cases
| Condition | HTTP Status | Error |
|-----------|-------------|-------|
| Invalid/malformed token | 401 | Invalid refresh token |
| Token expired | 401 | Refresh token expired |
| User not found (deleted) | 401 | User no longer exists |
| User deactivated | 401 | Account deactivated |

### Frontend Implementation Notes
- The `api-client.ts` wrapper intercepts 401 responses
- Automatically attempts refresh using stored refresh token
- If refresh succeeds: retries the original request with new access token
- If refresh fails: clears tokens, redirects to login

---

## 8. JWT Token Structure

### Access Token (15 min expiry)

**Agency member:**
```json
{
  "sub": "agency_member_uuid",
  "type": "agency",
  "role": "agency_admin",
  "iat": 1700000000,
  "exp": 1700000900
}
```

**Doctor:**
```json
{
  "sub": "doctor_uuid",
  "type": "doctor",
  "role": "doctor",
  "tenantId": "tenant_uuid",
  "iat": 1700000000,
  "exp": 1700000900
}
```

### Refresh Token (7 days expiry)
Same structure as access token but with longer expiry. No additional claims.

### Guards and Decorators

| Guard/Decorator | Purpose | Usage |
|----------------|---------|-------|
| `@UseGuards(JwtAuthGuard)` | Validates JWT signature and expiry | All protected routes |
| `@UseGuards(RolesGuard)` | Checks `role` claim against `@Roles()` | Role-restricted routes |
| `@UseGuards(TenantGuard)` | Validates `tenantId` present in token | Doctor-side routes |
| `@Roles('agency_admin')` | Declares required role | Decorator on controller/method |
| `@CurrentUser()` | Extracts full user from request | Parameter decorator |
| `@TenantId()` | Extracts `tenantId` from JWT | Parameter decorator (doctor routes) |

---

## 9. Auth Domains Summary

The system has two completely separate authentication domains:

| Aspect | Agency Members | Doctors |
|--------|---------------|---------|
| Table | `agency_members` | `doctors` |
| Login endpoint | `/api/v1/agency/auth/login` | `/api/v1/doctor/auth/login` |
| JWT type claim | `"agency"` | `"doctor"` |
| JWT roles | `agency_admin`, `agency_member` | `doctor` |
| JWT tenantId | Not present | Present |
| Invite type | `agency_member` | `doctor` |
| Password reset | `/api/v1/agency/auth/*` | `/api/v1/doctor/auth/*` |
| Frontend routes | `/agency/*` | `/doctor/*` |
| Created by | Invite from admin | Invite from admin |
| Side effects on creation | Agency member record only | Tenant + Doctor + Agent Settings |

### Key Design Decision
Agency members and doctors are intentionally separate auth domains. They do not share a `users` table. This separation:
- Prevents role confusion between Nocrato staff and medical professionals
- Allows different JWT claims (tenantId only for doctors)
- Enables independent auth flows (doctors have slug resolution, agency does not)
- Keeps the codebase clear about which user type is acting