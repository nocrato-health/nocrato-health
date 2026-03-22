---
tags: [roadmap, v1, test-cases]
type: test-cases
---

# Casos de Teste — Epic 4: Gestão de Pacientes

> Epic doc: [docs/roadmap/epic-4-patients.md](../roadmap/epic-4-patients.md)
> Gerado em: 2026-03-01

---

## US-4.1 — Listagem paginada de pacientes

### CT-41-01 — Happy path: lista paginada retorna dados corretos

**Categoria:** Happy path

**Given** doutor autenticado com 3 pacientes cadastrados no seu tenant
**When** GET /api/v1/doctor/patients?page=1&limit=10
**Then** HTTP 200, `data` com 3 pacientes, `pagination.total = 3`, `pagination.totalPages = 1`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-41-02 — Acesso sem token retorna 401

**Categoria:** Acesso negado

**Given** nenhum token de autenticação presente
**When** GET /api/v1/doctor/patients sem header Authorization
**Then** HTTP 401 Unauthorized

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-41-03 — Doutor não vê pacientes de outro tenant

**Categoria:** Isolamento

**Given** Dr. Silva (tenant A) com 5 pacientes; Dra. Carvalho (tenant B) com 3 pacientes
**When** Dr. Silva autenticado faz GET /api/v1/doctor/patients
**Then** HTTP 200 com `pagination.total = 5` — pacientes de Dra. Carvalho não aparecem

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-41-04 — Busca por nome parcial retorna correspondências (case-insensitive)

**Categoria:** Happy path

**Given** doutor com pacientes: "Maria Silva", "João Santos", "Mariana Costa"
**When** GET /api/v1/doctor/patients?search=maria
**Then** HTTP 200 com `data` contendo "Maria Silva" e "Mariana Costa" — "João Santos" não aparece

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-41-05 — Filtro por status=inactive retorna apenas inativos

**Categoria:** Happy path

**Given** doutor com 4 pacientes: 3 `active`, 1 `inactive`
**When** GET /api/v1/doctor/patients?status=inactive
**Then** HTTP 200 com `data` contendo 1 paciente, `pagination.total = 1`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-41-06 — Busca com caracteres especiais não quebra a query

**Categoria:** Segurança

**Given** doutor autenticado com pacientes cadastrados
**When** GET /api/v1/doctor/patients?search=100%25 (percentual codificado como %25)
**Then** HTTP 200 com lista vazia (sem erro 500) — LIKE escapado corretamente

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-41-07 — cpf e portal_access_code nunca aparecem na resposta

**Categoria:** Segurança

**Given** paciente com `cpf = "123.456.789-00"` e `portal_access_code = "ABC-1234-XYZ"` no banco
**When** GET /api/v1/doctor/patients
**Then** HTTP 200 e nenhum objeto em `data` contém os campos `cpf` ou `portal_access_code`

**Resultado atual:** [x] ok  [ ] falhou

---

## US-4.2 — Perfil completo do paciente

### CT-42-01 — Happy path: perfil completo com todos os dados

**Categoria:** Happy path

**Given** paciente "Ana Pereira" com 2 appointments, 1 nota clínica e 1 documento no tenant do doutor autenticado
**When** GET /api/v1/doctor/patients/:id (id válido da Ana)
**Then** HTTP 200 com `{ patient: { name: "Ana Pereira", portal_active: ... }, appointments: [2 itens], clinicalNotes: [1 item], documents: [1 item] }`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-42-02 — Acesso sem token retorna 401

**Categoria:** Acesso negado

**Given** nenhum token de autenticação presente
**When** GET /api/v1/doctor/patients/:id sem header Authorization
**Then** HTTP 401 Unauthorized

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-42-03 — Doutor não acessa paciente de outro tenant (404, sem vazar existência)

**Categoria:** Isolamento

**Given** paciente "Carlos Mendes" pertence ao tenant de Dra. Carvalho; Dr. Silva está autenticado
**When** Dr. Silva faz GET /api/v1/doctor/patients/{id_do_carlos}
**Then** HTTP 404 — mesmo comportamento de paciente inexistente (não vaza que o registro existe)

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-42-04 — UUID inválido no path retorna 400

**Categoria:** Validação

