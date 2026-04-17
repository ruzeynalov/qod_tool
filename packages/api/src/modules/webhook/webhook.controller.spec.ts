import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { ConnectorRegistryService } from '../connector/connector-registry.service';
import { ConnectorService } from '../connector/connector.service';

describe('WebhookController', () => {
  const connectorId = '11111111-1111-4111-8111-111111111111';

  function createController(config: any) {
    const connector = {
      onWebhookEvent: vi.fn().mockResolvedValue(undefined),
    };

    const registry = {
      get: vi.fn().mockReturnValue(connector),
    };

    const connectorService = {
      findById: vi.fn().mockResolvedValue(config),
    };

    const controller = new WebhookController(
      registry as unknown as ConnectorRegistryService,
      connectorService as unknown as ConnectorService,
    );

    return { controller, registry, connectorService, connector };
  }

  it('rejects unknown connector config IDs before webhook processing', async () => {
    const { controller, connector } = createController(null);

    await expect(
      controller.handleWebhook(
        'github',
        connectorId,
        { hello: 'world' },
        { 'x-hub-signature-256': 'sha256=fake' },
        {} as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(connector.onWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects requests when webhook secret is missing', async () => {
    const { controller } = createController({
      id: connectorId,
      credentials: {},
    });

    await expect(
      controller.handleWebhook(
        'github',
        connectorId,
        { hello: 'world' },
        { 'x-hub-signature-256': 'sha256=fake' },
        {} as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
