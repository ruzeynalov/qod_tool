import { LiveGateway } from './live.gateway';
import { Logger } from '@nestjs/common';

// ── Mock socket factory ──────────────────────────────────────────

interface MockSocket {
  id: string;
  emit: ReturnType<typeof vi.fn>;
}

function createMockSocket(id: string, authenticated = true): MockSocket & { handshake: any; disconnect: ReturnType<typeof vi.fn> } {
  return {
    id,
    emit: vi.fn(),
    disconnect: vi.fn(),
    handshake: authenticated
      ? { auth: { token: 'valid-token' }, headers: {} }
      : { auth: {}, headers: {} },
  };
}

function createMockAuthService() {
  return {
    verifyToken: vi.fn().mockReturnValue({ userId: 'user-1', email: 'test@test.com', role: 'ADMIN', orgId: 'org-1' }),
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('LiveGateway', () => {
  let gateway: LiveGateway;
  let authService: ReturnType<typeof createMockAuthService>;

  beforeEach(() => {
    authService = createMockAuthService();
    gateway = new LiveGateway(authService as any);
    // Suppress log output during tests
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── handleConnection ──────────────────────────────────────────

  describe('handleConnection', () => {
    it('should log when a client connects', () => {
      const client = createMockSocket('client-1');
      const logSpy = vi.spyOn(Logger.prototype, 'log');

      gateway.handleConnection(client as any);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('client-1'),
      );
    });
  });

  // ── handleSubscribe ───────────────────────────────────────────

  describe('handleSubscribe', () => {
    it('should add client to project room and return acknowledgment', () => {
      const client = createMockSocket('client-1');

      const result = gateway.handleSubscribe(client as any, {
        projectId: 'project-abc',
      });

      expect(result).toEqual({
        event: 'subscribed',
        data: { projectId: 'project-abc' },
      });
    });

    it('should allow multiple clients to subscribe to the same project', () => {
      const client1 = createMockSocket('client-1');
      const client2 = createMockSocket('client-2');

      gateway.handleSubscribe(client1 as any, { projectId: 'project-abc' });
      gateway.handleSubscribe(client2 as any, { projectId: 'project-abc' });

      // Both clients should receive broadcasts (tested via broadcastRunUpdate)
      const runUpdate = {
        id: 'run-1',
        status: 'RUNNING',
        passedCount: 5,
        failedCount: 1,
        totalTests: 10,
        progress: 60,
      };

      gateway.broadcastRunUpdate('project-abc', runUpdate);

      expect(client1.emit).toHaveBeenCalledWith('run:update', runUpdate);
      expect(client2.emit).toHaveBeenCalledWith('run:update', runUpdate);
    });

    it('should allow a client to subscribe to multiple projects', () => {
      const client = createMockSocket('client-1');

      gateway.handleSubscribe(client as any, { projectId: 'project-abc' });
      gateway.handleSubscribe(client as any, { projectId: 'project-def' });

      const update1 = { id: 'run-1', status: 'RUNNING', passedCount: 0, failedCount: 0, totalTests: 5, progress: 0 };
      const update2 = { id: 'run-2', status: 'RUNNING', passedCount: 3, failedCount: 0, totalTests: 5, progress: 60 };

      gateway.broadcastRunUpdate('project-abc', update1);
      gateway.broadcastRunUpdate('project-def', update2);

      expect(client.emit).toHaveBeenCalledWith('run:update', update1);
      expect(client.emit).toHaveBeenCalledWith('run:update', update2);
    });
  });

  // ── handleUnsubscribe ─────────────────────────────────────────

  describe('handleUnsubscribe', () => {
    it('should remove client from project room', () => {
      const client = createMockSocket('client-1');

      gateway.handleSubscribe(client as any, { projectId: 'project-abc' });
      gateway.handleUnsubscribe(client as any, { projectId: 'project-abc' });

      const runUpdate = {
        id: 'run-1',
        status: 'RUNNING',
        passedCount: 0,
        failedCount: 0,
        totalTests: 10,
        progress: 0,
      };

      gateway.broadcastRunUpdate('project-abc', runUpdate);

      expect(client.emit).not.toHaveBeenCalled();
    });

    it('should return acknowledgment', () => {
      const client = createMockSocket('client-1');

      gateway.handleSubscribe(client as any, { projectId: 'project-abc' });
      const result = gateway.handleUnsubscribe(client as any, {
        projectId: 'project-abc',
      });

      expect(result).toEqual({
        event: 'unsubscribed',
        data: { projectId: 'project-abc' },
      });
    });

    it('should not affect other clients in the same room', () => {
      const client1 = createMockSocket('client-1');
      const client2 = createMockSocket('client-2');

      gateway.handleSubscribe(client1 as any, { projectId: 'project-abc' });
      gateway.handleSubscribe(client2 as any, { projectId: 'project-abc' });

      gateway.handleUnsubscribe(client1 as any, { projectId: 'project-abc' });

      const runUpdate = {
        id: 'run-1',
        status: 'RUNNING',
        passedCount: 0,
        failedCount: 0,
        totalTests: 10,
        progress: 0,
      };

      gateway.broadcastRunUpdate('project-abc', runUpdate);

      expect(client1.emit).not.toHaveBeenCalled();
      expect(client2.emit).toHaveBeenCalledWith('run:update', runUpdate);
    });

    it('should handle unsubscribing from a room the client was never in', () => {
      const client = createMockSocket('client-1');

      // Should not throw
      const result = gateway.handleUnsubscribe(client as any, {
        projectId: 'non-existent',
      });

      expect(result).toEqual({
        event: 'unsubscribed',
        data: { projectId: 'non-existent' },
      });
    });
  });

  // ── broadcastRunUpdate ────────────────────────────────────────

  describe('broadcastRunUpdate', () => {
    it('should emit run:update to all clients in the project room', () => {
      const client1 = createMockSocket('client-1');
      const client2 = createMockSocket('client-2');

      gateway.handleSubscribe(client1 as any, { projectId: 'project-abc' });
      gateway.handleSubscribe(client2 as any, { projectId: 'project-abc' });

      const runUpdate = {
        id: 'run-42',
        status: 'RUNNING',
        passedCount: 7,
        failedCount: 2,
        totalTests: 20,
        progress: 45,
      };

      gateway.broadcastRunUpdate('project-abc', runUpdate);

      expect(client1.emit).toHaveBeenCalledWith('run:update', runUpdate);
      expect(client2.emit).toHaveBeenCalledWith('run:update', runUpdate);
    });

    it('should not emit to clients in different rooms', () => {
      const clientA = createMockSocket('client-a');
      const clientB = createMockSocket('client-b');

      gateway.handleSubscribe(clientA as any, { projectId: 'project-abc' });
      gateway.handleSubscribe(clientB as any, { projectId: 'project-xyz' });

      const runUpdate = {
        id: 'run-1',
        status: 'RUNNING',
        passedCount: 0,
        failedCount: 0,
        totalTests: 10,
        progress: 0,
      };

      gateway.broadcastRunUpdate('project-abc', runUpdate);

      expect(clientA.emit).toHaveBeenCalledWith('run:update', runUpdate);
      expect(clientB.emit).not.toHaveBeenCalled();
    });

    it('should do nothing if no clients are in the room', () => {
      // Should not throw
      expect(() => {
        gateway.broadcastRunUpdate('empty-project', {
          id: 'run-1',
          status: 'RUNNING',
          passedCount: 0,
          failedCount: 0,
          totalTests: 0,
          progress: 0,
        });
      }).not.toThrow();
    });
  });

  // ── broadcastRunComplete ──────────────────────────────────────

  describe('broadcastRunComplete', () => {
    it('should emit run:complete to all clients in the project room', () => {
      const client = createMockSocket('client-1');

      gateway.handleSubscribe(client as any, { projectId: 'project-abc' });

      const runSummary = {
        id: 'run-42',
        status: 'PASSED',
        passedCount: 18,
        failedCount: 2,
        totalTests: 20,
        durationMs: 45000,
      };

      gateway.broadcastRunComplete('project-abc', runSummary);

      expect(client.emit).toHaveBeenCalledWith('run:complete', runSummary);
    });

    it('should not emit to clients in different rooms', () => {
      const clientA = createMockSocket('client-a');
      const clientB = createMockSocket('client-b');

      gateway.handleSubscribe(clientA as any, { projectId: 'project-abc' });
      gateway.handleSubscribe(clientB as any, { projectId: 'project-xyz' });

      const runSummary = {
        id: 'run-42',
        status: 'PASSED',
        passedCount: 18,
        failedCount: 2,
        totalTests: 20,
        durationMs: 45000,
      };

      gateway.broadcastRunComplete('project-abc', runSummary);

      expect(clientA.emit).toHaveBeenCalledWith('run:complete', runSummary);
      expect(clientB.emit).not.toHaveBeenCalled();
    });
  });

  // ── broadcastTestResult ───────────────────────────────────────

  describe('broadcastTestResult', () => {
    it('should emit test:result to all clients in the project room', () => {
      const client = createMockSocket('client-1');

      gateway.handleSubscribe(client as any, { projectId: 'project-abc' });

      const testResult = {
        runId: 'run-42',
        testCaseId: 'tc-1',
        testTitle: 'Login flow',
        status: 'PASSED',
        durationMs: 1200,
      };

      gateway.broadcastTestResult('project-abc', testResult);

      expect(client.emit).toHaveBeenCalledWith('test:result', testResult);
    });

    it('should not emit to clients in different rooms', () => {
      const clientA = createMockSocket('client-a');
      const clientB = createMockSocket('client-b');

      gateway.handleSubscribe(clientA as any, { projectId: 'project-abc' });
      gateway.handleSubscribe(clientB as any, { projectId: 'project-xyz' });

      const testResult = {
        runId: 'run-42',
        testCaseId: 'tc-1',
        testTitle: 'Login flow',
        status: 'PASSED',
        durationMs: 1200,
      };

      gateway.broadcastTestResult('project-abc', testResult);

      expect(clientA.emit).toHaveBeenCalledWith('test:result', testResult);
      expect(clientB.emit).not.toHaveBeenCalled();
    });
  });

  // ── handleDisconnect ──────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('should remove client from all rooms on disconnect', () => {
      const client = createMockSocket('client-1');

      gateway.handleSubscribe(client as any, { projectId: 'project-abc' });
      gateway.handleSubscribe(client as any, { projectId: 'project-def' });

      gateway.handleDisconnect(client as any);

      const runUpdate = {
        id: 'run-1',
        status: 'RUNNING',
        passedCount: 0,
        failedCount: 0,
        totalTests: 10,
        progress: 0,
      };

      gateway.broadcastRunUpdate('project-abc', runUpdate);
      gateway.broadcastRunUpdate('project-def', runUpdate);

      expect(client.emit).not.toHaveBeenCalled();
    });

    it('should not affect other clients when one disconnects', () => {
      const client1 = createMockSocket('client-1');
      const client2 = createMockSocket('client-2');

      gateway.handleSubscribe(client1 as any, { projectId: 'project-abc' });
      gateway.handleSubscribe(client2 as any, { projectId: 'project-abc' });

      gateway.handleDisconnect(client1 as any);

      const runUpdate = {
        id: 'run-1',
        status: 'RUNNING',
        passedCount: 0,
        failedCount: 0,
        totalTests: 10,
        progress: 0,
      };

      gateway.broadcastRunUpdate('project-abc', runUpdate);

      expect(client1.emit).not.toHaveBeenCalled();
      expect(client2.emit).toHaveBeenCalledWith('run:update', runUpdate);
    });

    it('should clean up empty rooms after last client disconnects', () => {
      const client = createMockSocket('client-1');

      gateway.handleSubscribe(client as any, { projectId: 'project-abc' });
      gateway.handleDisconnect(client as any);

      // Broadcasting to an empty room should not throw
      expect(() => {
        gateway.broadcastRunUpdate('project-abc', {
          id: 'run-1',
          status: 'RUNNING',
          passedCount: 0,
          failedCount: 0,
          totalTests: 0,
          progress: 0,
        });
      }).not.toThrow();
    });

    it('should log when a client disconnects', () => {
      const client = createMockSocket('client-1');
      const logSpy = vi.spyOn(Logger.prototype, 'log');

      gateway.handleDisconnect(client as any);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('client-1'),
      );
    });
  });

  // ── Room isolation ────────────────────────────────────────────

  describe('room isolation', () => {
    it('clients in different rooms should not receive each other\'s messages', () => {
      const clientA = createMockSocket('client-a');
      const clientB = createMockSocket('client-b');
      const clientC = createMockSocket('client-c');

      gateway.handleSubscribe(clientA as any, { projectId: 'project-1' });
      gateway.handleSubscribe(clientB as any, { projectId: 'project-2' });
      gateway.handleSubscribe(clientC as any, { projectId: 'project-1' });

      const update1 = {
        id: 'run-1',
        status: 'RUNNING',
        passedCount: 5,
        failedCount: 0,
        totalTests: 10,
        progress: 50,
      };

      const update2 = {
        id: 'run-2',
        status: 'FAILED',
        passedCount: 3,
        failedCount: 7,
        totalTests: 10,
        progress: 100,
      };

      gateway.broadcastRunUpdate('project-1', update1);
      gateway.broadcastRunUpdate('project-2', update2);

      // clientA is in project-1: should receive update1 only
      expect(clientA.emit).toHaveBeenCalledTimes(1);
      expect(clientA.emit).toHaveBeenCalledWith('run:update', update1);

      // clientB is in project-2: should receive update2 only
      expect(clientB.emit).toHaveBeenCalledTimes(1);
      expect(clientB.emit).toHaveBeenCalledWith('run:update', update2);

      // clientC is in project-1: should receive update1 only
      expect(clientC.emit).toHaveBeenCalledTimes(1);
      expect(clientC.emit).toHaveBeenCalledWith('run:update', update1);
    });

    it('multiple clients in the same room all receive broadcasts', () => {
      const clients = Array.from({ length: 5 }, (_, i) =>
        createMockSocket(`client-${i}`),
      );

      for (const client of clients) {
        gateway.handleSubscribe(client as any, { projectId: 'project-abc' });
      }

      const testResult = {
        runId: 'run-1',
        testCaseId: 'tc-5',
        testTitle: 'Checkout flow',
        status: 'FAILED',
        durationMs: 3400,
        errorMessage: 'Timeout waiting for element',
      };

      gateway.broadcastTestResult('project-abc', testResult);

      for (const client of clients) {
        expect(client.emit).toHaveBeenCalledTimes(1);
        expect(client.emit).toHaveBeenCalledWith('test:result', testResult);
      }
    });
  });
});
