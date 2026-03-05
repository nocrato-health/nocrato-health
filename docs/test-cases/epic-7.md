# Casos de Teste — Epic 7: Agendamento Público (Booking)

> Epic doc: [docs/roadmap/epic-7-booking.md](../roadmap/epic-7-booking.md)
> Gerado em: 2026-03-05

---

## US-7.1 — Geração de token de booking

### CT-71-01 — Happy path: token gerado com validade de 24h

**Categoria:** Happy path

**Given** tenant ativo (`dr-silva`) com agente configurado
**When** `bookingService.generateToken(tenantId)` é chamado internamente
**Then** retorna `{ token, expiresAt, bookingUrl }` onde `token` tem 64 chars, `expiresAt` é ~24h no futuro e `bookingUrl` contém o slug e o token

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-71-02 — Token vinculado ao telefone do paciente

**Categoria:** Happy path

**Given** tenant ativo com agente configurado
**When** `bookingService.generateToken(tenantId, '+5511987654321')` é chamado com phone
**Then** registro em `booking_tokens` tem `phone = '+5511987654321'` e `used = false`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-71-03 — Token gerado sem vínculo de telefone

**Categoria:** Edge case

**Given** tenant ativo
**When** `bookingService.generateToken(tenantId)` é chamado sem phone
**Then** registro criado com `phone = null` e token válido por 24h

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-71-04 — Token pertence exclusivamente ao tenant gerador

**Categoria:** Isolamento

**Given** dois tenants ativos (`dr-silva` e `dra-carvalho`)
**When** `generateToken` é chamado para `dr-silva`
**Then** `booking_tokens.tenant_id` corresponde ao tenant de `dr-silva` — token não é visível ou utilizável no contexto de `dra-carvalho`

**Resultado atual:** [x] ok  [ ] falhou

---

## US-7.2 — Validação de token e listagem de slots

### CT-72-01 — Happy path: validate retorna dados do médico

**Categoria:** Happy path

**Given** token válido (`used = false`, `expires_at` no futuro) para o tenant `dr-silva`
**When** `GET /api/v1/public/booking/dr-silva/validate?token={token}`
**Then** HTTP 200 com `{ valid: true, doctor: { name, specialty }, tenant: { name, primaryColor, logoUrl } }`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-72-02 — validate com token expirado retorna 403

**Categoria:** Segurança

**Given** token com `expires_at` no passado (ex: criado há 25h)
**When** `GET /api/v1/public/booking/dr-silva/validate?token={token_expirado}`
**Then** HTTP 403 Forbidden com `{ valid: false, reason: "expired" }`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-72-03 — validate com token já utilizado retorna 403

**Categoria:** Segurança

**Given** token com `used = true`
**When** `GET /api/v1/public/booking/dr-silva/validate?token={token_usado}`
**Then** HTTP 403 Forbidden com `{ valid: false }`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-72-04 — validate com token de outro tenant retorna 403

**Categoria:** Segurança

**Given** token válido gerado para tenant `dra-carvalho`
**When** `GET /api/v1/public/booking/dr-silva/validate?token={token_de_dra_carvalho}`
**Then** HTTP 403 Forbidden (slug não corresponde ao tenant do token)

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-72-05 — slots retorna horários disponíveis com ocupados removidos

**Categoria:** Happy path

**Given** Dr. Silva tem `working_hours` com `wednesday: [{ start: "08:00", end: "12:00" }]` e `appointment_duration = 30`; existe appointment às 08:30 com status `scheduled`
**When** `GET /api/v1/public/booking/dr-silva/slots?date=2025-01-15&token={token}`
**Then** resposta inclui `08:00-08:30` mas **não** inclui `08:30-09:00`; formato `{ date, slots, timezone, durationMinutes }`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-72-06 — slots para dia sem expediente retorna array vazio

**Categoria:** Edge case

**Given** Dr. Silva não trabalha aos domingos (`working_hours.sunday` ausente ou vazio)
**When** `GET /api/v1/public/booking/dr-silva/slots?date={proximo_domingo}&token={token}`
**Then** HTTP 200 com `{ slots: [] }`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-72-07 — slots para hoje filtra horários já passados

