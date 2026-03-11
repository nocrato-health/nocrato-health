# Casos de Teste — Epic 11: Polish & Deploy

> Epic doc: [docs/roadmap/epic-11-deploy.md](../roadmap/epic-11-deploy.md)
> Gerado em: 2026-03-09

---

## US-11.1 — Experiência fluida (loading / error / empty / responsive / favicon)

### CT-111-01 — Loading skeleton aparece enquanto lista de pacientes carrega

**Categoria:** Happy path

**Given** doutor autenticado no portal, navegando para `/doctor/patients`
**When** a requisição `GET /api/v1/doctor/patients` está em andamento
**Then** cards skeleton (placeholders animados) são exibidos no lugar da lista real durante o carregamento

**Resultado atual:** [x] ok

---

### CT-111-02 — Loading skeleton aparece enquanto lista de consultas carrega

**Categoria:** Happy path

**Given** doutor autenticado no portal, navegando para `/doctor/appointments`
**When** a requisição `GET /api/v1/doctor/appointments` está em andamento
**Then** linhas skeleton animadas são exibidas na tabela durante o carregamento

**Resultado atual:** [x] ok

---

### CT-111-03 — Error state exibe mensagem amigável quando API falha

**Categoria:** Edge case

**Given** doutor autenticado no portal, API retorna 500 na listagem de pacientes
**When** a requisição falha (simulado via rede offline ou mock)
**Then** mensagem de erro amigável ("Erro ao carregar dados") é exibida com opção de tentar novamente; nenhuma exceção não tratada aparece no console

**Resultado atual:** [x] ok — error state testado visualmente (red card com AlertTriangle, mensagem em português)

---

### CT-111-04 — Empty state exibe mensagem contextual para lista vazia

**Categoria:** Happy path

**Given** doutor autenticado com zero pacientes cadastrados no tenant
**When** doutor acessa `/doctor/patients`
**Then** mensagem "Nenhum paciente cadastrado" (ou equivalente) é exibida com ícone ou call-to-action — sem tabela vazia sem contexto

**Resultado atual:** [x] ok — "Nenhum paciente encontrado / Tente ajustar os filtros de busca." com ícone confirmado via Playwright

---

### CT-111-05 — Sidebar colapsa em viewport mobile (< 768px)

**Categoria:** Happy path

**Given** portal do doutor aberto em viewport de 375px de largura (iPhone SE)
**When** a página é carregada
**Then** a sidebar lateral não ocupa largura fixa de 240px — está colapsada, oculta, ou substituída por menu hamburguer; o conteúdo principal ocupa a tela inteira

**Resultado atual:** [x] ok — sidebar colapsada por padrão em 375px, hamburguer (≡) no topo, overlay com backdrop ao abrir

---

### CT-111-06 — Portal da agência também responsivo em mobile

**Categoria:** Happy path

**Given** usuário da agência no portal, viewport 375px
**When** acessa `/agency/doctors`
**Then** layout não quebra horizontalmente; nenhum elemento fica cortado ou requer scroll horizontal

**Resultado atual:** [x] ok — `document.body.scrollWidth === 375`, sem overflow horizontal; tabela com `overflow-x: auto` interno

---

### CT-111-07 — Favicon carregado corretamente em todas as rotas

**Categoria:** Happy path

**Given** qualquer rota do frontend (agency, doctor, patient, booking)
**When** a página é aberta no browser
**Then** o favicon aparece na aba do browser; nenhum erro 404 para `/favicon.ico` ou `/favicon.svg` no console de rede

**Resultado atual:** [x] ok — `/favicon.svg` retorna 200; `meta description` e `theme-color: #fabe01` presentes

---

### CT-111-08 — Título da aba dinâmico por portal

**Categoria:** Happy path

**Given** usuário navega entre os portais
**When** acessa cada portal/rota
**Then**
- Portal agência → título `"Nocrato - Portal da Agência"` (ou equivalente)
- Portal doutor → título `"Nocrato - Portal do Doutor"` (ou equivalente)
- Portal paciente → título diferenciado do padrão estático `"Nocrato Health"`
- Booking público → título inclui nome do médico ou clínica

**Resultado atual:** [x] ok — "Nocrato — Portal do Médico", "Nocrato — Portal da Agência", "Nocrato — Portal de {nome}" (paciente dinâmico), "Agendar consulta — {nome do médico}" (booking)

---

## US-11.2 — Documentação da API (Swagger)

### CT-112-01 — Swagger UI acessível em /api/docs

**Categoria:** Happy path

**Given** API NestJS rodando (local ou produção)
**When** GET `http://localhost:3000/api/docs` é aberto no browser
**Then** Swagger UI é renderizado com lista de endpoints agrupados por tag; sem página em branco ou erro 404

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-112-02 — Todos os controllers possuem @ApiTags e endpoints com @ApiOperation

