# Security Audit Report — Nocrato Health V2
Data: 2026-03-10
Auditor: Claude Security Agent (claude-sonnet-4-6)
Escopo: Backend completo (NestJS), Frontend (React/Vite), Nginx/Docker, dependências

---

## Executive Summary

A auditoria cobriu todos os 16 tópicos solicitados. O projeto demonstra uma postura de segurança sólida para os riscos mais críticos: isolamento de tenant via JWT bem implementado, guards aplicados consistentemente em todos os controllers de doutor, sem SQL injection via interpolação de strings, e sem secrets hardcoded no código.

Foram identificados **13 findings**, sendo **0 CRITICAL**, **3 HIGH**, **6 MEDIUM** e **4 LOW**.

O risco mais urgente é a ausência de `Content-Security-Policy` no Nginx (SEC-01) combinada com a ausência de Helmet no NestJS (SEC-02). O segundo risco urgente é o padrão de nomeação de arquivos em upload que permite colisão e sobrescrita de documentos clínicos (SEC-03). O código de acesso do portal do paciente (6 dígitos) não possui rate limiting na camada de aplicação, apenas no Nginx (SEC-04).

---

## Findings

### HIGH

#### SEC-01 — Ausência de Content-Security-Policy no Nginx ✅ RESOLVIDO
- **Severidade:** HIGH
- **Fix:** `docker/nginx.conf` — adicionados `Content-Security-Policy` e `Permissions-Policy` ao bloco HTTPS (commit pós-auditoria).
- **Módulo:** `docker/nginx.conf:106-111`
- **Evidência:**
  ```nginx
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  ```
  Faltam: `Content-Security-Policy` e `Permissions-Policy`.
- **Descrição:** O bloco HTTPS do Nginx configura 5 dos 7 headers de segurança esperados. O `Content-Security-Policy` está completamente ausente. O header `X-XSS-Protection` está presente mas foi depreciado pelos browsers modernos e não substitui CSP.
- **Impacto:** Sem CSP, qualquer XSS refletido ou stored (ex: conteúdo de nota clínica renderizado sem sanitização) pode exfiltrar tokens JWT do localStorage, executar código arbitrário e acessar dados de pacientes. O domínio `app.nocrato.com` processa dados LGPD (CPF, histórico médico) — o impacto de um XSS é máximo.
- **Recomendação:** Adicionar ao bloco HTTPS do nginx.conf:
  ```nginx
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://app.nocrato.com; frame-ancestors 'none';" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  ```

---

#### SEC-02 — Ausência de Helmet no NestJS ✅ RESOLVIDO
- **Severidade:** HIGH
- **Fix:** `apps/api/src/main.ts` — instalado `helmet` e adicionado `app.use(helmet())` antes do `enableCors()`.
- **Módulo:** `apps/api/src/main.ts:13`
- **Evidência:**
  ```typescript
  app.enableCors()
  app.setGlobalPrefix('api/v1', { exclude: ['health'] })
  app.useGlobalFilters(new HttpExceptionFilter())
  ```
  Não há `app.use(helmet())` nem importação de `@nestjs/helmet`.
- **Descrição:** O NestJS não utiliza Helmet, que normalmente adicionaria camadas de segurança HTTP como `X-DNS-Prefetch-Control`, `X-Permitted-Cross-Domain-Policies`, `X-Download-Options` e removeria o header `X-Powered-By`. Embora o Nginx adicione alguns headers, a API NestJS responde diretamente a chamadas internas na rede Docker (porta 3000) e headers de segurança devem existir em múltiplas camadas.
- **Impacto:** Requisições que chegam à API por caminhos que contornam o Nginx (acesso direto à porta 3000, em ambiente de dev ou via misconfiguration futura) não terão headers de segurança. O `X-Powered-By: Express` expõe informações sobre a stack em toda chamada direta.
- **Recomendação:** Instalar e configurar `@nestjs/helmet` no `main.ts`:
  ```typescript
  import helmet from 'helmet'
  app.use(helmet())
  ```

