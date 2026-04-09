import { redactPii, redactPiiInString } from './redact-pii'

describe('redactPiiInString', () => {
  it('mascara email mantendo apenas a primeira letra do user e nada do domínio', () => {
    expect(redactPiiInString('Login from joao@silva.com.br')).toBe('Login from j***@***')
  })

  it('mascara CPF com pontuação completa', () => {
    expect(redactPiiInString('CPF do paciente 123.456.789-00 inválido')).toBe(
      'CPF do paciente ***.***.***-** inválido',
    )
  })

  it('mascara CPF com pontuação parcial (só hífen)', () => {
    expect(redactPiiInString('cpf 123456789-00 inválido')).toBe('cpf ***.***.***-** inválido')
  })

  it('mascara 11 dígitos puros como telefone (cobre tanto CPF quanto celular sem formatação)', () => {
    // Ambíguo: 11 dígitos puros podem ser CPF ou celular. Mascaramos como
    // phone (****XXXX) — ambos cumprem LGPD e o formato preserva debug.
    expect(redactPiiInString('cpf=12345678900')).toContain('****8900')
  })

  it('mascara telefone BR formatado', () => {
    expect(redactPiiInString('Phone (11) 99876-5432 not reachable')).toContain('****5432')
  })

  it('mascara telefone BR sem formatação', () => {
    expect(redactPiiInString('phone=11998765432')).toContain('****5432')
  })

  it('mascara telefone com prefixo +55', () => {
    expect(redactPiiInString('+5511998765432')).toContain('****5432')
  })

  it('mascara JWT', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    expect(redactPiiInString(`Bearer ${jwt}`)).toBe('Bearer <jwt:redacted>')
  })

  it('mascara token hex de 64 chars (booking token / portal_access)', () => {
    const token = 'a'.repeat(64)
    expect(redactPiiInString(`token=${token}`)).toBe('token=<token:redacted>')
  })

  it('não toca em strings curtas (<5 chars)', () => {
    expect(redactPiiInString('hi')).toBe('hi')
  })

  it('não mascara IDs UUID (sem ser PII)', () => {
    const uuid = 'b8c2e1a4-1234-5678-9abc-def012345678'
    expect(redactPiiInString(`patientId=${uuid}`)).toBe(`patientId=${uuid}`)
  })
})

describe('redactPii (deep)', () => {
  it('redata chave email no nível raiz', () => {
    expect(redactPii({ email: 'joao@silva.com', tenant: 'abc' })).toEqual({
      email: '[REDACTED]',
      tenant: 'abc',
    })
  })

  it('redata chaves sensíveis em qualquer profundidade', () => {
    const input = {
      action: 'login',
      user: { id: 'u1', email: 'a@b.com', meta: { phone: '11999998888' } },
    }
    expect(redactPii(input)).toEqual({
      action: 'login',
      user: { id: 'u1', email: '[REDACTED]', meta: { phone: '[REDACTED]' } },
    })
  })

  it('redata snake_case e camelCase de forma equivalente', () => {
    expect(redactPii({ password_hash: 'x', accessToken: 'y' })).toEqual({
      password_hash: '[REDACTED]',
      accessToken: '[REDACTED]',
    })
  })

  it('redata array de objetos com patient_name (chave específica de pessoa)', () => {
    const input = {
      patients: [
        { patient_name: 'João', id: '1' },
        { patient_name: 'Maria', id: '2' },
      ],
    }
    expect(redactPii(input)).toEqual({
      patients: [
        { patient_name: '[REDACTED]', id: '1' },
        { patient_name: '[REDACTED]', id: '2' },
      ],
    })
  })

  it('NÃO redata "name" genérico (os.name, server_name, event.name) — só variantes específicas de pessoa', () => {
    expect(redactPii({ os: { name: 'Linux', version: '22.04' }, server_name: 'pop-os' })).toEqual({
      os: { name: 'Linux', version: '22.04' },
      server_name: 'pop-os',
    })
  })

  it('aplica regex em string interpolada como valor de chave não sensível', () => {
    expect(redactPii({ message: 'Login from joao@silva.com' })).toEqual({
      message: 'Login from j***@***',
    })
  })

  it('extrai message e stack de Error mantendo nome', () => {
    const err = new Error('Falha ao notificar paciente joao@x.com')
    const out = redactPii(err) as { name: string; message: string }
    expect(out.name).toBe('Error')
    expect(out.message).toBe('Falha ao notificar paciente j***@***')
  })

  it('preserva primitivos não-string (número, boolean, null)', () => {
    expect(redactPii({ count: 42, active: true, parent: null })).toEqual({
      count: 42,
      active: true,
      parent: null,
    })
  })

  it('lida com referência circular sem stack overflow', () => {
    const a: Record<string, unknown> = { patient_name: 'João' }
    a.self = a
    const out = redactPii(a) as Record<string, unknown>
    expect(out.patient_name).toBe('[REDACTED]')
    expect(out.self).toBe('[Circular]')
  })

  it('não muta o objeto original', () => {
    const input = { email: 'a@b.com' }
    redactPii(input)
    expect(input.email).toBe('a@b.com')
  })

  it('redata cancellation_reason (texto livre, pode ter PII)', () => {
    expect(
      redactPii({ event_type: 'appointment.cancelled', cancellation_reason: 'Paciente joão' }),
    ).toEqual({
      event_type: 'appointment.cancelled',
      cancellation_reason: '[REDACTED]',
    })
  })

  it('redata content (clinical_notes inline)', () => {
    expect(redactPii({ noteId: 'n1', content: 'Paciente refere dor lombar' })).toEqual({
      noteId: 'n1',
      content: '[REDACTED]',
    })
  })
})
