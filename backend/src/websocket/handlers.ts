import { Server as SocketServer, Socket } from 'socket.io';
import orchestrator from '../agent/orchestrator';
import groqClient from '../groq/client';
import logger from '../utils/logger';

/**
 * WebSocket Event Handlers
 * 
 * Handles all Socket.io events between frontend and backend
 */
export class WebSocketHandlers {
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Store userId in socket data (POC: always demo-user)
      socket.data.userId = 'demo-user';

      // Incident Management
      socket.on('incident:trigger', () => this.handleIncidentTrigger(socket));
      socket.on('solution:execute', (data) => this.handleSolutionExecute(socket, data));
      socket.on('agent:stop', () => this.handleAgentStop(socket));

      // Chat
      socket.on('chat:message', (data) => this.handleChatMessage(socket, data));

      // Connection Management
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });

      // Send welcome message
      socket.emit('chat:message', {
        message: {
          id: `msg-${Date.now()}`,
          role: 'system',
          content: '👋 **OutageX Ready**\n\nClick "Trigger Incident" to start the demo scenario.',
          timestamp: new Date(),
        },
      });
    });
  }

  /**
   * Handle incident trigger
   */
  private async handleIncidentTrigger(socket: Socket): Promise<void> {
    const userId = socket.data.userId || 'demo-user';
    logger.info(`Incident trigger received from user: ${userId}`);

    try {
      // Start the incident response pipeline with userId
      await orchestrator.startIncidentResponse(userId);
    } catch (error) {
      logger.error('Error handling incident trigger:', error);
      socket.emit('chat:message', {
        message: {
          id: `msg-${Date.now()}`,
          role: 'system',
          content: '❌ Error starting incident response. Please check logs.',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Handle solution execution
   */
  private async handleSolutionExecute(socket: Socket, data: { solutionId: string }): Promise<void> {
    logger.info(`Solution execution requested: ${data.solutionId}`);

    try {
      await orchestrator.executeSolution(data.solutionId);
    } catch (error) {
      logger.error('Error executing solution:', error);
      socket.emit('chat:message', {
        message: {
          id: `msg-${Date.now()}`,
          role: 'system',
          content: '❌ Error executing solution. Please check logs.',
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Handle agent stop
   */
  private handleAgentStop(socket: Socket): void {
    logger.info('Agent stop requested');
    
    // In a real system, this would cancel ongoing operations
    socket.emit('chat:message', {
      message: {
        id: `msg-${Date.now()}`,
        role: 'system',
        content: '⏸️ Agent operations paused.',
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle chat messages
   */
  private async handleChatMessage(socket: Socket, data: { message: string }): Promise<void> {
    logger.info(`Chat message received: ${data.message}`);

    try {
      // Get context from orchestrator
      const context = 'Incident response context';

      // Generate response with Groq
      const userMessage = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
      const response = await groqClient.generateChatResponse(userMessage, context);

      socket.emit('chat:message', {
        message: {
          id: `msg-${Date.now()}`,
          role: 'agent',
          content: response,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error handling chat message:', error);
      socket.emit('chat:message', {
        message: {
          id: `msg-${Date.now()}`,
          role: 'agent',
          content: 'I apologize, but I encountered an error processing your message.',
          timestamp: new Date(),
        },
      });
    }
  }
}

export default WebSocketHandlers;