---

#### SEC-03 — Upload com filename baseado em `originalname` permite colisão e sobrescrita de documentos ✅ RESOLVIDO
- **Severidade:** HIGH
- **Fix:** `apps/api/src/modules/document/document.controller.ts` — `basename(originalname)` substituído por `${randomUUID()}${extname(originalname)}`. O `originalname` continua armazenado em `file_name` para exibição ao usuário.
- **Módulo:** `apps/api/src/modules/document/document.controller.ts:84-87`
- **Evidência:**
  ```typescript
  filename: (_req, file, cb) => {
    // basename() previne path traversal via originalname com "../"
    cb(null, basename(file.originalname))
  },
  ```
- **Descrição:** O nome do arquivo salvo em disco é o `basename()` do `originalname` fornecido pelo cliente. `basename()` previne path traversal (ex: `../../etc/passwd`), mas não previne dois problemas: (1) Dois uploads com o mesmo nome de arquivo no mesmo `tenantId` se sobrescrevem silenciosamente. (2) O nome original é controlado pelo cliente.
- **Impacto:** Um doutor pode sobrescrever documentos clínicos de pacientes enviando um arquivo com o mesmo nome original. Um atacante autenticado como doutor pode substituir o arquivo de um exame por conteúdo malicioso que outro usuário fará download. Além disso, o `fileUrl` retornado ao cliente inclui o `originalname`, tornando o caminho previsível (SEC-10).
- **Recomendação:** Gerar um nome único para o arquivo em disco, preservando apenas a extensão:
  ```typescript
  import { extname } from 'node:path'
  import { randomUUID } from 'node:crypto'
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname) // '.pdf', '.jpg', etc.
    cb(null, `${randomUUID()}${ext}`)
  }
  ```
  Armazenar o `originalname` na coluna `file_name` (já ocorre) para exibição ao usuário.

---

### MEDIUM

#### SEC-04 — Código de acesso do paciente sem rate limiting na camada de aplicação
- **Severidade:** MEDIUM
- **Módulo:** `apps/api/src/modules/patient/patient-portal.controller.ts:25-43`; `apps/api/src/modules/patient/dto/get-portal-access.dto.ts:1-7`
- **Evidência:**
  ```typescript
  // get-portal-access.dto.ts
  export const GetPortalAccessSchema = z.object({
    code: z.string().min(1, 'Código obrigatório'), // sem validação de formato
  })

  // patient-portal.controller.ts
  @Post('access')
  access(@Body(new ZodValidationPipe(GetPortalAccessSchema)) dto: GetPortalAccessDto) {
    return this.patientService.getPatientPortalData(dto.code)
  }
  ```
- **Descrição:** O endpoint `POST /api/v1/patient/portal/access` aceita um código de acesso sem limitar tentativas no nível da aplicação. O Nginx aplica apenas `api_general: 30r/m` (30 req/min por IP), insuficiente contra brute force distribuído. O schema Zod aceita qualquer string com `min(1)`, sem validar o formato do código (`AAA-NNNN-BBB`).
- **Impacto:** Um atacante com múltiplos IPs pode enumerar códigos de acesso e acessar histórico médico, documentos e informações pessoais de pacientes sem credenciais. Violação LGPD direta — dados de saúde de pacientes expostos.
- **Recomendação:** (1) Validar formato no schema Zod. (2) Implementar `@nestjs/throttler` com limite de 5 tentativas por 15 minutos por IP neste endpoint. (3) Bloquear acesso temporariamente após N tentativas falhas para o mesmo código.

---

#### SEC-05 — CORS completamente aberto (`app.enableCors()` sem restrições)
- **Severidade:** MEDIUM
- **Módulo:** `apps/api/src/main.ts:13`
- **Evidência:**
  ```typescript
  app.enableCors()
  ```
