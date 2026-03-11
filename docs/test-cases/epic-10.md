# Casos de Teste — Epic 10: Portal do Paciente

> Epic doc: [docs/roadmap/epic-10-patient-portal.md](../roadmap/epic-10-patient-portal.md)
> Gerado em: 2026-03-08

---

## US-10.1 — Gerar código de acesso após primeira consulta

### CT-101-01 — Happy path: primeira consulta concluída ativa o portal

**Categoria:** Happy path

**Given** paciente `João Santos` sem `portal_access_code` (`portal_active = false`) com uma consulta no status `in_progress`
**When** doutor muda status da consulta para `completed` via `PATCH /api/v1/doctor/appointments/:id/status`
**Then** `portal_access_code` é gerado no formato `AAA-9999-AAA`, `portal_active = true` é salvo no banco, e evento `patient.portal_activated` é emitido

**Passos detalhados:**
1. Verificar paciente: `SELECT portal_access_code, portal_active FROM patients WHERE id = :id` → ambos NULL/false
2. `PATCH /api/v1/doctor/appointments/:id/status { "status": "completed" }` com JWT de doutor
3. Verificar banco: `portal_access_code` tem formato `[A-HJ-NP-Z]{3}-\d{4}-[A-HJ-NP-Z]{3}` (sem I/O), `portal_active = true`
4. Verificar event_log: evento `patient.portal_activated` com payload `{ patient_id, patient_name, patient_phone, portal_access_code }`
5. Verificar que agente enviou mensagem WhatsApp com o código

**Resultado atual:** [x] ok  — 2026-03-08

---

### CT-101-02 — Segunda consulta concluída não regenera código

**Categoria:** Edge case

**Given** paciente `João Santos` já com `portal_access_code = 'ABC-1234-XYZ'` e `portal_active = true`, com uma segunda consulta no status `in_progress`
**When** doutor muda status da segunda consulta para `completed`
**Then** `portal_access_code` permanece `'ABC-1234-XYZ'` (sem alteração) e nenhum novo evento `patient.portal_activated` é emitido

**Resultado atual:** [x] ok  — 2026-03-08

---

### CT-101-03 — Consulta cancelada não gera código

**Categoria:** Edge case

**Given** paciente sem portal ativo, com consulta no status `scheduled`
**When** doutor cancela a consulta (`status: "cancelled"`)
**Then** `portal_access_code` permanece NULL e `portal_active` permanece false

**Resultado atual:** [x] ok  — 2026-03-08 (implícito via CT-53-06: cancelamento não acessa patients)

---

### CT-101-04 — Código gerado é globalmente único (não por tenant)

**Categoria:** Segurança

**Given** dois tenants distintos (`dr-silva` e `dra-carvalho`), cada um com um paciente sem portal ativo
**When** ambas as primeiras consultas são concluídas
**Then** os dois `portal_access_code` gerados são diferentes — um código não pode pertencer a pacientes de tenants distintos

**Resultado atual:** [ ] ok  [ ] falhou — requer teste de integração (UNIQUE constraint no banco)

---

### CT-101-05 — Formato do código exclui letras ambíguas (I e O)

**Categoria:** Segurança

**Given** sistema gerando múltiplos códigos de acesso
**When** os códigos são inspecionados
**Then** nenhum código contém as letras `I` ou `O` — apenas letras `A-H, J-N, P-Z` e dígitos `0-9`

**Resultado atual:** [x] ok  — 2026-03-08 (CT-101-03 no spec valida charset sem I/O)

---

## US-10.2 — Acessar portal com código

### CT-102-01 — Happy path: código válido retorna dados do paciente

**Categoria:** Happy path

**Given** paciente `Maria Oliveira` com `portal_access_code = 'MRS-5678-PAC'`, `portal_active = true`, `status = 'active'`, tenant ativo, 2 consultas e 1 documento
**When** `POST /api/v1/patient/portal/access { "code": "MRS-5678-PAC" }` (sem Authorization header)
**Then** HTTP 200 com corpo `{ patient, doctor, tenant, appointments, documents }` — `patient.name = 'Maria Oliveira'`, `appointments` com 2 itens, `documents` com 1 item, campo `clinicalNotes` ausente da resposta

**Resultado atual:** [x] ok  — 2026-03-08

---

### CT-102-02 — Código inexistente retorna 404

**Categoria:** Validação

**Given** nenhum paciente com `portal_access_code = 'XXX-0000-ZZZ'`
**When** `POST /api/v1/patient/portal/access { "code": "XXX-0000-ZZZ" }`
**Then** HTTP 404 com mensagem de erro

**Resultado atual:** [x] ok  — 2026-03-08

---

### CT-102-03 — Portal inativo retorna 403

**Categoria:** Segurança

**Given** paciente com `portal_access_code = 'ABC-1234-XYZ'` mas `portal_active = false` (portal desativado)
**When** `POST /api/v1/patient/portal/access { "code": "ABC-1234-XYZ" }`
**Then** HTTP 403

**Resultado atual:** [x] ok  — 2026-03-08

---

### CT-102-04 — Paciente inativo retorna 403

**Categoria:** Segurança

**Given** paciente com código válido, `portal_active = true`, mas `status = 'inactive'`
**When** `POST /api/v1/patient/portal/access { "code": "..." }`
**Then** HTTP 403

