---
tags: [onboarding]
type: guide
---

# Onboarding — QA

Guia para a equipe de QA do Nocrato Health V2. Cobre os acessos de teste, fluxos a validar e cenários organizados por área do sistema.

> Referência técnica de endpoints e setup local: [onboarding-dev.md](onboarding-dev.md)
> Casos de teste detalhados por epic: [test-cases/](test-cases/)

---

## Ambientes

| Ambiente | URL base |
|----------|----------|
| Produção | `https://app.nocrato.com` |
| Local (dev) | `http://localhost:5173` (frontend) / `http://localhost:3000` (API) |

---

## Credenciais de Teste

### Agência

| Email | Senha | Perfil |
|-------|-------|--------|
| `admin@nocrato.com` | `admin123` | Administrador — acesso total |

### Doutores

| Email | Senha | Situação | Usar para |
|-------|-------|----------|-----------|
| `test-new@nocrato.com` | `Doctor123!` | Onboarding **incompleto** | Validar wizard, redirecionamentos, bloqueio de acesso ao dashboard |
| `test-done@nocrato.com` | `Doctor123!` | Cadastro **completo** | Testar todas as funcionalidades do portal do doutor |

### Portal do Paciente

| Código | Situação |
|--------|----------|
| `MRS-5678-PAC` | Paciente com consulta futura, consulta passada concluída, e um documento disponível |

### Tokens de Booking

| Situação | Token |
|----------|-------|
| Válido (24h, não usado) | `abcdef01` repetido 8x |
| Expirado | `dead0000` repetido 8x |
| Já utilizado | `cafe1234` repetido 8x |
| Com conflito de horário | `beef5678` repetido 8x |

URL de teste para booking: `http://localhost:5173/book/test-done-doctor?token={token}`

---

## Rodando a suíte Playwright (E2E)

A suíte E2E roda **contra um banco isolado** (`nocrato_health_test`) e **com bypass do throttler de login** — sem isso, em paralelo a partir do 6º login a API responde 429 e quebra ~17 testes em cascata.

### Setup inicial (uma vez por máquina)

```bash
# 1. Copiar e preencher .env.test (na raiz do monorepo)
cp .env.test.example .env.test
#   editar .env.test e gerar o secret:
#   echo "E2E_THROTTLE_BYPASS_SECRET=$(openssl rand -hex 16)" >> .env.test

# 2. Criar o banco + aplicar migrations (idempotente — pode rodar sempre)
pnpm test:e2e:setup
```

### Rodar a suíte (toda vez)

**Terminal 1 — API em modo test (deixar rodando):**
```bash
# Matar qualquer API de dev na porta 3000 antes
lsof -ti:3000 | xargs -r kill
# Script dedicado — cross-env garante que NODE_ENV=test sobrevive a hot-reload
pnpm --filter @nocrato/api dev:test
# aguardar "Application is running on port 3000"
```

**Terminal 2 — Playwright:**
```bash
cd apps/web
export E2E_THROTTLE_BYPASS_SECRET=$(grep '^E2E_THROTTLE_BYPASS_SECRET=' ../../.env.test | cut -d= -f2)

# Full suite (paralelo, ~25s)
pnpm exec playwright test --workers=6

# Arquivo único
pnpm exec playwright test e2e/agency.spec.ts

# Filtro por nome do CT
pnpm exec playwright test -g "CT-32-01"
```

**Voltar ao normal:** `Ctrl+C` na API de teste e `pnpm --filter @nocrato/api dev` para retomar o banco de dev.

### Pegadinhas conhecidas

1. **Porta 3000 compartilhada** — não dá pra rodar API de dev e API de test ao mesmo tempo. Mate uma antes de subir a outra.

2. **`nest --watch` e NODE_ENV** — resolvido: `dev:test` usa `cross-env` que reinjeta `NODE_ENV=test` em cada spawn do watcher. Se mesmo assim desconfiar, valide com:
   ```bash
   tr '\0' '\n' < /proc/$(lsof -ti:3000)/environ | grep NODE_ENV
   ```