- **Descrição:** `enableCors()` sem parâmetros habilita CORS para todas as origens (`Access-Control-Allow-Origin: *`). Qualquer site na internet pode fazer requisições à API de um usuário logado.
- **Impacto:** Scripts maliciosos injetados via XSS podem fazer chamadas autenticadas à API sem restrição de origem. Com CORS irrestrito, ataques CSRF via scripts também ficam facilitados caso futuramente se adotem cookies.
- **Recomendação:**
  ```typescript
  app.enableCors({
    origin: env.NODE_ENV === 'production' ? env.FRONTEND_URL : ['http://localhost:5173', env.FRONTEND_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
  ```

---

#### SEC-06 — Entropia mínima insuficiente para JWT_SECRET (aceita 16 chars)
- **Severidade:** MEDIUM
- **Módulo:** `apps/api/src/config/env.ts:23-24`
- **Evidência:**
  ```typescript
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ```
- **Descrição:** A validação aceita secrets JWT com apenas 16 caracteres. Para HMAC-SHA256 (HS256), o NIST recomenda chaves de pelo menos 256 bits (32 bytes = 64 caracteres hexadecimais). Um secret de 16 caracteres ASCII fornece no máximo 128 bits de entropia, mas na prática é muito menos se o usuário escolher uma senha simples.
- **Impacto:** JWT secret fraco permite forjar tokens para qualquer `sub` e `tenantId` via ataque de dicionário offline, comprometendo a separação de tenant e a autenticação de todos os usuários.
- **Recomendação:**
  ```typescript
  JWT_SECRET: z.string().min(64),       // openssl rand -hex 32 = 64 chars
  JWT_REFRESH_SECRET: z.string().min(64),
  ```
  Atualizar o `.env.example` com instrução clara de geração.

---

#### SEC-07 — Refresh token sem blacklist: tokens roubados permanecem válidos até expirar (7d)
- **Severidade:** MEDIUM
- **Módulo:** `apps/api/src/modules/auth/agency-auth.service.ts:163-192`; `apps/api/src/modules/auth/doctor-auth.service.ts:341-371`
- **Evidência:**
  ```typescript
  async refreshToken(token: string) {
    payload = this.jwtService.verify(token, { secret: env.JWT_REFRESH_SECRET })
    // Emite novos tokens SEM invalidar o anterior
    const accessToken = this.jwtService.sign(newPayload, ...)
    const refreshToken = this.jwtService.sign(newPayload, ...)
    return { accessToken, refreshToken }
  }
  ```
- **Descrição:** O sistema emite um novo par de tokens no refresh sem invalidar o refresh token anterior. Um atacante com um refresh token roubado (via XSS, MITM, ou insider) pode continuar gerando access tokens pelos 7 dias completos de validade, mesmo após o usuário legítimo renovar o par.
- **Impacto:** Sessão paralela invisível e não detectável. Em plataforma com dados de saúde LGPD, acesso não detectado por 7 dias representa risco crítico de privacidade e compliance.
- **Recomendação:** Implementar refresh token rotation: adicionar coluna `refresh_token_version` (integer) nas tabelas `agency_members` e `doctors`. O JWT carrega a versão como claim; ao fazer refresh, verificar que a versão bate com o banco e incrementar. Token com versão antiga é rejeitado automaticamente.

---

#### SEC-08 — Endpoint público `/doctor/auth/resolve-email/:email` enumera emails e dados de clínicas
- **Severidade:** MEDIUM
- **Módulo:** `apps/api/src/modules/auth/doctor-auth.controller.ts:51-58`
- **Evidência:**
  ```typescript
  @Get('resolve-email/:email')
  resolveEmail(@Param('email') email: string) {
    return this.doctorAuthService.resolveEmail(email)
  }
  ```
  O serviço retorna `{ slug, name }` para doutores ativos, `{ hasPendingInvite: true }` para convites pendentes, ou `NotFoundException` para emails não encontrados — permitindo distinguir os três estados.
