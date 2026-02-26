import { Module } from '@nestjs/common'
import { InviteService } from './invite.service'
import { InviteController } from './invite.controller'
import { EmailModule } from '@/modules/email/email.module'

@Module({
  imports: [EmailModule],
  providers: [InviteService],
  controllers: [InviteController],
  exports: [InviteService],
})
export class InviteModule {}
