import { Module } from '@nestjs/common'
import { DatabaseModule } from './database/database.module'
import { AuthModule } from './modules/auth/auth.module'
import { InviteModule } from './modules/invite/invite.module'
import { AgencyModule } from './modules/agency/agency.module'
import { DoctorModule } from './modules/doctor/doctor.module'
import { PatientModule } from './modules/patient/patient.module'
import { HealthController } from './modules/health/health.controller'

@Module({
  imports: [DatabaseModule, AuthModule, InviteModule, AgencyModule, DoctorModule, PatientModule],
  controllers: [HealthController],
})
export class AppModule {}
