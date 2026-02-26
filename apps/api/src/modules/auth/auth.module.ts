import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { env } from '@/config/env'
import { EmailModule } from '@/modules/email/email.module'
import { JwtStrategy } from './strategies/jwt.strategy'
import { AgencyAuthService } from './agency-auth.service'
import { AgencyAuthController } from './agency-auth.controller'
import { DoctorAuthService } from './doctor-auth.service'
import { DoctorAuthController } from './doctor-auth.controller'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.JWT_EXPIRES_IN },
    }),
    EmailModule,
  ],
  providers: [JwtStrategy, AgencyAuthService, DoctorAuthService],
  controllers: [AgencyAuthController, DoctorAuthController],
  exports: [JwtModule, PassportModule, AgencyAuthService, DoctorAuthService],
})
export class AuthModule {}
