# Skill: Health Check do Projeto

Verifica a saúde geral do projeto após a finalização de qualquer tarefa significativa.
Detecta problemas de TypeScript, testes quebrados, console.logs esquecidos, e diretórios sem CLAUDE.md.

---

## Quando usar

- Após concluir uma User Story ou qualquer entrega de código
- Antes de propor um commit
- Quando o usuário invocar `/health-check` explicitamente

---

## Protocolo de execução

Execute os passos abaixo em ordem. Se qualquer passo falhar, **pare e reporte antes de avançar**.

### 1. TypeScript — API

```bash
pnpm --filter @nocrato/api exec tsc --noEmit
```

Esperado: nenhuma saída (zero erros).

### 2. TypeScript — Web

```bash
pnpm --filter @nocrato/web exec tsc --noEmit
```

Esperado: nenhuma saída (zero erros).

### 3. Testes — API

```bash
pnpm --filter @nocrato/api test 2>&1 | tail -10
```

Esperado: `Tests: N passed, N total` sem falhas.

### 4. console.log em código de produção

Busca `console.log` em arquivos de produção (exclui spec e dist):

```bash
grep -r "console\.log" apps/api/src --include="*.ts" --exclude="*.spec.ts" -l
grep -r "console\.log" apps/web/src --include="*.tsx" --include="*.ts" -l
```

Esperado: nenhum resultado.

### 5. Diretórios sem CLAUDE.md

Verifica se algum diretório obrigatório está sem documentação:

```bash
for dir in \
  apps/api/src/modules/*/  \
  apps/api/src/common/     \
  apps/api/src/database/   \
  apps/api/src/config/     \
  apps/web/src/routes/     \
  apps/web/src/components/ \
  apps/web/src/lib/        \
  apps/web/src/hooks/; do
  [ -d "$dir" ] && [ ! -f "${dir}CLAUDE.md" ] && echo "SEM CLAUDE.md: $dir"
done
```

Esperado: nenhum resultado. Se houver diretório sem CLAUDE.md, criar antes de continuar.

### 6. `any` explícito em TypeScript

```bash
grep -r ": any" apps/api/src --include="*.ts" --exclude="*.spec.ts" -l
grep -r ": any" apps/web/src --include="*.ts" --include="*.tsx" -l
```

Esperado: nenhum resultado (usar `unknown` + type guards).

---

## Formato do relatório

Após executar todos os passos, apresente:

```
## Health Check — [data/hora]

| Verificação           | Status  | Detalhes                  |
|-----------------------|---------|---------------------------|
| TS API                | ✅ / ❌ | —                         |
| TS Web                | ✅ / ❌ | —                         |
| Testes API            | ✅ / ❌ | N passed / N failed       |
| console.log           | ✅ / ❌ | arquivos afetados (se ❌)  |
| CLAUDE.md faltando    | ✅ / ❌ | diretórios (se ❌)         |
| any explícito         | ✅ / ❌ | arquivos afetados (se ❌)  |

### Resultado geral: ✅ SAUDÁVEL / ⚠️ ATENÇÃO / 🚫 BLOQUEANTE
```

- **✅ SAUDÁVEL** — todos os itens passaram
- **⚠️ ATENÇÃO** — há `any` ou `console.log` isolados (não bloqueia commit, mas registrar)
- **🚫 BLOQUEANTE** — erros de TypeScript, testes falhando, ou CLAUDE.md faltando → não commitar até resolver
