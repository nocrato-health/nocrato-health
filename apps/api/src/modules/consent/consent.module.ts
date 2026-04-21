import { Global, Module } from '@nestjs/common'
import { ConsentService } from './consent.service'
import { PrivacyPolicyController } from './privacy-policy.controller'

// @Global() porque booking/, patient/, e agent/ precisam registrar consentimento
// sem importar o módulo explicitamente em cada um.
@Global()
@Module({
  controllers: [PrivacyPolicyController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