**Categoria:** Edge case

**Given** data solicitada é hoje, horário atual é 10:00 no timezone do doutor; há slots às 08:00, 08:30, 09:00, 10:00, 10:30
**When** `GET /api/v1/public/booking/dr-silva/slots?date={hoje}&token={token}`
**Then** slots das 08:00, 08:30, 09:00 e 10:00 são omitidos; apenas 10:30 em diante retorna

**Resultado atual:** [x] ok  [ ] falhou

---

## US-7.3 — Booking público via link

### CT-73-01 — Happy path: booking completo com paciente novo

**Categoria:** Happy path

**Given** token válido para `dr-silva`, slot das 09:00 disponível, `phone = '+5511998887766'` não existe no tenant
**When** `POST /api/v1/public/booking/dr-silva/book { token, name: "João Santos", phone: "+5511998887766", dateTime: "...T09:00:00-03:00" }`
**Then** HTTP 201; paciente criado com `source = 'whatsapp_agent'`; appointment criado com `status = scheduled`, `created_by = 'agent'`; token marcado `used = true`; evento `appointment.created` emitido

**Passos detalhados:**
1. Verificar que `booking_tokens.used = false` antes
2. POST /api/v1/public/booking/dr-silva/book com dados válidos
3. Verificar response: `{ appointment.status: "scheduled", patient.name: "João Santos", doctor.name, message }`
4. Verificar que `booking_tokens.used = true` após
5. Verificar que paciente foi inserido com `source = 'whatsapp_agent'`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-73-02 — Booking com paciente já existente reutiliza registro

**Categoria:** Happy path

**Given** paciente com `phone = '+5511912345678'` já existe no tenant `dr-silva`; token válido disponível
**When** `POST /api/v1/public/booking/dr-silva/book { phone: "+5511912345678", ... }`
**Then** nenhum novo paciente é criado; appointment é vinculado ao paciente existente

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-73-03 — Conflito de horário retorna erro

**Categoria:** Edge case

**Given** slot das 10:00 estava disponível no momento do `GET /slots`, mas outro booking criou appointment nesse horário antes de este POST chegar
**When** `POST /api/v1/public/booking/dr-silva/book { dateTime: "...T10:00:00-03:00", ... }`
**Then** HTTP 409 com `{ code: "SLOT_CONFLICT" }`; nenhum appointment criado; token **não** marcado como used

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-73-04 — Limite de 2 consultas ativas por telefone bloqueado

**Categoria:** Edge case

**Given** paciente `phone = '+5511911112222'` já tem 2 appointments com status `scheduled` para `dr-silva`
**When** `POST /api/v1/public/booking/dr-silva/book { phone: "+5511911112222", ... }`
**Then** HTTP 422 com `{ code: "MAX_APPOINTMENTS_REACHED" }`; booking rejeitado

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-73-05 — Token expirado bloqueado no POST

**Categoria:** Segurança

**Given** token com `expires_at` no passado
**When** `POST /api/v1/public/booking/dr-silva/book { token: "{token_expirado}", ... }`
**Then** HTTP 403 Forbidden; nenhum appointment ou paciente criado

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-73-06 — Token já usado não pode ser reutilizado

**Categoria:** Segurança

**Given** token com `used = true`
**When** `POST /api/v1/public/booking/dr-silva/book { token: "{token_usado}", ... }`
**Then** HTTP 403 Forbidden; nenhum appointment criado

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-73-07 — Doutor inativo bloqueia booking

**Categoria:** Edge case

**Given** token válido para `dr-silva`, mas `doctors.status = 'inactive'` ou `tenants.status = 'inactive'`
**When** `POST /api/v1/public/booking/dr-silva/book { ... }`
**Then** HTTP 404 ou HTTP 422 com `{ code: "DOCTOR_UNAVAILABLE" }`

**Resultado atual:** [x] ok  [ ] falhou

---

## US-7.4 — Booking in-chat (chamadas internas)

### CT-74-01 — Happy path: getSlots retorna slots disponíveis

**Categoria:** Happy path

