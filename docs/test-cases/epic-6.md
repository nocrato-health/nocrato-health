# Casos de Teste — Epic 6: Notas Clínicas & Documentos

> Epic doc: [docs/roadmap/epic-6-clinical.md](../roadmap/epic-6-clinical.md)
> Gerado em: 2026-03-02

---

## US-6.1 — Criar nota clínica durante/após atendimento

### CT-61-01 — Happy path: criar nota vinculada a consulta

**Categoria:** Happy path

**Given** doutor autenticado (`test-done@nocrato.com`), consulta `in_progress` com `appointmentId` válido do tenant, paciente `patientId` válido do mesmo tenant
**When** POST `/api/v1/doctor/clinical-notes` `{ appointmentId, patientId, content: "Paciente relata dor lombar há 3 dias. Prescrito ibuprofeno 600mg." }`
**Then** HTTP 201 com `{ id, appointmentId, patientId, content, createdAt }` e evento `note.created` registrado em `event_log`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-61-02 — Isolamento de tenant: não cria nota em consulta de outro tenant

**Categoria:** Isolamento

**Given** dois doutores em tenants distintos: `dr-silva` e `dra-carvalho`, cada um com consultas próprias
**When** `dr-silva` envia POST `/api/v1/doctor/clinical-notes` com `appointmentId` pertencente à `dra-carvalho`
**Then** HTTP 404 (`Consulta não encontrada`) — a nota não é criada e nenhum dado do tenant alheio é exposto

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-61-03 — Acesso negado sem token

**Categoria:** Acesso negado

**Given** nenhum token de autenticação
**When** POST `/api/v1/doctor/clinical-notes` sem header `Authorization`
**Then** HTTP 401 Unauthorized

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-61-04 — Validação: content em branco é rejeitado

**Categoria:** Validação

**Given** doutor autenticado com `appointmentId` e `patientId` válidos
**When** POST `/api/v1/doctor/clinical-notes` `{ appointmentId, patientId, content: "" }`
**Then** HTTP 400 Bad Request com erro de validação indicando campo obrigatório

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-61-05 — Edge case: patientId não pertence ao tenant

**Categoria:** Edge case

**Given** doutor autenticado; `patientId` de outro tenant passado no body
**When** POST `/api/v1/doctor/clinical-notes` com `patientId` inválido para o tenant
**Then** HTTP 404 (`Paciente não encontrado`) — nota não é criada

**Resultado atual:** [x] ok  [ ] falhou

---

## US-6.2 — Ver notas de um paciente ou consulta

### CT-62-01 — Happy path: listar notas por appointmentId

**Categoria:** Happy path

**Given** doutor autenticado, consulta com 2 notas clínicas registradas
**When** GET `/api/v1/doctor/clinical-notes?appointmentId={id}`
**Then** HTTP 200 com array de notas `[{ id, content, createdAt, ... }]` da consulta, em ordem decrescente de `created_at`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-62-02 — Happy path: listar notas por patientId com paginação

**Categoria:** Happy path

**Given** doutor autenticado, paciente `Fernanda Oliveira` com 5 notas em consultas diferentes
**When** GET `/api/v1/doctor/clinical-notes?patientId={id}&page=1&limit=3`
**Then** HTTP 200 com `{ data: [3 notas], pagination: { page: 1, limit: 3, total: 5, totalPages: 2 } }`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-62-03 — Isolamento: não retorna notas de outro tenant

**Categoria:** Isolamento

**Given** dois doutores em tenants distintos, cada um com notas para seus pacientes
**When** `dr-silva` faz GET `/api/v1/doctor/clinical-notes?patientId={id de paciente de dra-carvalho}`
**Then** HTTP 200 com `data: []` — nenhuma nota exposta de tenant alheio

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-62-04 — Acesso negado sem token

**Categoria:** Acesso negado

**Given** nenhum token de autenticação
**When** GET `/api/v1/doctor/clinical-notes?appointmentId=qualquer-id` sem `Authorization`
**Then** HTTP 401 Unauthorized

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-62-05 — Edge case: consulta sem notas retorna lista vazia

