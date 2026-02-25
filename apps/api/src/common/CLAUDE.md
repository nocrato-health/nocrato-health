# common/ — Guards, Decorators, Filters e Pipes

## Responsabilidade

Infraestrutura transversal compartilhada por todos os módulos NestJS: guards de autenticação/autorização, decorators de extração de contexto JWT, filtro global de exceções e pipe de validação Zod.

## Arquivos principais

| Arquivo | Responsabilidade |
|---------|-----------------|
| `guards/jwt-auth.guard.ts` | Valida JWT Bearer token. Retorna 401 se ausente/inválido. Estende `AuthGuard('jwt')`. |
| `guards/roles.guard.ts` | RBAC: verifica se `user.role` está na lista definida por `@Roles()`. Retorna 403. |
| `guards/tenant.guard.ts` | Verifica se o JWT contém `tenantId`. Obrigatório em todas as rotas do portal do doutor. |
| `decorators/roles.decorator.ts` | `@Roles('agency_admin')` — define roles exigidas para o handler/controller. |
| `decorators/current-user.decorator.ts` | `@CurrentUser()` — extrai `JwtPayload` do `request.user` (injetado pelo Passport). |
| `decorators/tenant.decorator.ts` | `@TenantId()` — extrai `tenantId` do JWT payload. Usar em todos endpoints tenant-scoped. |
| `filters/http-exception.filter.ts` | Filtro global de `HttpException`. Retorna `{ statusCode, message, timestamp }`. |
| `pipes/zod-validation.pipe.ts` | `ZodValidationPipe(schema)` — valida body/query contra um `ZodSchema`. Lança 400 em falha. |

## Padrão de uso

```typescript
// Rotas do portal do doutor (auth completo)
@Controller('api/v1/doctor/patients')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('doctor')
export class PatientsController {
  @Get()
  list(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.patientsService.findAll(tenantId)
  }
}

// Rotas da agência (sem TenantGuard — agency members não têm tenantId no token)
@Controller('api/v1/agency/members')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('agency_admin')
export class AgencyMembersController { ... }

// Validação com Zod
@Post()
create(@Body(new ZodValidationPipe(CreatePatientSchema)) dto: CreatePatientDto) { ... }
```

## Regras de negócio

- `TenantGuard` deve sempre ser aplicado APÓS `JwtAuthGuard` — depende de `request.user` já populado pelo Passport
- `RolesGuard` sem `@Roles()` no handler/controller deixa passar qualquer role autenticada
- `@TenantId()` retorna `undefined` para agency members (não têm `tenantId` no token) — sempre proteger com `TenantGuard` antes
- **Nunca** aceitar `tenantId` do body do request — sempre extrair do JWT via `@TenantId()`
- O filtro de exceções está registrado globalmente no `main.ts` via `app.useGlobalFilters()`

## O que NÃO pertence aqui

- Lógica de negócio (pertence ao módulo de domínio)
- Estratégia Passport JWT (pertence a `modules/auth/strategies/`)
- Interceptors de event-log (serão criados aqui em `interceptors/` no Epic 5+)
- Validação de token de booking ou código de acesso do paciente (pertence aos módulos `booking/` e `patient/`)
