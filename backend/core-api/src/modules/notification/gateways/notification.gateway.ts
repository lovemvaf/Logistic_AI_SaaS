import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { jwtSecret } from 'shared-types';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = jwtSecret();

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:4001',
      'http://localhost:4002',
      'http://localhost:4003',
      'http://localhost:4004',
    ],
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private readonly clientRooms: Map<string, Set<string>> = new Map();

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const decoded = jwt.verify(token as string, JWT_SECRET) as any;
      (client as any).userId = decoded.sub;
      (client as any).tenantId = decoded.tenant_id;

      if (decoded.tenant_id) {
        client.join(`tenant:${decoded.tenant_id}`);
        this.addToRoom(client.id, `tenant:${decoded.tenant_id}`);
      }

      if (decoded.sub) {
        client.join(`user:${decoded.sub}`);
        this.addToRoom(client.id, `user:${decoded.sub}`);
      }

      this.logger.log(`Client connected: ${client.id} (user: ${decoded.sub})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Client ${client.id} auth failed: ${message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.clientRooms.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string }
  ) {
    if (data.room) {
      client.join(data.room);
      this.addToRoom(client.id, data.room);
      this.logger.debug(`Client ${client.id} joined room: ${data.room}`);
    }
  }

  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string }
  ) {
    if (data.room) {
      client.leave(data.room);
      this.removeFromRoom(client.id, data.room);
      this.logger.debug(`Client ${client.id} left room: ${data.room}`);
    }
  }

  sendToTenant(tenantId: string, event: string, data: any) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }

  private addToRoom(clientId: string, room: string) {
    if (!this.clientRooms.has(clientId)) {
      this.clientRooms.set(clientId, new Set());
    }
    this.clientRooms.get(clientId)!.add(room);
  }

  private removeFromRoom(clientId: string, room: string) {
    const rooms = this.clientRooms.get(clientId);
    if (rooms) {
      rooms.delete(room);
    }
  }
}
