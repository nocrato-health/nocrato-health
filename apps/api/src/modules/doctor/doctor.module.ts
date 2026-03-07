import { Module } from '@nestjs/common'
import { OnboardingController } from './onboarding.controller'
import { OnboardingService } from './onboarding.service'
import { AgentSettingsController } from './agent-settings.controller'
import { AgentSettingsService } from './agent-settings.service'

// DatabaseModule é @Global() — o provider KNEX já está disponível globalmente
// sem precisar reimportar aqui.
@Module({
  controllers: [OnboardingController, AgentSettingsController],
  providers: [OnboardingService, AgentSettingsService],
})
export class DoctorModule {}