3. **Bancos separados, dados separados** — o `nocrato_health_test` é diferente do `nocrato_health` (dev). Mudanças manuais que você fez no banco de dev não aparecem nos testes. O `globalSetup` (`apps/web/e2e/global-setup.ts`) roda `setup-test-data.ts` antes de cada execução, garantindo idempotência.

4. **Asserts em testes novos devem ser parallel-safe** — em paralelo, diferentes suites mutam o mesmo seed. Regras:
   - Doutor: assertar por **email** (estável), nunca por nome (mutado pelo onboarding wizard).
   - Documento criado durante o teste: usar **filename único** (`randomUUID().slice(0,8)`) e escopar locator pelo nome.
   - Datas em fixtures: sempre **computadas dinamicamente** de `new Date()`, nunca strings hardcoded como `2025-03-15` (envelhecem).
   - Recursos compartilhados (pacientes "Gustavo Ramos", "Fernanda Oliveira"): outros testes podem ter adicionado artefatos. Não dependa de contagens ou de `.first()`.

### Troubleshooting

| Sintoma | Causa provável | Verificação |
|---|---|---|
| `429 Too Many Requests` em login | API não está em `NODE_ENV=test` ou secret diverge | `curl -X POST http://localhost:3000/api/v1/doctor/auth/login -H "x-e2e-bypass: $E2E_THROTTLE_BYPASS_SECRET" -d '{}'` deve dar 400, não 429 |
| `relation "tenants" does not exist` | Migrations não aplicadas no banco de teste | `NODE_ENV=test pnpm --filter @nocrato/api migrate` |
| Testes de agency 401 / "credenciais inválidas" | Seed do agency admin não rodou | Verificar que `setup-test-data.ts` chama `setupAgencyAdmin(db)` |
| `getByText('Dr. Teste Novo')` não encontra | Nome do test-new foi mutado pelo onboarding em paralelo | Usar `getByText('test-new@nocrato.com')` (email é estável) |
| `expect(capturedRequests).toBeGreaterThan(0)` falha | `.first()` em locator pegou doc de outra suite | Criar doc com filename único e escopar locator pelo nome |

---

## Mapa do Sistema — O que testar

O sistema tem 4 superfícies principais. Cada uma tem seu próprio fluxo de acesso e conjunto de funcionalidades.

```
app.nocrato.com/
├── /agency          → Portal da Agência (login com email/senha)
├── /doctor          → Portal do Doutor (login com email/senha)
├── /book/{slug}     → Agendamento Público (acesso por token no link)
└── /patient/access  → Portal do Paciente (acesso por código)
```

---

## Cenários de Teste

### 1. Autenticação — Portal da Agência

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 1.1 | Login com credenciais válidas (`admin@nocrato.com`) | Redireciona para `/agency` |
| 1.2 | Login com senha errada | Mensagem de erro, não autentica |
| 1.3 | Login com e-mail inexistente | Mensagem de erro genérica |
| 1.4 | Acesso direto a `/agency` sem login | Redireciona para tela de login |
| 1.5 | Fluxo "Esqueci minha senha" — e-mail válido | Mensagem de confirmação (sem revelar se o e-mail existe) |

---

### 2. Autenticação — Portal do Doutor

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 2.1 | Login com `test-done@nocrato.com` | Redireciona para `/doctor` (dashboard) |
| 2.2 | Login com `test-new@nocrato.com` | Redireciona para `/doctor/onboarding` |
| 2.3 | Doutor com onboarding incompleto tenta acessar `/doctor` diretamente | Redireciona para `/doctor/onboarding` |
| 2.4 | Doutor com onboarding completo tenta acessar `/doctor/onboarding` | Redireciona para `/doctor` |
| 2.5 | Login com senha errada | Mensagem de erro, não autentica |
| 2.6 | E-mail não cadastrado (etapa de resolução) | Mensagem informando que o e-mail não foi encontrado |

---

### 3. Convite e Onboarding do Doutor

