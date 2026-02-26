interface PasswordResetTemplateParams {
  resetUrl: string
  userType: 'agency' | 'doctor'
}

export function passwordResetTemplate({ resetUrl, userType }: PasswordResetTemplateParams): string {
  const title = userType === 'agency' ? 'Redefinição de senha — Nocrato Health' : 'Redefinição de senha do portal médico'
  const description =
    userType === 'agency'
      ? 'Recebemos uma solicitação para redefinir a senha da sua conta na <strong>Nocrato Health</strong>.'
      : 'Recebemos uma solicitação para redefinir a senha do seu <strong>portal médico Nocrato Health</strong>.'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#0f172a;padding:24px 40px;">
              <span style="color:#ffffff;font-size:20px;font-weight:bold;">Nocrato Health</span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;">Redefinir senha</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                ${description}
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong>1 hora</strong>.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:6px;background:#0f172a;">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;">
                      Redefinir senha
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
                Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
              </p>
              <p style="margin:4px 0 0;font-size:13px;color:#0f172a;word-break:break-all;">
                ${resetUrl}
              </p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;" />
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Se você não solicitou a redefinição de senha, ignore este e-mail — sua senha permanece a mesma.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
