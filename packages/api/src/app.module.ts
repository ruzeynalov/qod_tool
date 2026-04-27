import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ProjectModule } from './modules/project/project.module';
import { ConnectorModule } from './modules/connector/connector.module';
import { DemoModule } from './modules/demo/demo.module';
import { KPIModule } from './modules/kpi/kpi.module';
import { AggregationModule } from './modules/aggregation/aggregation.module';
import { SyncModule } from './modules/sync/sync.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AlertModule } from './modules/alert/alert.module';
import { NotificationModule } from './modules/notification/notification.module';
import { LiveModule } from './modules/live/live.module';
import { ExportModule } from './modules/export/export.module';
import { DataModule } from './modules/data/data.module';
import { HealthModule } from './modules/health/health.module';
import { AuthGuard } from './common/guards/auth.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    AuthModule,
    UserModule,
    ProjectModule,
    ConnectorModule,
    DemoModule,
    KPIModule,
    AggregationModule,
    SyncModule,
    WebhookModule,
    AlertModule,
    NotificationModule,
    LiveModule,
    ExportModule,
    DataModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
