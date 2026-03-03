import { Module } from '@nestjs/common'
import { DatabaseModule } from './database/database.module'
import { AuthModule } from './modules/auth/auth.module'
import { InviteModule } from './modules/invite/invite.module'
import { AgencyModule } from './modules/agency/agency.module'
import { DoctorModule } from './modules/doctor/doctor.module'
import { PatientModule } from './modules/patient/patient.module'
import { AppointmentModule } from './modules/appointment/appointment.module'
import { ClinicalNoteModule } from './modules/clinical-note/clinical-note.module'
import { DocumentModule } from './modules/document/document.module'
import { HealthController } from './modules/health/health.controller'

@Module({
  imports: [DatabaseModule, AuthModule, InviteModule, AgencyModule, DoctorModule, PatientModule, AppointmentModule, ClinicalNoteModule, DocumentModule],
  controllers: [HealthController],
})
export class AppModule {}
