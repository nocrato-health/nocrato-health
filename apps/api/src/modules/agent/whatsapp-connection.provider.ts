export const CLOUD_API_CONNECTION_PROVIDER = Symbol('CLOUD_API_CONNECTION_PROVIDER')

// ---------------------------------------------------------------------------
// Interface para provedores baseados em Embedded Signup (Cloud API)
// ---------------------------------------------------------------------------

export interface SignupCodeResult {
  phoneNumberId: string
  wabaId: string
  displayPhoneNumber: string
  verifiedName: string
}

export interface SignupBasedConnectionProvider {
  exchangeSignupCode(code: string): Promise<SignupCodeResult>
}
