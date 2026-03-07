import { Module } from '@nestjs/common'
import { AgentController } from './agent.controller'
import { AgentService } from './agent.service'
import { WhatsAppService } from './whatsapp.service'

// DatabaseModule e EventLogModule são @Global() — não reimportar aqui
@Module({
  controllers: [AgentController],
  providers: [AgentService, WhatsAppService],
  exports: [AgentService, WhatsAppService],
})
export class AgentModule {}
