import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ThrottlerModule } from '@nestjs/throttler'
import { DatabaseModule } from './database/database.module'
import { EventLogModule } from './modules/event-log/event-log.module'
import { AuthModule } from './modules/auth/auth.module'
import { InviteModule } from './modules/invite/invite.module'
import { AgencyModule } from './modules/agency/agency.module'
import { DoctorModule } from './modules/doctor/doctor.module'
import { PatientModule } from './modules/patient/patient.module'
import { AppointmentModule } from './modules/appointment/appointment.module'
import { ClinicalNoteModule } from './modules/clinical-note/clinical-note.module'
import { DocumentModule } from './modules/document/document.module'
import { BookingModule } from './modules/booking/booking.module'
import { ConsentModule } from './modules/consent/consent.module'
import { AgentModule } from './modules/agent/agent.module'
import { HealthController } from './modules/health/health.controller'

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    EventLogModule,
    AuthModule,
    InviteModule,
    AgencyModule,
    DoctorModule,
    PatientModule,
    AppointmentModule,
    ClinicalNoteModule,
    DocumentModule,
    BookingModule,
    ConsentModule,
    AgentModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
