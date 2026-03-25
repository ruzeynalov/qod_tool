import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { UploadController } from './upload.controller';
import { ConnectorModule } from '../connector/connector.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [ConnectorModule, SyncModule],
  controllers: [WebhookController, UploadController],
})
export class WebhookModule {}