**Pré-requisito:** logado como `admin@nocrato.com`

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 3.1 | Convidar um e-mail novo | Confirmação exibida; e-mail de convite enviado |
| 3.2 | Convidar um e-mail já cadastrado | Erro informando que o e-mail já existe |
| 3.3 | Tentar aceitar convite com token expirado (>7 dias) | Página de erro de link inválido |
| 3.4 | Aceitar convite com dados válidos | Redireciona para `/doctor/onboarding` |
| 3.5 | Tentar avançar o wizard sem preencher campos obrigatórios | Validações impedem avanço |
| 3.6 | Concluir os 4 passos do onboarding | `onboardingCompleted = true`, redireciona para `/doctor` |

**Wizard (4 passos):**
- Passo 1: nome, CRM, UF do CRM, especialidade — todos obrigatórios
- Passo 2: ao menos um dia com horário configurado
- Passo 3: cor primária (opcional, tem padrão)
- Passo 4: mensagem de boas-vindas — obrigatória

---

### 4. Portal do Doutor — Pacientes

**Pré-requisito:** logado como `test-done@nocrato.com`

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 4.1 | Listar pacientes | Lista paginada com nome, telefone e status |
| 4.2 | Buscar por nome | Filtra resultados em tempo real |
| 4.3 | Filtrar por status "inactive" | Mostra apenas pacientes inativos |
| 4.4 | Abrir perfil de um paciente | Exibe dados + histórico de consultas + documentos |
| 4.5 | Criar paciente com telefone novo | Paciente criado, aparece na lista |
| 4.6 | Criar paciente com telefone já cadastrado | Erro informando telefone duplicado |
| 4.7 | Editar nome de um paciente | Atualizado na lista e no perfil |

---

### 5. Portal do Doutor — Consultas

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 5.1 | Ver dashboard | Consultas de hoje + pendências exibidas |
| 5.2 | Listar consultas do dia | Filtro por data retorna apenas consultas do dia |
| 5.3 | Filtrar por status "scheduled" | Apenas agendadas aparecem |
| 5.4 | Abrir detalhe de uma consulta | Exibe dados + status atual + botões de ação disponíveis |
| 5.5 | Avançar status: scheduled → waiting → in_progress → completed | Cada transição atualiza o status exibido |
| 5.6 | Cancelar consulta sem informar motivo | Validação impede cancelamento |
| 5.7 | Cancelar consulta com motivo | Status muda para "cancelled", motivo registrado |
| 5.8 | Reagendar consulta | Consulta original fica como "rescheduled", nova criada como "scheduled" |
| 5.9 | Marcar como "não compareceu" | Status muda para "no_show" |

---

### 6. Portal do Doutor — Notas e Documentos

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 6.1 | Adicionar nota clínica a uma consulta | Nota aparece no detalhe da consulta |
| 6.2 | Nota clínica **não** aparece no portal do paciente | Confirmar ausência no portal |
| 6.3 | Upload de documento (PDF) vinculado a paciente | Documento aparece no perfil do paciente e no portal do paciente |
| 6.4 | Upload sem selecionar arquivo | Botão de envio desabilitado ou erro |
| 6.5 | Filtrar documentos por tipo | Apenas documentos do tipo selecionado aparecem |

---

### 7. Agendamento Público (Booking)

**URL de teste:** `http://localhost:5173/book/test-done-doctor?token={token}`

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 7.1 | Abrir com token válido | Página carrega com nome do médico e data de seleção |
| 7.2 | Abrir com token expirado | Mensagem de link inválido ou expirado |
| 7.3 | Abrir com token já utilizado | Mensagem de link já utilizado |
| 7.4 | Selecionar data sem horários disponíveis | Mensagem informando sem disponibilidade |
| 7.5 | Selecionar data com horários disponíveis | Slots aparecem para seleção |
| 7.6 | Confirmar agendamento com todos os dados | Mensagem de confirmação; consulta criada no portal do doutor |
| 7.7 | Confirmar sem preencher nome ou telefone | Validação impede o envio |
| 7.8 | Usar o mesmo token duas vezes | Segunda tentativa retorna erro de link já utilizado |
| 7.9 | Paciente com 2 consultas ativas tenta agendar | Erro informando limite de agendamentos ativos |

