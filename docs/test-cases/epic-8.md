# Casos de Teste — Epic 8: Configuracoes & Agente

> Epic doc: [docs/roadmap/epic-8-settings.md](../roadmap/epic-8-settings.md)
> Gerado em: 2026-03-07

---

## US-8.1 — Editar Configuracoes do Agente

### CT-81-01 — Happy path: GET retorna configuracoes atuais do agente

**Categoria:** Happy path

**Given** doutor autenticado com agent_settings ja criado (enabled=false, booking_mode='both')
**When** GET /api/v1/doctor/agent-settings com Authorization: Bearer {token}
**Then** HTTP 200 com { welcomeMessage, personality, faq, appointmentRules, bookingMode: 'both', enabled: false }

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-81-02 — Happy path: PATCH atualiza configuracoes parcialmente

**Categoria:** Happy path

**Given** doutor autenticado com agent_settings existente
**When** PATCH /api/v1/doctor/agent-settings { "welcomeMessage": "Ola! Sou o assistente da Dra. Carla.", "bookingMode": "link", "enabled": true }
**Then** HTTP 200 com as configuracoes atualizadas; campos nao enviados permanecem inalterados

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-81-03 — bookingMode invalido retorna 422

**Categoria:** Validacao

**Given** doutor autenticado
**When** PATCH /api/v1/doctor/agent-settings { "bookingMode": "offline" }
**Then** HTTP 422 Unprocessable Entity — "bookingMode" nao aceita valor fora de 'link' | 'chat' | 'both'

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-81-04 — Sem token retorna 401

**Categoria:** Acesso negado

**Given** nenhum token de autenticacao presente
**When** GET /api/v1/doctor/agent-settings sem header Authorization
**Then** HTTP 401 Unauthorized

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-81-05 — Doutor nao acessa agent_settings de outro tenant

**Categoria:** Isolamento

**Given** dois doutores em tenants distintos (dr-silva, dra-carvalho), cada um com agent_settings proprias
**When** dr-silva autenticado faz GET /api/v1/doctor/agent-settings com seu JWT
**Then** retorna apenas as configuracoes do tenant de dr-silva — dados de dra-carvalho nao aparecem

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-81-06 — PATCH com todos os campos opcionais omitidos nao altera nada

**Categoria:** Edge case

**Given** doutor autenticado com welcomeMessage = "Ola!" e enabled = true
**When** PATCH /api/v1/doctor/agent-settings {} (body vazio)
**Then** HTTP 200; welcomeMessage e enabled permanecem com os valores anteriores

**Resultado atual:** [x] ok  [ ] falhou

---

## US-8.2 — Editar Perfil e Horarios

### CT-82-01 — Happy path: GET retorna perfil completo do doutor

**Categoria:** Happy path

**Given** doutor autenticado com perfil preenchido (name, crm, specialty, phone, working_hours, timezone)
**When** GET /api/v1/doctor/profile com Authorization: Bearer {token}
**Then** HTTP 200 com todos os campos do perfil; sem password_hash na resposta

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-82-02 — Happy path: PATCH atualiza dados do doutor

**Categoria:** Happy path

**Given** doutor autenticado com specialty = "Clinica Geral"
**When** PATCH /api/v1/doctor/profile { "specialty": "Cardiologia", "phone": "(11) 98765-4321" }
**Then** HTTP 200 com specialty = "Cardiologia" e phone atualizado; name permanece inalterado

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-82-03 — Happy path: PATCH branding atualiza cor e logo do tenant

**Categoria:** Happy path

**Given** doutor autenticado com primaryColor = "#FFFFFF" na tabela tenants
**When** PATCH /api/v1/doctor/profile/branding { "primaryColor": "#1A73E8" }
**Then** HTTP 200; tabela tenants tem primary_color = "#1A73E8" para o tenant do doutor

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-82-04 — PATCH de working_hours persiste formato JSONB correto

**Categoria:** Happy path

**Given** doutor autenticado
**When** PATCH /api/v1/doctor/profile { "workingHours": { "monday": [{ "start": "08:00", "end": "12:00" }], "wednesday": [{ "start": "13:00", "end": "17:00" }] } }
**Then** HTTP 200; banco armazena o JSONB com os dias e intervalos exatos enviados

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-82-05 — Acesso sem token retorna 401

**Categoria:** Acesso negado

**Given** nenhum token de autenticacao
**When** PATCH /api/v1/doctor/profile sem header Authorization
**Then** HTTP 401 Unauthorized

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-82-06 — Doutor nao atualiza perfil de outro tenant

**Categoria:** Isolamento

**Given** dois doutores em tenants distintos (dr-silva, dra-carvalho)
**When** dr-silva autenticado faz PATCH /api/v1/doctor/profile { "name": "Nome Invasor" } com seu JWT
**Then** apenas o registro de dr-silva e atualizado — dados de dra-carvalho permanecem intactos

**Resultado atual:** [ ] ok  [ ] falhou

---

## US-8.3 — Pagina de Configuracoes (Frontend)

### CT-83-01 — Happy path: pagina exibe as 4 secoes com dados atuais

**Categoria:** Happy path

**Given** doutor autenticado com onboarding completo e dados de perfil, horarios, branding e agente preenchidos
**When** navegar para /doctor/settings
**Then** a pagina exibe as 4 secoes (Dados do Doutor, Horarios, Branding, Agente WhatsApp) com os valores atuais carregados nos campos

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-83-02 — Happy path: editar dados do doutor e salvar exibe toast de sucesso

**Categoria:** Happy path

**Given** doutor autenticado na pagina /doctor/settings
**When** alterar o campo "Especialidade" para "Neurologia" e clicar em "Salvar"
**Then** toast de sucesso e exibido; ao recarregar a pagina, "Especialidade" mostra "Neurologia"

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-83-03 — Happy path: editar configuracoes do agente e salvar

**Categoria:** Happy path

**Given** doutor autenticado na pagina /doctor/settings, secao Agente WhatsApp
**When** alterar "Mensagem de boas-vindas" para "Ola! Posso ajudar?" e toggle "Agente habilitado" para ativo, depois clicar "Salvar"
**Then** toast de sucesso; dados persistidos no banco (verificavel via GET /api/v1/doctor/agent-settings)

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-83-04 — Doutor nao autenticado e redirecionado para login

**Categoria:** Acesso negado

**Given** usuario sem sessao ativa (sem token no localStorage)
**When** acessar /doctor/settings diretamente pela URL
**Then** redirecionado para /doctor/login sem exibir a pagina de configuracoes

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-83-05 — Selecionar modo de booking 'link' salva e persiste corretamente

**Categoria:** Edge case

**Given** doutor autenticado na secao Agente WhatsApp com bookingMode atual = 'both'
**When** selecionar "Apenas link" no seletor de modo e clicar "Salvar"
**Then** HTTP 200 na API; ao recarregar /doctor/settings, o seletor mostra "Apenas link"

**Resultado atual:** [ ] ok  [ ] falhou