**Given** doutor autenticado
**When** GET /api/v1/doctor/patients/nao-e-um-uuid
**Then** HTTP 400 Bad Request — ZodValidationPipe rejeita antes de chegar ao service

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-42-05 — Perfil com histórico vazio retorna arrays vazios

**Categoria:** Edge case

**Given** paciente "Bruno Lima" sem nenhum appointment, nota clínica ou documento
**When** GET /api/v1/doctor/patients/:id
**Then** HTTP 200 com `appointments: []`, `clinicalNotes: []`, `documents: []`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-42-06 — Appointments retornados em ordem decrescente por data

**Categoria:** Edge case

**Given** paciente com appointments em: 2025-01-10, 2025-03-15, 2024-12-01
**When** GET /api/v1/doctor/patients/:id
**Then** appointments ordenados: 2025-03-15 → 2025-01-10 → 2024-12-01

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-42-07 — cpf e portal_access_code nunca aparecem no perfil

**Categoria:** Segurança

**Given** paciente com `cpf` e `portal_access_code` preenchidos no banco
**When** GET /api/v1/doctor/patients/:id
**Then** objeto `patient` na resposta não contém os campos `cpf` nem `portal_access_code`

**Resultado atual:** [x] ok  [ ] falhou

---

## US-4.3 — Criar paciente manualmente

### CT-43-01 — Happy path: criar paciente com campos obrigatórios

**Categoria:** Happy path

**Given** doutor autenticado, sem paciente com phone `(11) 98765-4321` no seu tenant
**When** POST /api/v1/doctor/patients `{ "name": "Fernanda Oliveira", "phone": "(11) 98765-4321" }`
**Then** HTTP 201 com `{ id, name: "Fernanda Oliveira", phone: "(11) 98765-4321", source: "manual", status: "active" }` e paciente gravado com `tenant_id` correto

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-43-02 — Acesso sem token retorna 401

**Categoria:** Acesso negado

**Given** nenhum token de autenticação presente
**When** POST /api/v1/doctor/patients sem header Authorization
**Then** HTTP 401 Unauthorized

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-43-03 — Phone duplicado no mesmo tenant retorna 409

**Categoria:** Validação

**Given** paciente com phone `(11) 91111-2222` já existe no tenant do Dr. Silva
**When** POST /api/v1/doctor/patients `{ "name": "Outro Nome", "phone": "(11) 91111-2222" }`
**Then** HTTP 409 Conflict — phone único por tenant enforced

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-43-04 — Phone duplicado em tenant diferente é aceito

**Categoria:** Isolamento

**Given** Dra. Carvalho tem paciente com phone `(11) 93333-4444`; Dr. Silva não tem
**When** Dr. Silva faz POST /api/v1/doctor/patients `{ "name": "Pedro Alves", "phone": "(11) 93333-4444" }`
**Then** HTTP 201 — phone é único por tenant, não globalmente

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-43-05 — source sempre gravado como 'manual'

**Categoria:** Edge case

**Given** doutor autenticado
**When** POST /api/v1/doctor/patients com body incluindo `"source": "whatsapp_agent"`
**Then** HTTP 201 e paciente criado com `source = "manual"` (campo ignorado ou não aceito no DTO)

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-43-06 — Campos opcionais ausentes são aceitos

**Categoria:** Validação

**Given** doutor autenticado
**When** POST /api/v1/doctor/patients `{ "name": "Ricardo Nunes", "phone": "(21) 97777-8888" }` (sem cpf, email, dateOfBirth)
**Then** HTTP 201 — paciente criado com esses campos como null no banco

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-43-07 — Body vazio retorna 400

**Categoria:** Validação

**Given** doutor autenticado
**When** POST /api/v1/doctor/patients `{}` (body vazio)
**Then** HTTP 400 Bad Request — campos obrigatórios não enviados

**Resultado atual:** [x] ok  [ ] falhou

---

## US-4.4 — Editar dados de um paciente

### CT-44-01 — Happy path: atualizar nome e email do paciente

**Categoria:** Happy path

**Given** paciente "Juliana Costa" cadastrado no tenant do doutor autenticado
**When** PATCH /api/v1/doctor/patients/:id `{ "name": "Juliana Costa Souza", "email": "juliana@email.com" }`
**Then** HTTP 200 com paciente atualizado; `name` e `email` alterados, demais campos intactos

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-44-02 — Acesso sem token retorna 401