---

### 8. Portal do Paciente

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 8.1 | Acessar com código válido (`MRS-5678-PAC`) | Portal abre com dados do paciente |
| 8.2 | Acessar com código inválido | Mensagem de código não encontrado |
| 8.3 | Acessar com código de outro tenant | Código não encontrado (isolamento) |
| 8.4 | Verificar consultas exibidas | Passadas e futuras, ordenadas por data |
| 8.5 | Verificar documentos exibidos | Documentos do médico disponíveis para download |
| 8.6 | Verificar que notas clínicas **não** aparecem | Ausentes no portal |
| 8.7 | Clicar em download de documento | Arquivo baixado corretamente |

---

### 9. Ativação do Portal do Paciente

**Pré-requisito:** paciente sem portal ativo; logado como doutor

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 9.1 | Concluir primeira consulta de um paciente novo | Portal ativado; código gerado; notificação WhatsApp enviada (checar logs) |
| 9.2 | Concluir segunda consulta do mesmo paciente | Código **não** é gerado novamente |
| 9.3 | Acessar portal com o código gerado | Portal abre normalmente |

---

### 10. Isolamento entre Doutores (Segurança)

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 10.1 | Doutor A não vê pacientes do Doutor B | Lista retorna apenas pacientes do próprio tenant |
| 10.2 | Doutor A tenta acessar URL de consulta do Doutor B diretamente | Retorna "não encontrado" |
| 10.3 | Código de portal de paciente do Doutor B não funciona no portal do Doutor A | Código não encontrado |

---

### 11. Configurações do Doutor

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 11.1 | Atualizar horários de atendimento | Slots de booking refletem a mudança |
| 11.2 | Desativar agente WhatsApp | Campo `enabled = false`; verificar que agente não responde |
| 11.3 | Alterar modo de booking de "link" para "chat" | Agente passa a usar `book_appointment` em vez de `generate_booking_link` |
| 11.4 | Atualizar mensagem de boas-vindas | Nova mensagem usada pelo agente na próxima conversa |

---

## Fluxos E2E Prioritários

Para cada release, validar pelo menos estes fluxos de ponta a ponta:

### Fluxo 1 — Novo doutor até primeiro dashboard
```
Convite enviado pela agência
→ Doutor aceita pelo link do e-mail
→ Completa o wizard de onboarding (4 passos)
→ Acessa o dashboard com dados zerados
```

### Fluxo 2 — Paciente agenda e doutor atende
```
Agente gera link de booking
→ Paciente abre o link, escolhe horário, confirma
→ Consulta aparece no dashboard do doutor (status: scheduled)
→ Doutor avança status: waiting → in_progress → completed
→ Portal do paciente é ativado automaticamente
→ Paciente acessa o portal com o código recebido
```

### Fluxo 3 — Documento criado e acessado pelo paciente
```
Doutor faz upload de um documento para o paciente
→ Documento aparece no perfil do paciente (portal do doutor)
→ Paciente acessa o portal e vê o documento
→ Download funciona corretamente
```

---

## Regressões Conhecidas

| Área | Situação |
|------|----------|
| Playwright / `agency.spec.ts` | 12 testes falham localmente por falta de `JWT_SECRET` válido no `.env` local — não é regressão, apenas config de ambiente |
| Timezone de slots | Slots assumem UTC fixo (TD-01) — para doutores em fuso diferente, os horários podem aparecer incorretos |

---

## Como Reportar Bugs

Ao encontrar um problema, incluir no report:

1. **Ambiente** (produção / local)
2. **Usuário / credencial utilizada**
3. **Passo a passo** para reproduzir
4. **Resultado obtido** vs **resultado esperado**
5. **Print ou vídeo** se possível