import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';

export interface RunUpdate {
  id: string;
  status: string;
  passedCount: number;
  failedCount: number;
  totalTests: number;
  progress: number;
}

export interface RunSummary {
  id: string;
  status: string;
  passedCount: number;
  failedCount: number;
  totalTests: number;
  durationMs: number;
}

export interface TestResult {
  runId: string;
  testCaseId: string;
  testTitle: string;
  status: string;
  durationMs: number;
  errorMessage?: string;
  stackTrace?: string;
}

@WebSocketGateway({
  namespace: '/live',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(LiveGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly authService: AuthService) {}

  /**
   * Map from projectId -> Set of connected sockets.
   * We manage rooms manually so broadcasting works without
   * relying on Socket.IO's built-in room mechanism (easier to test).
   */
  private rooms = new Map<string, Set<Socket>>();

  /**
   * Reverse index: socketId -> Set of projectIds the socket is in.
   * Used for fast cleanup on disconnect.
   */
  private clientRooms = new Map<string, Set<string>>();

  // ── Lifecycle hooks ─────────────────────────────────────────

  handleConnection(client: Socket): void {
    // Extract JWT from handshake auth or authorization header
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      this.logger.warn(`Client ${client.id} connected without auth token — disconnecting`);
      client.disconnect(true);
      return;
    }

    const payload = this.authService.verifyToken(token);
    if (!payload) {
      this.logger.warn(`Client ${client.id} provided invalid token — disconnecting`);
      client.disconnect(true);
      return;
    }

    // Attach user info for later use
    (client as any).user = payload;
    this.logger.log(`Client connected: ${client.id} (user: ${payload.email})`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.removeClientFromAllRooms(client);
  }

  // ── Message handlers ────────────────────────────────────────

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ): { event: string; data: { projectId: string } } {
    const { projectId } = data;

    // Add client to the project room
    if (!this.rooms.has(projectId)) {
      this.rooms.set(projectId, new Set());
    }
    this.rooms.get(projectId)!.add(client);

    // Track which rooms this client is in
    if (!this.clientRooms.has(client.id)) {
      this.clientRooms.set(client.id, new Set());
    }
    this.clientRooms.get(client.id)!.add(projectId);

    return { event: 'subscribed', data: { projectId } };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ): { event: string; data: { projectId: string } } {
    const { projectId } = data;

    this.removeClientFromRoom(client, projectId);

    return { event: 'unsubscribed', data: { projectId } };
  }

  // ── Broadcast methods (called by other services) ────────────

  broadcastRunUpdate(projectId: string, runUpdate: RunUpdate): void {
    this.emitToRoom(projectId, 'run:update', runUpdate);
  }

  broadcastRunComplete(projectId: string, runSummary: RunSummary): void {
    this.emitToRoom(projectId, 'run:complete', runSummary);
  }

  broadcastTestResult(projectId: string, testResult: TestResult): void {
    this.emitToRoom(projectId, 'test:result', testResult);
  }

  // ── Private helpers ─────────────────────────────────────────

  private emitToRoom(projectId: string, event: string, data: unknown): void {
    const clients = this.rooms.get(projectId);
    if (!clients) return;

    for (const client of clients) {
      client.emit(event, data);
    }
  }

  private removeClientFromRoom(client: Socket, projectId: string): void {
    const room = this.rooms.get(projectId);
    if (room) {
      room.delete(client);
      if (room.size === 0) {
        this.rooms.delete(projectId);
      }
    }

    const projects = this.clientRooms.get(client.id);
    if (projects) {
      projects.delete(projectId);
      if (projects.size === 0) {
        this.clientRooms.delete(client.id);
      }
    }
  }

  private removeClientFromAllRooms(client: Socket): void {
    const projects = this.clientRooms.get(client.id);
    if (!projects) return;

    for (const projectId of projects) {
      const room = this.rooms.get(projectId);
      if (room) {
        room.delete(client);
        if (room.size === 0) {
          this.rooms.delete(projectId);
        }
      }
    }

    this.clientRooms.delete(client.id);
  }
}
