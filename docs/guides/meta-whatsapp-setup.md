# Setup Meta WhatsApp Cloud API — Passo a Passo

Guia para configurar a integração oficial com WhatsApp via Meta Business Platform.
O código já está implementado (PR #16) — este guia cobre apenas o setup off-code.

**Tempo estimado:** 30-60 min de trabalho ativo + 1-7 dias de espera (verificação de empresa)

---

## Fase 1 — Meta Business Account (1-7 dias de espera)

### Passo 1: Criar Business Manager
- Acessar **business.facebook.com**
- Login com conta pessoal do Facebook
- Criar conta com:
  - Nome da empresa: razão social do CNPJ
  - Email comercial

### Passo 2: Informações do Negócio
- Configurações do Negócio → Informações do Negócio → Editar
- Endereço legal (do CNPJ), telefone, website, idioma PT-BR

### Passo 3: Verificação de empresa
- Segurança do Negócio → Verificação do Negócio → Iniciar verificação
- Documentos necessários:
  - Cartão CNPJ (baixar em receita.economia.gov.br)
  - Comprovante de endereço no nome da empresa (últimos 3 meses)
  - Pode pedir contrato social
- Upload PDFs → Meta responde em 1-7 dias úteis por email

---

## Fase 2 — App na Meta for Developers (30 min)

### Passo 4: Criar app
- Acessar **developers.facebook.com** → My Apps → Create App
- Tipo: **Business**
- Nome: **Nocrato Health**
- Associar ao Business Manager criado na fase 1

### Passo 5: Adicionar WhatsApp
- Dashboard do app → Add Product → **WhatsApp** → Set up

### Passo 6: Copiar App ID
- Topo da página do app: **App ID** (número tipo `1234567890123456`)
- Anotar: `META_APP_ID` / `VITE_META_APP_ID`

### Passo 7: Copiar App Secret
- App Settings → Basic → App Secret → Show
- Anotar: `META_APP_SECRET`

---

## Fase 3 — System User Token + Webhook (20 min)

### Passo 8: Criar System User
- business.facebook.com → Configurações do Negócio → Usuários do Sistema → Adicionar
- Nome: **Nocrato API**, role: **Admin**
- Gerar Token:
  - App: selecionar o app Nocrato Health
  - Permissões: `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management`
  - Expiração: **Never** (permanente)
- Anotar: `META_SYSTEM_USER_TOKEN` (aparece só uma vez!)

### Passo 9: Gerar Webhook Verify Token
```bash
openssl rand -hex 32
```
- Anotar: `META_WEBHOOK_VERIFY_TOKEN`

### Passo 10: Configurar webhook na Meta
- App → WhatsApp → Configuration → Webhook → Edit
- Callback URL: `https://app.nocrato.com/api/v1/agent/webhook/cloud`
  - Em dev: usar `ngrok http 3000` e colocar a URL do ngrok
- Verify token: valor do passo 9
- Verify and Save → subscrever ao campo **messages**

### Passo 11: Criar Embedded Signup Config
- App → WhatsApp → Embedded Signup → Create Configuration
- Nome: **Nocrato Doctor Connection**
- Solutions: selecionar o business
- Copiar **Config ID**
- Anotar: `META_EMBEDDED_SIGNUP_CONFIG_ID` / `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID`

---

## Variáveis de ambiente

Após completar todas as etapas, preencher no `.env`:

```env
# Backend
META_APP_ID=1234567890123456
META_APP_SECRET=a1b2c3d4e5f6...
META_SYSTEM_USER_TOKEN=EAAxxxxxxxxxx...
META_WEBHOOK_VERIFY_TOKEN=<valor do openssl>
META_GRAPH_API_VERSION=v19.0
META_EMBEDDED_SIGNUP_CONFIG_ID=987654321098765

# Frontend (apps/web/.env)
VITE_META_APP_ID=1234567890123456
VITE_META_EMBEDDED_SIGNUP_CONFIG_ID=987654321098765
```

---

## Teste mínimo

1. Rodar migration: `pnpm --filter @nocrato/api migrate`
2. Preencher vars no `.env`
3. Reiniciar API
4. Portal do doutor → /doctor/whatsapp → "Conectar via Meta"
5. Popup abre → usar número pessoal de teste
6. Enviar mensagem pro número conectado → bot deve responder

---

## Troubleshooting

| Problema | Solução |
|---|---|
| Verificação rejeitada | Email da Meta explica — geralmente endereço precisa estar no nome da empresa |
| Webhook "Unable to verify" | URL precisa ser HTTPS pública. Dev: usar ngrok |
| Embedded Signup não abre | Verificar VITE_META_APP_ID e modo do app (precisa estar **Live** em Settings → Basic) |
| Token expirou | System User Token com "Never" não expira. Se deu problema, gerar novo |