**Given** Dr. Silva com `working_hours` e `appointment_duration = 30`; uma consulta existente às 09:00
**When** `bookingService.getSlots(tenantId, '2025-01-15')` é chamado internamente
**Then** retorna `{ date, slots, timezone, durationMinutes }` com slot das 09:00 removido

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-74-02 — Happy path: bookInChat cria consulta sem token

**Categoria:** Happy path

**Given** slot das 14:00 disponível para `dr-silva`; paciente `'+5511988880000'` não existe no tenant
**When** `bookingService.bookInChat(tenantId, { name: 'Ana Lima', phone: '+5511988880000', dateTime: '...T14:00:00-03:00' })` chamado internamente
**Then** paciente criado com `source = 'whatsapp_agent'`; appointment criado com `status = scheduled`, `created_by = 'agent'`; retorna `{ appointment, patient }`; **nenhum** `booking_token` é criado ou consumido

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-74-03 — bookInChat respeita limite de 2 consultas ativas

**Categoria:** Edge case

**Given** paciente `'+5511933334444'` já tem 2 appointments ativos no tenant
**When** `bookingService.bookInChat(tenantId, { phone: '+5511933334444', ... })` chamado
**Then** exceção lançada com `code: "MAX_APPOINTMENTS_REACHED"`; nenhuma consulta criada

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-74-04 — bookInChat detecta conflito de horário

**Categoria:** Edge case

**Given** appointment existente às 10:00 para o tenant
**When** `bookingService.bookInChat(tenantId, { dateTime: '...T10:00:00-03:00', ... })` chamado
**Then** exceção lançada com `code: "SLOT_CONFLICT"`; nenhuma consulta criada

**Resultado atual:** [x] ok  [ ] falhou

---

## US-7.5 — Página pública de agendamento (Frontend)

### CT-75-01 — Happy path: booking completo no browser

**Categoria:** Happy path

**Given** URL `/book/dr-silva?token={token_valido}`; Dr. Silva tem agenda na data selecionada
**When** usuário navega até a URL, seleciona data, escolhe slot disponível, preenche nome e telefone, confirma
**Then** tela de confirmação exibe nome do doutor, data e horário da consulta; mensagem "Você receberá confirmação no WhatsApp" visível

**Passos detalhados:**
1. Abrir `/book/dr-silva?token={token_valido}` no browser
2. Verificar que nome e especialidade do doutor são exibidos
3. Selecionar uma data com horários disponíveis
4. Clicar em um slot disponível (ex: 09:00)
5. Preencher nome: "Carlos Pereira", telefone: "(11) 91234-5678"
6. Clicar em "Confirmar"
7. Verificar tela de sucesso com dados da consulta

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-75-02 — Token inválido/ausente redireciona para erro

**Categoria:** Segurança

**Given** URL `/book/dr-silva` sem query param `token`
**When** usuário abre a URL no browser
**Then** página de erro é exibida (ex: "Link inválido ou expirado") — não exibe calendário

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-75-03 — Token expirado exibe mensagem adequada

**Categoria:** Segurança

**Given** URL `/book/dr-silva?token={token_expirado}` (expires_at no passado)
**When** usuário abre a URL
**Then** `GET /validate` retorna `{ valid: false, reason: "expired" }`; frontend exibe "Este link expirou. Solicite um novo link pelo WhatsApp." — sem calendário

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-75-04 — Telefone pré-preenchido quando vinculado ao token

**Categoria:** Edge case

**Given** token gerado com `phone = '+5511987654321'` vinculado
**When** usuário abre a página e `GET /validate` retorna os dados do token com phone
**Then** campo de telefone aparece pré-preenchido com `(11) 98765-4321` e está desabilitado (read-only)

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-75-05 — Slot selecionado é removido após outro usuário agendar (race condition UI)

**Categoria:** Edge case

**Given** usuário está na tela de seleção de slots; entre o GET /slots e o POST /book, outro usuário agendou o mesmo horário
**When** usuário clica "Confirmar" com slot das 10:00
**Then** frontend exibe mensagem de erro "Este horário não está mais disponível" — usuário pode selecionar outro slot

**Resultado atual:** [x] ok  [ ] falhou
