import { Module } from '@nestjs/common'
import { DatabaseModule } from './database/database.module'
import { AuthModule } from './modules/auth/auth.module'
import { InviteModule } from './modules/invite/invite.module'
import { HealthController } from './modules/health/health.controller'

@Module({
  imports: [DatabaseModule, AuthModule, InviteModule],
  controllers: [HealthController],
})
export class AppModule {}
