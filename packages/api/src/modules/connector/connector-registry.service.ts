import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { IQODConnector } from '@qod/shared';
import { TestRailConnector } from '../../connectors/testrail/testrail.connector';
import { GitHubConnector } from '../../connectors/github/github.connector';
import { JiraConnector } from '../../connectors/jira/jira.connector';
import { JiraStoriesConnector } from '../../connectors/jira-stories/jira-stories.connector';

@Injectable()
export class ConnectorRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ConnectorRegistryService.name);
  private readonly connectors = new Map<string, IQODConnector>();

  async onModuleInit() {
    const connectors = [
      () => new TestRailConnector(),
      () => new GitHubConnector(),
      () => new JiraConnector(),
      () => new JiraStoriesConnector(),
    ];

    for (const factory of connectors) {
      try {
        this.register(factory());
      } catch (error) {
        this.logger.error(`Failed to register connector: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.logger.log(`Registered ${this.connectors.size} connectors: ${[...this.connectors.keys()].join(', ')}`);
  }

  register(connector: IQODConnector): void {
    this.connectors.set(connector.name, connector);
  }

  get(name: string): IQODConnector | undefined {
    return this.connectors.get(name);
  }

  getAll(): IQODConnector[] {
    return Array.from(this.connectors.values());
  }
}