**Resultado atual:** [x] ok  — 2026-03-08

---

### CT-102-05 — Tenant inativo retorna 403

**Categoria:** Segurança

**Given** paciente com código válido, portal ativo, paciente ativo, mas tenant com `status = 'inactive'`
**When** `POST /api/v1/patient/portal/access { "code": "..." }`
**Then** HTTP 403

**Resultado atual:** [x] ok  — 2026-03-08

---

### CT-102-06 — Clinical notes não aparecem na resposta

**Categoria:** Segurança

**Given** paciente com 2 notas clínicas registradas pelo médico
**When** `POST /api/v1/patient/portal/access { "code": "..." }` retorna com sucesso
**Then** resposta contém apenas `{ patient, doctor, tenant, appointments, documents }` — campo `clinicalNotes` ausente

**Resultado atual:** [x] ok  — 2026-03-08

---

### CT-102-07 — Download de documento via proxy com código válido

**Categoria:** Happy path

**Given** documento `receita_2024.pdf` vinculado ao paciente com código `'MRS-5678-PAC'`
**When** `GET /api/v1/patient/portal/documents/:documentId?code=MRS-5678-PAC`
**Then** HTTP 200 com conteúdo do arquivo (Content-Type correto, stream do arquivo)

**Resultado atual:** [x] ok  — 2026-03-08 (unit test verifica res.download chamado com path + filename corretos)

---

### CT-102-08 — Download de documento com código inválido é bloqueado

**Categoria:** Segurança

**Given** documento existente no banco
**When** `GET /api/v1/patient/portal/documents/:documentId?code=INVALID-CODE`
**Then** HTTP 404 ou 403 — arquivo não é servido

**Resultado atual:** [x] ok  — 2026-03-08

---

### CT-102-09 — Documento de outro paciente não é acessível

**Categoria:** Segurança

**Given** paciente A com código válido, paciente B com documento diferente
**When** paciente A usa seu código para baixar o documento de paciente B: `GET /api/v1/patient/portal/documents/:docIdDeB?code=CODIGO_A`
**Then** HTTP 403 ou 404 — paciente A não acessa documentos de B

**Resultado atual:** [x] ok  — 2026-03-08 (getPatientDocument filtra por tenant_id + patient_id)

---

## US-10.3 — [FRONTEND] Portal do paciente

### CT-103-01 — Happy path: paciente digita código e acessa portal

**Categoria:** Happy path

**Given** navegador em `http://localhost:5173/patient/access`, paciente com código `'MRS-5678-PAC'` no banco
**When** paciente digita `MRS-5678-PAC` no campo e clica em "Acessar Portal"
**Then** redireciona para a página do portal exibindo nome do paciente, histórico de consultas e documentos

**Passos detalhados:**
1. Navegar para `/patient/access`
2. Verificar que o campo de código está visível
3. Digitar `MRS-5678-PAC` no campo
4. Clicar em "Acessar Portal"
5. Aguardar carregamento
6. Verificar que exibe o nome do paciente (`Maria Oliveira`)
7. Verificar que a seção de consultas está visível com pelo menos 1 item
8. Verificar que a seção de documentos está visível

**Resultado atual:** [x] ok  — 2026-03-09 (Playwright CT-103-01)

---

### CT-103-02 — Código inválido exibe mensagem de erro na tela

**Categoria:** Validação

**Given** navegador em `http://localhost:5173/patient/access`
**When** paciente digita `ZZZ-0000-ZZZ` (código inexistente) e clica em "Acessar Portal"
**Then** mensagem de erro é exibida na tela (ex: "Código inválido") sem redirecionar para o portal

**Resultado atual:** [x] ok  — 2026-03-09 (Playwright CT-103-02)

---

### CT-103-03 — Portal exibe dados pessoais em modo read-only

**Categoria:** Happy path

**Given** paciente acessou o portal com código válido
**When** seção de dados pessoais é visualizada
**Then** nome, telefone, e-mail e data de nascimento são exibidos sem campos de edição — nenhum botão "Editar" ou input editável

**Resultado atual:** [x] ok  — 2026-03-09 (Playwright CT-103-03)

---

### CT-103-04 — Consultas exibidas em ordem cronológica (futuras primeiro)

**Categoria:** Happy path

**Given** paciente com 3 consultas: 1 futura (scheduled), 1 concluída hoje, 1 concluída há 30 dias
**When** portal é acessado e seção de consultas é visualizada
**Then** consulta futura aparece no topo, seguida pelas concluídas em ordem decrescente de data

**Resultado atual:** [x] ok  — 2026-03-09 (Playwright CT-103-04)

---

### CT-103-05 — Botão de download de documento funciona

**Categoria:** Happy path

**Given** paciente no portal com 1 documento (`receita_2024.pdf`)
**When** clica no botão/link de download do documento
**Then** download do arquivo é iniciado no browser

**Resultado atual:** [x] ok  — 2026-03-09 (Playwright CT-103-05)

---

### CT-103-06 — Portal aplica branding do médico (cor primária e logo)

**Categoria:** Happy path

**Given** tenant com `primary_color = '#D97706'` e `logo_url` definido
**When** paciente acessa o portal com código válido
**Then** a cor primária `#D97706` é aplicada visualmente no portal e o logo do médico é exibido

**Resultado atual:** [x] ok  — 2026-03-09 (Playwright CT-103-06)

---
