import { Controller, Get, Header } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidade — Nocrato Health</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 0 auto; padding: 2rem 1rem; color: #1a1a1a; line-height: 1.6; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #0ea5e9; padding-bottom: 0.5rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; color: #0369a1; }
    ul { padding-left: 1.5rem; }
    .contact { background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 1rem; margin-top: 2rem; }
    .version { color: #666; font-size: 0.85rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>Política de Privacidade</h1>
  <p>A <strong>Nocrato Health</strong> é uma plataforma de gestão de consultórios médicos que trata dados pessoais e dados pessoais sensíveis (saúde) conforme a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).</p>

  <h2>1. Dados coletados</h2>
  <ul>
    <li><strong>Identificação:</strong> nome, telefone, e-mail, CPF ou RG (criptografado), data de nascimento.</li>
    <li><strong>Saúde:</strong> notas clínicas, documentos médicos (receitas, exames, atestados).</li>
    <li><strong>Técnicos:</strong> endereço IP, user-agent (apenas no momento do consentimento).</li>
  </ul>

  <h2>2. Finalidade do tratamento</h2>
  <ul>
    <li>Agendamento de consultas via WhatsApp e link de booking.</li>
    <li>Gestão do prontuário eletrônico pelo médico responsável.</li>
    <li>Envio de notificações sobre consultas agendadas, canceladas ou reagendadas.</li>
    <li>Acesso ao portal do paciente (histórico de consultas e documentos).</li>
  </ul>

  <h2>3. Base legal</h2>
  <p>O tratamento de dados pessoais é baseado no <strong>consentimento do titular</strong> (LGPD Art. 7º, I e Art. 11, I). Dados de saúde são tratados exclusivamente para prestação de serviços de saúde, sob responsabilidade de profissional habilitado (Art. 11, II, f).</p>

  <h2>4. Compartilhamento</h2>
  <p>Seus dados <strong>não são compartilhados com terceiros</strong>. O processamento de linguagem natural (agente WhatsApp) utiliza API da OpenAI, que processa apenas o conteúdo das mensagens de chat — sem acesso ao prontuário, documentos ou dados de identificação.</p>

  <h2>5. Segurança</h2>
  <ul>
    <li>Documentos de identificação e notas clínicas são <strong>criptografados em repouso</strong> (AES-256).</li>
    <li>Backups são criptografados com GPG antes do armazenamento.</li>
    <li>Acesso ao banco de dados restrito ao servidor (não exposto publicamente).</li>
    <li>Logs do sistema não contêm dados pessoais identificáveis (PII redacted).</li>
  </ul>

  <h2>6. Retenção</h2>
  <p>Dados são mantidos enquanto houver relação ativa entre paciente e médico. Registros de auditoria (event_log) são anonimizados após 90 dias. Dados de saúde podem ser retidos conforme obrigações do CFM/CRM, mesmo após solicitação de exclusão.</p>

  <h2>7. Direitos do titular (Art. 18)</h2>
  <p>Você tem direito a:</p>
  <ul>
    <li>Acessar seus dados pessoais (portal do paciente).</li>
    <li>Solicitar exclusão dos dados (botão no portal do paciente).</li>
    <li>Revogar consentimento a qualquer momento.</li>
    <li>Solicitar informações sobre o tratamento dos seus dados.</li>
  </ul>
  <p><strong>Nota:</strong> A exclusão de dados de saúde pode estar sujeita a obrigações legais de retenção do Conselho Federal de Medicina (CFM). Nesses casos, o médico analisará individualmente.</p>

  <h2>8. Encarregado (DPO)</h2>
  <div class="contact">
    <p><strong>Pedro Vidal</strong><br>
    E-mail: pedro.vidal2608@gmail.com<br>
    Responsável pelo tratamento de dados pessoais na Nocrato Health.</p>
  </div>

  <p class="version">Versão 1.0 — Última atualização: abril de 2026.</p>
</body>
</html>`

/**
 * Rota pública que serve a política de privacidade como HTML.
 * Sem auth guards — acessível por qualquer pessoa.
 */
@ApiTags('Public')
@Controller()
export class PrivacyPolicyController {
  @Get('politica-de-privacidade')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Página pública da política de privacidade (LGPD)' })
  @ApiResponse({ status: 200, description: 'HTML da política de privacidade' })
  getPrivacyPolicy(): string {
    return PRIVACY_POLICY_HTML
  }
}
