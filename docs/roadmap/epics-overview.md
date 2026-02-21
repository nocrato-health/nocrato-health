# Nocrato Health V2 - Roadmap: Epics Overview

## Epics Summary

| Epic | Name | Description | User Stories |
|------|------|-------------|:------------:|
| 0 | Fundacao | Setup do projeto, banco de dados, e infraestrutura base do NestJS | 3 |
| 1 | Autenticacao & Convites | Fluxos de login, registro, convite e esqueci minha senha | 9 |
| 2 | Portal da Agencia | Dashboard, gestao de doutores e colaboradores | 5 |
| 3 | Onboarding do Doutor | Wizard pos-convite para configurar o portal do doutor | 2 |
| 4 | Gestao de Pacientes | CRUD de pacientes no portal do doutor | 5 |
| 5 | Gestao de Consultas | CRUD de consultas com lifecycle de status | 6 |
| 6 | Notas Clinicas & Documentos | Registros medicos vinculados a consultas e pacientes | 5 |
| 7 | Agendamento Publico (Booking) | Pagina de agendamento para pacientes + booking in-chat via agente interno | 5 |
| 8 | Configuracoes & Agente | Config do agente WhatsApp e settings do portal | 3 |
| 9 | Agente WhatsApp (Modulo Interno) | Modulo NestJS com Evolution API + OpenAI SDK (gpt-4o-mini) + EventEmitter2 | 4 |
| 10 | Portal do Paciente | Portal read-only para pacientes acessarem suas informacoes | 3 |
| 11 | Polish & Deploy | Acabamento final e deploy em producao | 4 |

**Total: 12 Epics, 54 User Stories**

---

## Dependency Graph

```
EPIC 0 (Fundacao) ──→ EPIC 1 (Auth & Convites)
                          │
                   ┌──────┴──────┐
                   ▼              ▼
            EPIC 2 (Agency)   EPIC 3 (Onboarding)
                                  │
                   ┌──────────────┼──────────────┐
                   ▼              ▼              ▼
            EPIC 4 (Pacientes) EPIC 5 (Consultas) EPIC 8 (Config)
                   │              │
                   ▼              ▼
            EPIC 6 (Notas/Docs) EPIC 7 (Booking)
                                  │
                                  ▼
                          EPIC 9 (Event Log)
                                  │
                    ┌─────────────┘
                    │         EPIC 5 (Consultas) ──┐
                    ▼                              │
                          EPIC 10 (Portal Paciente) ◄─────────┘
                                  │
                                  ▼
                          EPIC 11 (Polish & Deploy)
```

---

## Execution Order Explanation

The roadmap follows a strict dependency chain ensuring each epic builds upon the foundations established by its predecessors:

1. **EPIC 0 (Fundacao)** must be completed first -- it provides the monorepo, database, NestJS bootstrap, guards, and decorators that all other epics depend on.

2. **EPIC 1 (Auth & Convites)** depends on EPIC 0. It implements all authentication flows (agency login, doctor invite/login, password reset, refresh tokens) and the frontend auth pages. Every subsequent epic requires authenticated users.

3. **EPIC 2 (Agency Portal)** and **EPIC 3 (Onboarding)** can be developed in parallel after EPIC 1. EPIC 2 builds the agency admin dashboard, while EPIC 3 creates the doctor onboarding wizard.

4. **EPIC 4 (Pacientes)**, **EPIC 5 (Consultas)**, and **EPIC 8 (Config)** can be developed in parallel after EPIC 3 (they require a fully onboarded doctor). EPIC 4 handles patient CRUD, EPIC 5 handles appointment lifecycle, and EPIC 8 handles agent/profile settings.

5. **EPIC 6 (Notas/Docs)** depends on EPIC 4 (patients must exist to attach notes and documents).

6. **EPIC 7 (Booking)** depends on EPIC 5 (appointments must exist for the public booking flow to create them).

7. **EPIC 9 (Agente WhatsApp)** depends on EPIC 7 (booking services sao usados diretamente pelo agente in-chat) and EPIC 8 (agent settings configuram personalidade e regras do agente).

8. **EPIC 10 (Portal Paciente)** depends on EPIC 9 (a ativacao do portal e o envio do codigo ocorrem via EventEmitter2 → agente interno) and EPIC 5 (o evento `appointment.status_changed` com `newStatus='completed'` é emitido pelo EPIC 5 para disparar a geração do código de acesso).

9. **EPIC 11 (Polish & Deploy)** is the final epic -- it polishes the UI, adds Swagger docs, creates seed data, and deploys to production.

---

## Verification Checklist

After all epics are completed, verify the following:

- [ ] 1. `docker compose -f docker/docker-compose.dev.yml up -d` → PostgreSQL rodando
- [ ] 2. `pnpm --filter @nocrato/api dev` → NestJS na porta 3000
- [ ] 3. `pnpm --filter @nocrato/web dev` → Vite na porta 5173
- [ ] 4. Swagger: http://localhost:3000/api/docs → documentacao completa
- [ ] 5. Fluxo agency: login admin → dashboard → convidar doutor → email recebido
- [ ] 6. Fluxo doctor: aceitar convite → onboarding → dashboard → consultas → notas
- [ ] 7. Fluxo booking: agente gera token (interno) → paciente abre pagina → agenda → consulta criada
- [ ] 8. Fluxo patient: codigo de acesso → portal read-only
- [ ] 9. `pnpm run build` → compila tudo sem erros
- [ ] 10. `pnpm run typecheck` → zero erros