**Categoria:** Edge case

**Given** doutor autenticado, consulta `scheduled` recém-criada sem notas
**When** GET `/api/v1/doctor/clinical-notes?appointmentId={id}`
**Then** HTTP 200 com `{ data: [], pagination: { total: 0 } }`

**Resultado atual:** [x] ok  [ ] falhou

---

## US-6.3 — Upload de documento para paciente

### CT-63-01 — Happy path: upload de arquivo + registro de documento

**Categoria:** Happy path

**Given** doutor autenticado, arquivo PDF válido (`receita.pdf`, 120 KB)
**When** POST `/api/v1/doctor/upload` (multipart) com o arquivo; em seguida POST `/api/v1/doctor/documents` `{ patientId, type: "prescription", fileUrl, fileName, description: "Receita ibuprofeno" }`
**Then** upload retorna HTTP 201 `{ fileUrl, fileName }`; registro retorna HTTP 201 `{ id, patientId, type, fileUrl, fileName, description, createdAt }`; arquivo salvo em `./uploads/{tenantId}/`

**Passos detalhados:**
1. POST `/api/v1/doctor/upload` com `Content-Type: multipart/form-data`, campo `file` com `receita.pdf`
2. Verificar resposta: `{ fileUrl: "/uploads/{tenantId}/receita.pdf", fileName: "receita.pdf" }`
3. POST `/api/v1/doctor/documents` `{ patientId: "{id}", type: "prescription", fileUrl, fileName, description: "Receita ibuprofeno" }`
4. Verificar HTTP 201 com documento registrado no banco

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-63-02 — Isolamento: arquivo salvo no diretório do tenant correto

**Categoria:** Isolamento

**Given** dois doutores autenticados em tenants distintos (`dr-silva`, `dra-carvalho`)
**When** `dr-silva` faz upload de `laudo.pdf`
**Then** arquivo salvo em `./uploads/{tenantId-de-dr-silva}/laudo.pdf` — diretório de `dra-carvalho` não é acessado

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-63-03 — Acesso negado sem token

**Categoria:** Acesso negado

**Given** nenhum token de autenticação
**When** POST `/api/v1/doctor/upload` sem `Authorization`
**Then** HTTP 401 Unauthorized

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-63-04 — Validação: type inválido é rejeitado

**Categoria:** Validação

**Given** doutor autenticado, arquivo já upado, `fileUrl` válida
**When** POST `/api/v1/doctor/documents` `{ patientId, type: "invoice", fileUrl, fileName }`
**Then** HTTP 400 Bad Request com erro indicando valores aceitos: `prescription | certificate | exam | other`

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-63-05 — Edge case: documento sem consulta vinculada (appointmentId opcional)

**Categoria:** Edge case

**Given** doutor autenticado, paciente existente sem consulta recente
**When** POST `/api/v1/doctor/documents` `{ patientId, type: "exam", fileUrl, fileName }` sem `appointmentId`
**Then** HTTP 201 com `{ id, appointmentId: null, type: "exam", ... }` — documento registrado sem vínculo de consulta

**Resultado atual:** [ ] ok  [ ] falhou

---

## US-6.4 — Listar documentos de um paciente

### CT-64-01 — Happy path: listar todos os documentos de um paciente

**Categoria:** Happy path

**Given** doutor autenticado, paciente `Carlos Mendes` com 3 documentos (2 prescrições, 1 exame)
**When** GET `/api/v1/doctor/documents?patientId={id}&page=1`
**Then** HTTP 200 com `{ data: [3 documentos], pagination: { total: 3 } }` com campos `id, type, fileName, fileUrl, description, createdAt`

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-64-02 — Happy path: filtrar documentos por tipo

**Categoria:** Happy path

**Given** paciente com documentos de tipos variados (2 `prescription`, 1 `exam`, 1 `other`)
**When** GET `/api/v1/doctor/documents?patientId={id}&type=prescription`
**Then** HTTP 200 com apenas os 2 documentos do tipo `prescription` — outros tipos não aparecem

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-64-03 — Isolamento: não retorna documentos de outro tenant

**Categoria:** Isolamento

