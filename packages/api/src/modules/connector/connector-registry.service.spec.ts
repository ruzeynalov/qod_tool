import { ConnectorRegistryService } from './connector-registry.service';
import { IQODConnector, ConnectorConfig, AuthResult } from '@qod/shared';

const createMockConnector = (name: string): IQODConnector => ({
  name,
  type: 'tms',
  authenticate: vi.fn().mockResolvedValue({ success: true }),
  testConnection: vi.fn().mockResolvedValue({ success: true }),
});

describe('ConnectorRegistryService', () => {
  let registry: ConnectorRegistryService;

  beforeEach(() => {
    registry = new ConnectorRegistryService();
  });

  describe('register', () => {
    it('should register a connector by its name', () => {
      const connector = createMockConnector('GITHUB');

      registry.register(connector);

      expect(registry.get('GITHUB')).toBe(connector);
    });
  });

  describe('get', () => {
    it('should return undefined for unregistered connector', () => {
      expect(registry.get('UNKNOWN')).toBeUndefined();
    });

    it('should return the registered connector by name', () => {
      const connector = createMockConnector('TESTRAIL');
      registry.register(connector);

      expect(registry.get('TESTRAIL')).toBe(connector);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no connectors registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered connectors', () => {
      const github = createMockConnector('GITHUB');
      const testrail = createMockConnector('TESTRAIL');

      registry.register(github);
      registry.register(testrail);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(github);
      expect(all).toContain(testrail);
    });
  });
});
