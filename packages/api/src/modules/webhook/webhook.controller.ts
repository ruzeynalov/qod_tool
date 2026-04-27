import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  Logger,
  Req,
  ForbiddenException,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ConnectorRegistryService } from '../connector/connector-registry.service';
import { ConnectorService } from '../connector/connector.service';
import { verifyWebhookSignature } from '../../common/utils/webhook-signature';
import { FastifyRequest } from 'fastify';

@Public()
@Controller('api/v1/webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly registry: ConnectorRegistryService,
    private readonly connectorService: ConnectorService,
  ) {}

  @Post(':connectorType/:connectorConfigId')
  async handleWebhook(
    @Param('connectorType') connectorType: string,
    @Param('connectorConfigId', ParseUUIDPipe) connectorConfigId: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
    @Req() req: FastifyRequest,
  ) {
    this.logger.log(
      `Received webhook for ${connectorType} (config: ${connectorConfigId})`,
    );

    // Verify webhook signature — a webhook secret is required
    const config = await this.connectorService.findById(connectorConfigId);
    if (!config) {
      this.logger.warn(`Webhook rejected: connector config ${connectorConfigId} was not found`);
      throw new NotFoundException('Connector configuration not found');
    }

    const creds = config.credentials as Record<string, string> | null;
    const webhookSecret = creds?.webhook_secret || creds?.webhookSecret;
    if (!webhookSecret) {
      this.logger.warn(`Webhook rejected: no webhook_secret configured for config ${connectorConfigId}`);
      throw new ForbiddenException('Webhook secret not configured. Set webhook_secret in connector credentials.');
    }
    const signature = headers['x-hub-signature-256'] || headers['x-hub-signature'];
    const rawBody = JSON.stringify(body);
    if (!verifyWebhookSignature(rawBody, webhookSecret, signature)) {
      this.logger.warn(`Invalid webhook signature for config ${connectorConfigId}`);
      throw new ForbiddenException('Invalid webhook signature');
    }

    const connector = this.registry.get(connectorType);
    if (!connector) {
      this.logger.warn(`No connector registered for type: ${connectorType}`);
      return { received: true, processed: false, reason: 'unknown connector' };
    }

    if (!connector.onWebhookEvent) {
      return { received: true, processed: false, reason: 'webhooks not supported' };
    }

    try {
      await connector.onWebhookEvent(body, headers);
      return { received: true, processed: true };
    } catch (error: any) {
      this.logger.error(`Webhook processing failed: ${error.message}`);
      return { received: true, processed: false, reason: error.message };
    }
  }
}