**Categoria:** Happy path

**Given** Swagger UI carregado em `/api/docs`
**When** desenvolvedor navega pela documentação
**Then** cada grupo de endpoints tem uma tag clara (ex: "Agency Auth", "Doctor Patients", "Public Booking"); cada endpoint tem título/summary via `@ApiOperation`; sem endpoints "Anonymous" ou sem descrição

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-112-03 — Endpoints documentam respostas de sucesso e erro

**Categoria:** Happy path

**Given** Swagger UI carregado
**When** desenvolvedor expande qualquer endpoint com autenticação (ex: GET /doctor/patients)
**Then** resposta 200/201 com schema do payload documentada; resposta 401 documentada; resposta 400/404 documentada onde aplicável

**Resultado atual:** [x] ok  [ ] falhou

---

### CT-112-04 — Swagger não expõe endpoints em produção sem proteção

**Categoria:** Segurança

**Given** API rodando em ambiente de produção (`NODE_ENV=production`)
**When** GET `/api/docs` é chamado
**Then** Swagger UI está acessível (conforme critério do epic) OU retorna 404 — nunca expõe dados internos além da especificação; sem stack traces nos schemas

**Resultado atual:** [x] ok  [ ] falhou

---

## US-11.3 — Seed data para testes

### CT-113-01 — Script de seed executa sem erros

**Categoria:** Happy path

**Given** banco PostgreSQL limpo (apenas migrations aplicadas), sem dados
**When** `pnpm --filter @nocrato/api seed` é executado no terminal
**Then** script finaliza sem erros; log indica criação dos registros: 1 admin, 2 doutores, 5 pacientes, 10 consultas, notas, documentos

**Resultado atual:** [x] ok

---

### CT-113-02 — Dados seed permitem login nos portais

**Categoria:** Happy path

**Given** seed aplicado com sucesso
**When** usuário tenta fazer login com as credenciais de seed
**Then**
- Login na agência funciona com admin de seed
- Login no portal doutor funciona com doutor de seed
- Acesso ao portal paciente funciona com código gerado pelo seed

**Resultado atual:** [x] ok — agency (admin@nocrato.com), doctor (test-done@nocrato.com / Doctor123!), patient portal (SEED01 → Maria Santos) todos funcionando

---

### CT-113-03 — Seed é idempotente (segunda execução não duplica dados)

**Categoria:** Edge case

**Given** seed já foi executado uma vez
**When** `pnpm --filter @nocrato/api seed` é executado novamente
**Then** script não lança erro de constraint unique; dados não são duplicados OU script detecta dados existentes e pula graciosamente

**Resultado atual:** [x] ok

---

## US-11.4 — Deploy em Hostinger

### CT-114-01 — Aplicação acessível via HTTPS com certificado válido

**Categoria:** Happy path

**Given** deploy realizado em Hostinger VPS com Nginx + Let's Encrypt configurados
**When** acesso a `https://app.nocrato.com` via browser
**Then** página carrega sem aviso de certificado inválido; cadeado verde exibido; redirecionamento automático de HTTP → HTTPS

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-114-02 — API responde em produção

**Categoria:** Happy path

**Given** deploy ativo
**When** GET `https://app.nocrato.com/api/v1/agency/auth/login` com body inválido
**Then** resposta HTTP 400 com JSON de validação — confirma que NestJS está rodando e Nginx faz proxy corretamente

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-114-03 — Frontend React servido pelo Nginx

**Categoria:** Happy path

**Given** deploy ativo, build React compilado
**When** acesso a `https://app.nocrato.com/agency/login` no browser
**Then** página de login da agência carrega corretamente; assets JS/CSS carregam sem erro 404; deep link direto (sem passar pela raiz) funciona (SPA fallback configurado)

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-114-04 — Upload e download de documentos funcionam em produção

**Categoria:** Happy path

**Given** doutor autenticado em produção, com pasta `./uploads/` configurada no servidor
**When** doutor faz upload de um documento PDF e depois tenta baixar
**Then** upload retorna 201 com URL do arquivo; download via URL retorna o arquivo correto; arquivo persistido no disco local do servidor

**Resultado atual:** [ ] ok  [ ] falhou

---

### CT-114-05 — Variáveis de ambiente de produção são validadas no boot

**Categoria:** Edge case

**Given** `.env` de produção com uma variável obrigatória ausente (ex: `RESEND_API_KEY`)
**When** container NestJS é iniciado
**Then** aplicação falha no boot com mensagem de erro descritiva indicando qual variável está faltando; não sobe silenciosamente com valor `undefined`

**Resultado atual:** [ ] ok  [ ] falhou