- **Descrição:** Este endpoint público permite enumerar emails de doutores e descobrir os slugs (e nomes) de clínicas cadastradas. Não há rate limiting específico nem validação que o email seja válido antes de consultar o banco.
- **Impacto:** Vazamento de PII (emails) e dados de negócio (nomes de clínicas). Facilita phishing direcionado contra doutores e pacientes das clínicas identificadas.
- **Recomendação:** (1) Adicionar `@nestjs/throttler` com limite estrito nesta rota (ex: 10 req/min por IP). (2) Retornar resposta genérica quando email não encontrado (sem distinguir "não existe" de "tem convite pendente"). (3) Não retornar `slug` e `name` neste endpoint — reservar para após login bem-sucedido.

---

#### SEC-09 — Ausência de rate limiting em endpoints de login e reset de senha (camada aplicação)
- **Severidade:** MEDIUM
- **Módulo:** `apps/api/src/modules/auth/agency-auth.controller.ts:16-33`; `apps/api/src/modules/auth/doctor-auth.controller.ts:62-79`
- **Evidência:** Os endpoints `POST /agency/auth/login`, `POST /doctor/auth/login`, `POST /*/auth/forgot-password` e `POST /*/auth/reset-password` não possuem `@Throttle()` nem qualquer middleware de rate limiting além do Nginx.
- **Descrição:** O rate limiting do Nginx (`api_general: 30r/m`) aplica-se por IP, sendo insuficiente contra brute force distribuído via múltiplos IPs ou credential stuffing.
- **Impacto:** Um atacante com múltiplos IPs pode testar senhas ilimitadamente contra qualquer email cadastrado. Comprometimento de uma conta de doutor expõe todos os dados clínicos do tenant.
- **Recomendação:** Instalar `@nestjs/throttler` e configurar limites específicos: `POST /auth/login` → 5 tentativas por 15 minutos por IP. Considerar também implementar lockout de conta no service após N tentativas falhas consecutivas, com registro no `event_log`.

---

### LOW

#### SEC-10 — Documentos clínicos servidos diretamente pelo Nginx sem autenticação
- **Severidade:** LOW
- **Módulo:** `docker/nginx.conf:163-169`
- **Evidência:**
  ```nginx
  location /uploads/ {
      alias /app/uploads/;
      add_header Cache-Control "no-store";
      add_header X-Content-Type-Options "nosniff" always;
  }
  ```
- **Descrição:** Documentos clínicos (exames, prescrições, atestados) são servidos diretamente pelo Nginx via `/uploads/{tenantId}/{filename}` sem verificação de autenticação. O `filename` é o `originalname` do upload (nome previsível). Qualquer pessoa que conhecer ou adivinhar o caminho pode acessar documentos médicos sem autenticação.
- **Impacto:** Violação LGPD — documentos médicos são dados sensíveis de saúde. O caminho `/uploads/{tenantId}/{filename}` expõe o `tenantId` e usa um `filename` previsível. Com SEC-03 corrigido (UUID como filename), o risco é mitigado mas o endpoint ainda fica sem autenticação.
- **Recomendação:** Remover o `location /uploads/` do Nginx e servir arquivos exclusivamente pelo NestJS via `res.download()` (já implementado em `patient-portal.controller.ts:58-66`), que verifica autenticação via código de acesso antes de servir o arquivo.

---

#### SEC-11 — Logger expõe endereços de email (PII) em logs de nível INFO e ERROR
- **Severidade:** LOW
- **Módulo:** `apps/api/src/modules/auth/agency-auth.service.ts:119,122`; `apps/api/src/modules/auth/doctor-auth.service.ts:333,336,135`
- **Evidência:**
  ```typescript
  this.logger.error(`Falha ao enviar e-mail de reset para ${email}: ${err.message}`)
  this.logger.log(`Solicitação de reset de senha para agency member: ${email}`)
  this.logger.log(`Doutor ${email} fez login no tenant ${tenant.slug}`)
  ```