**Categoria:** Acesso negado

**Given** nenhum token de autenticação presente
**When** PATCH /api/v1/doctor/patients/:id sem header Authorization
**Then** HTTP 401 Unauthorized

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-44-03 — Editar paciente de outro tenant retorna 404

**Categoria:** Isolamento

**Given** paciente pertence ao tenant de Dra. Carvalho; Dr. Silva está autenticado
**When** Dr. Silva faz PATCH /api/v1/doctor/patients/{id_do_paciente_dela} `{ "name": "Novo Nome" }`
**Then** HTTP 404 — dados de Dra. Carvalho não alterados

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-44-04 — Phone duplicado no mesmo tenant retorna 409

**Categoria:** Validação

**Given** paciente A com phone `(11) 95555-6666`; paciente B com phone `(11) 97777-8888` — ambos no mesmo tenant
**When** PATCH /api/v1/doctor/patients/{id_B} `{ "phone": "(11) 95555-6666" }`
**Then** HTTP 409 Conflict — phone já em uso por outro paciente do tenant

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-44-05 — Status inactive desativa o paciente

**Categoria:** Happy path

**Given** paciente com `status = "active"`
**When** PATCH /api/v1/doctor/patients/:id `{ "status": "inactive" }`
**Then** HTTP 200 com `status: "inactive"` e paciente não aparece em buscas com `status=active`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-44-06 — Patch parcial não altera campos omitidos

**Categoria:** Edge case

**Given** paciente com `name = "Marcos Vinicius"`, `email = "marcos@email.com"`, `status = "active"`
**When** PATCH /api/v1/doctor/patients/:id `{ "email": "novo@email.com" }` (só email)
**Then** HTTP 200 com `name = "Marcos Vinicius"` e `status = "active"` intactos

**Resultado atual:** [x] ok  [ ] falhou

---

## US-4.5 — Frontend: páginas de pacientes

### CT-45-01 — Happy path: lista de pacientes carrega com cards

**Categoria:** Happy path

**Given** doutor autenticado com onboarding concluído, com 3 pacientes cadastrados
**When** navegar para `/doctor/patients`
**Then** 3 cards visíveis com nome, telefone e status de cada paciente; paginação exibida se necessário

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-45-02 — Busca por nome filtra resultados

**Categoria:** Happy path

**Given** lista com pacientes "Ana Lima", "João Costa", "Ana Souza"
**When** digitar "ana" no campo de busca
**Then** apenas "Ana Lima" e "Ana Souza" aparecem; "João Costa" some da lista

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-45-03 — Filtro por status=inactive mostra apenas inativos

**Categoria:** Happy path

**Given** lista com 3 pacientes active, 1 inactive
**When** selecionar filtro "Inativo" no seletor de status
**Then** apenas o paciente inactive é exibido

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-45-04 — Clicar em paciente abre perfil com tabs

**Categoria:** Happy path

**Given** lista de pacientes carregada
**When** clicar no card de "Fernanda Oliveira"
**Then** navegar para `/doctor/patients/{id}` com tabs: Info, Consultas, Notas, Documentos visíveis

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-45-05 — Tab Consultas exibe appointments em ordem decrescente

**Categoria:** Happy path

**Given** perfil de paciente com 3 appointments em datas distintas
**When** clicar na tab "Consultas"
**Then** appointments listados da mais recente para a mais antiga

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-45-06 — Sessão expirada redireciona para login

**Categoria:** Acesso negado

**Given** sessão expirada (token ausente ou inválido)
**When** tentar acessar `/doctor/patients` diretamente pela URL
**Then** redirecionar para `/doctor/login`

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-45-07 — Criar paciente via formulário e ver na lista

**Categoria:** Happy path

**Given** doutor autenticado na página de pacientes, sem paciente "Gustavo Ramos"
**When** clicar em "Novo paciente", preencher nome e telefone `(31) 99999-0000`, confirmar
**Then** paciente "Gustavo Ramos" aparece na lista; toast de sucesso exibido

**Resultado atual:** [x] ok  [ ] falhou