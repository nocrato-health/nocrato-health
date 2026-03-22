---
tags: [overview]
type: overview
---

# Nocrato Health V2 - Documentacao

## Estrutura da Documentacao

```
docs/
├── README.md                          # Este arquivo
├── guides/
│   ├── ambiente-de-desenvolvimento-do-zero.md  # Setup completo em maquina nova
│   ├── onboarding-dev.md              # Referencia tecnica para devs (endpoints, fluxos)
│   ├── onboarding-agency.md           # Guia para o time da agencia
│   ├── onboarding-qa.md               # Setup de testes E2E com Playwright
│   └── vps-cheatsheet.md              # Comandos do dia a dia no servidor
├── architecture/
│   ├── tech-stack.md                  # Stack tecnologica e justificativas
│   ├── backend-structure.md           # Estrutura do NestJS (modules, guards, etc.)
│   ├── frontend-structure.md          # Estrutura do React (routes, components, etc.)
│   └── decisions.md                   # Decisoes arquiteturais e trade-offs (ADRs)
├── database/
│   ├── schema.sql                     # Schema SQL completo (CREATE TABLE)
│   ├── entity-relationship.md         # Diagrama ER e relacoes
│   └── migrations.md                  # Ordem de migrations e convencoes
├── flows/
│   ├── auth-flows.md                  # Todos os fluxos de autenticacao
│   ├── booking-flow.md                # Fluxo de agendamento (link + in-chat)
│   ├── appointment-lifecycle.md       # Status transitions de consultas
│   ├── patient-portal.md              # Portal do paciente (acesso + funcionalidades)
│   └── agent.md                       # Integracao do agente WhatsApp (Evolution API)
├── roadmap/
│   └── v1/                            # Entrega inicial (MVP — epics 0-11)
│       ├── epics-overview.md          # Visao geral dos 12 epicos
│       ├── epic-0-foundation.md       # Setup do projeto
│       ├── epic-1-auth.md             # Autenticacao e convites
│       ├── epic-2-agency-portal.md    # Portal da agencia
│       ├── epic-3-onboarding.md       # Onboarding do doutor
│       ├── epic-4-patients.md         # Gestao de pacientes
│       ├── epic-5-appointments.md     # Gestao de consultas
│       ├── epic-6-clinical.md         # Notas clinicas e documentos
│       ├── epic-7-booking.md          # Agendamento publico
│       ├── epic-8-settings.md         # Configuracoes e agente
│       ├── epic-9-events.md           # Agente WhatsApp (modulo interno NestJS)
│       ├── epic-10-patient-portal.md  # Portal do paciente
│       ├── epic-11-deploy.md          # Polish e deploy
│       └── test-cases/                # Casos de teste BDD por epic
└── security/
    └── audit-report.md                # Auditoria OWASP — findings por severidade
```

## Modelo de Dominio

```
NOCRATO (SaaS)
│
├── AGENCIA (portal interno)
│   ├── Admin
│   └── Colaboradores (RBAC)
│       └── Gerenciam → DOUTORES
│
├── TENANT = Portal do Doutor (slug na URL)
│   ├── Doutor (dono)
│   ├── Configuracoes do Agente
│   ├── Consultas
│   ├── Pacientes
│   └── Notas de atendimento
│
├── PACIENTE (portal read-only, vinculado a um doutor)
│
└── AGENTE (modulo NestJS interno)
    └── Orquestra: WhatsApp (Evolution API) <-> Portal <-> Consultas <-> Pacientes
```

## MVP Scope

### Incluso no MVP:

- Portal agencia: login, dashboard, gestao de doutores, convites
- Portal doutor: login via convite, onboarding, pacientes, consultas, notas, docs, config agente
- Portal paciente: acesso via codigo, read-only
- Agendamento publico: link com token + in-chat via agente interno
- Event log como audit trail
- Deploy em Hostinger VPS

### Deixado para V2:

- Agency acessar/editar portal do doutor
- RBAC granular (cargos com permissoes especificas)
- Pagamentos (gateway)
- Object storage (S3/R2)
- WebSocket (real-time)
- CAPTCHA no booking
- Self-service doctor signup