- **Descrição:** Endereços de email de membros da agência e doutores são incluídos diretamente em mensagens de log. Logs frequentemente são coletados por sistemas externos (ELK, Datadog, Loki) e podem ser retidos por longos períodos com controles de acesso menos estritos que o banco de dados.
- **Impacto:** Vazamento de PII em sistemas de log. Em caso de acesso indevido aos logs, emails de todos os usuários cadastrados ficam expostos, violando o princípio de minimização de dados da LGPD.
- **Recomendação:** Substituir emails por IDs nos logs: `this.logger.log(`Solicitação de reset — memberId=${member.id}`)`. Dados identificáveis devem existir apenas no `event_log` estruturado no banco, que tem controles de acesso mais rígidos.

---

#### SEC-12 — Dependências com CVEs de alta severidade em produção e build
- **Severidade:** LOW (risco real limitado no contexto atual)
- **Módulo:** `apps/api/package.json` — 13 vulnerabilidades (1 moderate, 12 high)
- **Evidência (runtime):**
  - `multer@2.0.2` (via `@nestjs/platform-express`): 3 CVEs HIGH — DoS via uploads malformados (GHSA-xf7r-hgr6-v32p, GHSA-e9vh-46qr-2ccm, GHSA-m46v-3p4x-c5pw). Patched >= 2.1.0.
  - `tar@6.2.1` (via `bcrypt > @mapbox/node-pre-gyp`): 5 CVEs HIGH — path traversal e arbitrary file write. Risco apenas em ambiente de build (instalação de binários nativos do bcrypt).
- **Evidência (devDependencies/build):**
  - `minimatch` (via `@nestjs/cli`): 3 CVEs HIGH — ReDoS. Apenas devDependency, não chega em produção.
  - `serialize-javascript` (via `@nestjs/cli > webpack`): 1 CVE HIGH — RCE em serialização. Apenas devDependency/build tool.
  - `ajv@8.17.1` (via `@nestjs/cli`): 1 CVE MODERATE — ReDoS. Apenas devDependency.
- **Impacto real:** `multer` DoS é o único risco em runtime de produção — payload malformado pode esgotar recursos no endpoint `POST /api/v1/doctor/upload`. Os demais são riscos de build/dev apenas.
- **Recomendação:** Atualizar `multer` para >=2.1.0 (urgente — dependency de runtime com patch disponível). Resolver os demais em janela de manutenção regular. Configurar `pnpm audit` no pipeline CI como gate obrigatório.

---

#### SEC-13 — Swagger UI depende de `NODE_ENV=production` no `.env` para ser desabilitado
- **Severidade:** LOW
- **Módulo:** `apps/api/src/main.ts:17-26`
- **Evidência:**
  ```typescript
  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, document)
  }
  ```
  O `docker-compose.prod.yml` define `NODE_ENV: production` no campo `environment` do serviço, mas o `.env` é carregado antes via `env_file: ../.env` — se o `.env` tiver `NODE_ENV=development`, o Swagger ficará exposto.
- **Descrição:** A desabilitação do Swagger depende corretamente de `NODE_ENV=production`. Porém, como o `env.ts` define o default como `development`, um `.env` incompleto em produção pode resultar em Swagger exposto, documentando todos os endpoints da API.
- **Impacto:** Swagger exposto em produção documenta todos os endpoints, schemas e exemplos de payload, facilitando reconhecimento por atacantes.
- **Recomendação:** Inverter para opt-in explícito via variável `ENABLE_SWAGGER=true`, desabilitado por padrão independente do `NODE_ENV`. Adicionar `ENABLE_SWAGGER=false` ao `.env.example` como lembrete.

---

## Resumo por Severidade

| Severidade | Count | IDs |
|------------|-------|-----|
| CRITICAL   | 0     | — |
| HIGH       | 3     | SEC-01, SEC-02, SEC-03 |
| MEDIUM     | 6     | SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, SEC-09 |
| LOW        | 4     | SEC-10, SEC-11, SEC-12, SEC-13 |

---

## Itens Sem Vulnerabilidades

Os itens a seguir foram verificados e considerados adequados:

**Isolamento de Tenant:**
- `tenant_id` extraído do JWT via `@TenantId()` em todos os controllers de doutor — nunca aceito do body (`apps/api/src/common/decorators/tenant.decorator.ts`)
- Guards `JwtAuthGuard + TenantGuard + RolesGuard + @Roles('doctor')` aplicados na classe em todos os controllers tenant-scoped: `PatientController`, `AppointmentController`, `ClinicalNoteController`, `DocumentController`, `OnboardingController`, `ProfileController`, `AgentSettingsController`
- Todas as queries Knex em tabelas tenant-scoped filtram por `WHERE tenant_id = tenantId` (verificado em todos os services)
- `BookingService.validateToken()` e `bookAppointment()` filtram `booking_tokens` por `tenant_id` antes de validar — cross-tenant protection implementada e testada
- `TenantGuard` (`apps/api/src/common/guards/tenant.guard.ts`) verifica `user?.tenantId` do JWT e rejeita com 403 se ausente

**Autenticação JWT:**
- Algoritmo padrão do `@nestjs/jwt` é HS256 — `none` nunca configurado
- `ignoreExpiration: false` explicitamente configurado na JWT strategy (`apps/api/src/modules/auth/strategies/jwt.strategy.ts:19`)
- Access token expira em 15m (padrão e documentado no `.env.example`)
- Refresh token expira em 7d
- Domínios separados: `refreshToken` agency e doctor usam secrets diferentes e validam o campo `type` (linha 171 de `agency-auth.service.ts`, linha 349 de `doctor-auth.service.ts`)
- Senhas comparadas com `bcrypt.compare()` — timing-safe, sem comparação direta de string

**SQL Injection:**
- Nenhuma interpolação de string em queries de domínio encontrada — todos os valores passam como parâmetros do Knex
- `knex.raw()` usado apenas para aliases de coluna (ex: `knex.raw('primary_color as "primaryColor"')`) — sem variáveis de usuário interpoladas
- `ConversationService.getOrCreate()` usa `knex.raw` com parâmetros nomeados (`:tenantId, :phone`) — seguro
- Busca LIKE em `PatientService.listPatients()` sanitiza wildcards: `search.replaceAll(/[%_\\]/g, String.raw`\$&`)` antes do `whereILike` (`apps/api/src/modules/patient/patient.service.ts:93`)

**Input Validation:**
- Todos os endpoints POST/PATCH têm `ZodValidationPipe` aplicado no parâmetro `@Body()`
- Query params de listagem usam `z.coerce.number()` para page/limit (HTTP entrega strings)
- IDs de parâmetros de rota validados com `z.string().uuid()` nos controllers críticos (`patient.controller.ts:48,104`)

**Tokens Públicos de Booking:**
- Gerados com `crypto.randomBytes(32).toString('hex')` — 256 bits de entropia (`booking.service.ts:115`)
- Expiram em 24h e marcados como `used: true` atomicamente com criação da consulta (transação)
- Vinculados a `tenant_id` — validação cross-tenant implementada
- Correspondência de phone verificada no `bookAppointment` para prevenir bypass via DevTools (`booking.service.ts:571`)

**Webhook WhatsApp:**
- Validação de `apikey` vs `EVOLUTION_WEBHOOK_TOKEN` antes de qualquer processamento (`agent.controller.ts:56`)
- `payload.data?.key?.remoteJid` validado antes de processar (TD-18 resolvido, linha 81)
- `fromMe === true` filtrado silenciosamente (linha 85)
- Erros nunca retornam 5xx — try/catch adequado com log (linha 89-96)
- Rate limiting via Nginx: zona `webhook: 60r/m` com burst de 20

**Upload de Arquivos:**
- `basename()` aplicado ao `originalname` — previne path traversal (embora SEC-03 identifique colisão)
- Arquivos salvos em `process.cwd()/uploads/{tenantId}/` — separados por tenant
- Tamanho máximo: `client_max_body_size 20m` no Nginx
- Arquivo não executado — Nginx serve com `X-Content-Type-Options: nosniff`
- Autenticação completa (JWT + TenantGuard) exigida no endpoint de upload