**Given** dois tenants com pacientes e documentos próprios
**When** `dr-silva` faz GET `/api/v1/doctor/documents?patientId={id de paciente de dra-carvalho}`
**Then** HTTP 200 com `data: []` — nenhum documento de tenant alheio exposto

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-64-04 — Acesso negado sem token

**Categoria:** Acesso negado

**Given** nenhum token de autenticação
**When** GET `/api/v1/doctor/documents?patientId=qualquer-id` sem `Authorization`
**Then** HTTP 401 Unauthorized

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-64-05 — Edge case: paciente sem documentos retorna lista vazia

**Categoria:** Edge case

**Given** doutor autenticado, paciente ativo sem nenhum documento registrado
**When** GET `/api/v1/doctor/documents?patientId={id}`
**Then** HTTP 200 com `{ data: [], pagination: { total: 0 } }`

**Resultado atual:** [ ] ok  [ ] falhou

---

## US-6.5 — Frontend: notas e documentos

### CT-65-01 — Happy path: criar nota clínica a partir do detalhe da consulta

**Categoria:** Happy path

**Given** doutor autenticado (`test-done@nocrato.com`), na página `/doctor/appointments/{id}` de uma consulta `in_progress` ou `completed`
**When** usuário clica em "Adicionar nota", preenche o campo de texto e clica em "Salvar"
**Then** nota aparece na seção "Notas Clínicas" da página, sem recarregar a página; toast de confirmação exibido

**Passos detalhados:**
1. Navegar para `/doctor/appointments/{id}` (consulta in_progress)
2. Localizar seção "Notas Clínicas" → botão "Adicionar nota"
3. Clicar no botão → campo de texto aparece (textarea ou dialog)
4. Digitar "Paciente apresentou melhora significativa."
5. Clicar "Salvar"
6. Verificar nota listada na seção "Notas Clínicas"
7. Verificar toast de sucesso

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-65-02 — Happy path: ver notas na tab "Notas" do perfil do paciente

**Categoria:** Happy path

**Given** doutor autenticado, paciente com ao menos 2 notas clínicas registradas
**When** usuário navega para `/doctor/patients/{id}` e clica na tab "Notas"
**Then** lista de notas exibida em ordem decrescente de data, com conteúdo e data de cada nota; nenhuma nota de outro paciente aparece

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-65-03 — Happy path: upload de documento e visualização na tab "Documentos"

**Categoria:** Happy path

**Given** doutor autenticado, na página de perfil do paciente `Fernanda Oliveira`
**When** usuário clica na tab "Documentos", em "Upload", seleciona arquivo `exame.pdf`, escolhe tipo "Exame" e confirma
**Then** documento aparece na lista da tab "Documentos" com nome, tipo e data; toast de confirmação exibido

**Passos detalhados:**
1. Navegar para `/doctor/patients/{id}`
2. Clicar na tab "Documentos"
3. Clicar botão "Upload"
4. Dialog de upload abre com campos: arquivo, tipo, descrição (opcional)
5. Selecionar `exame.pdf`, tipo "Exame", descrição "Hemograma completo"
6. Clicar "Enviar"
7. Verificar documento listado: nome "exame.pdf", tipo "Exame", data de hoje
8. Verificar toast de sucesso

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-65-04 — Edge case: estados vazios com CTA visível

**Categoria:** Edge case

**Given** doutor autenticado, paciente sem notas e sem documentos
**When** usuário abre perfil do paciente e alterna entre tab "Notas" e tab "Documentos"
**Then** ambas exibem empty state com mensagem explicativa e botão de ação ("Adicionar nota" / "Upload"); nenhum erro de carregamento

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-65-05 — Edge case: filtro por tipo de documento funciona no frontend

**Categoria:** Edge case

**Given** doutor autenticado, paciente com documentos de tipos variados (prescrição, exame)
**When** usuário seleciona filtro "Prescrição" na tab "Documentos"
**Then** apenas documentos do tipo prescrição são exibidos; ao limpar filtro, todos voltam a aparecer

**Resultado atual:** [ ] ok  [ ] falhou