**Headers de Segurança Nginx:**
- HSTS com `max-age=31536000; includeSubDomains` presente
- `X-Frame-Options: SAMEORIGIN` presente
- `X-Content-Type-Options: nosniff` presente
- `Referrer-Policy: strict-origin-when-cross-origin` presente
- TLS 1.2+ com ciphers ECDHE modernos, `ssl_prefer_server_ciphers off` (deixa cliente escolher)
- HTTP redireciona para HTTPS com `return 301`

**Secrets / Configuração:**
- `.env` e `.env.production` no `.gitignore` — verificado com `git ls-files`: apenas `.env.example` e `apps/web/.env.example` estão commitados
- Nenhum secret hardcoded encontrado no código-fonte
- Todas as variáveis sensíveis (JWT_SECRET, DB_PASSWORD, EVOLUTION_API_KEY, OPENAI_API_KEY) são obrigatórias e validadas no startup via Zod com `process.exit(1)` em caso de falha

**Docker / Infraestrutura:**
- PostgreSQL não exposto publicamente — apenas na `nocrato_net` network interna
- Evolution API não exposta na porta pública
- Volumes de desenvolvimento não montados no `docker-compose.prod.yml`

**LGPD — Proteção de Dados Sensíveis:**
- `cpf` e `portal_access_code` nunca retornados em listagens — definidos em `PUBLIC_PATIENT_FIELDS` explicitamente sem esses campos (`patient.service.ts:28-36`)
- `clinical_notes` não expostas no portal do paciente — verificado em `getPatientPortalData()` (`patient.service.ts:303-313`)
- `password_hash` nunca serializado em nenhuma resposta (seleção explícita de campos em todos os services)
- Acesso ao portal do paciente registrado em `event_log` (`patient.service.ts:301`)

**Frontend (XSS):**
- Nenhum uso de `dangerouslySetInnerHTML` encontrado em todo o código React (`apps/web/src/`)
- Tokens armazenados em `localStorage` via Zustand persist — solução padrão para SPA stateless; risco mitigado pela ausência de XSS e configuração de CSP (SEC-01)

---

## Recomendações Prioritárias

1. **(SEC-01 + SEC-02, HIGH)** Configurar `Content-Security-Policy` no `docker/nginx.conf` e instalar `@nestjs/helmet` em `apps/api/src/main.ts`. Mudanças de 2-5 linhas cada, impacto de proteção imediato contra XSS.

2. **(SEC-03, HIGH)** Substituir `basename(file.originalname)` por `${randomUUID()}${extname(file.originalname)}` em `apps/api/src/modules/document/document.controller.ts:86` para eliminar colisão e sobrescrita de documentos clínicos.

3. **(SEC-04, MEDIUM)** Adicionar `@nestjs/throttler` no endpoint `POST /api/v1/patient/portal/access` e validar formato do código de acesso no schema Zod — o código de 6 dígitos é o único segredo que protege dados médicos sem JWT.

4. **(SEC-05, MEDIUM)** Restringir CORS ao domínio do frontend em `apps/api/src/main.ts:13`.

5. **(SEC-12, LOW, urgente em runtime)** Atualizar `multer` para >=2.1.0 em `apps/api/package.json` — 3 CVEs de DoS com patch disponível.

6. **(SEC-07, MEDIUM)** Implementar refresh token rotation/versioning para limitar janela de exposição de tokens roubados de 7 dias para duração de uma única sessão.

7. **(SEC-09, MEDIUM)** Adicionar `@nestjs/throttler` nos endpoints de login e reset de senha em ambos os controllers de auth.

8. **(SEC-10, LOW)** Remover o `location /uploads/` do `docker/nginx.conf` e passar o serving de arquivos pelo NestJS autenticado — especialmente após SEC-03 ser implementado (UUID como filename).
