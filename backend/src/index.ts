import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import logger from './utils/logger';
import { authMiddleware } from './middleware/auth';
import WebSocketHandlers from './websocket/handlers';
import e2bMCPManager from './mcp/e2b-mcp-manager';
import orchestrator from './agent/orchestrator';
import incidentsRouter from './routes/incidents';
import integrationsRouter from './routes/integrations';
import userIntegrationsRouter from './routes/user-integrations';
import webhooksRouter, { setSocketIO as setWebhooksSocketIO } from './routes/webhooks';
import projectsRouter from './routes/projects';
import aiChatRouter from './routes/ai-chat';
import { setSocketIO as setRuntimeMonitorSocketIO } from './services/runtime-monitor';

// Load environment variables
dotenv.config();

// Log important env vars for debugging (without sensitive values)
logger.info('Environment variables loaded:', {
  PORT: process.env.PORT || '3001 (default)',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000 (default)',
  BACKEND_URL: process.env.BACKEND_URL || 'NOT SET (will use localhost)',
  NODE_ENV: process.env.NODE_ENV || 'development',
});

const app: Express = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Middleware
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-user-id'],
}));
app.use(express.json());

// API Routes (with auth middleware)
app.use('/api/incidents', authMiddleware, incidentsRouter);
app.use('/api/integrations', authMiddleware, integrationsRouter);
app.use('/api/user/integrations', authMiddleware, userIntegrationsRouter);
app.use('/api/projects', authMiddleware, projectsRouter);
app.use('/api/ai-chat', aiChatRouter);
app.use('/api/webhooks', webhooksRouter); // No auth for webhooks (uses signature verification)

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    e2bMCP: {
      initialized: e2bMCPManager['isInitialized'],
      availableServers: e2bMCPManager.getAvailableServers(),
    },
    services: {
      groq: !!process.env.GROQ_API_KEY,
      e2b: !!process.env.E2B_API_KEY,
      github: 'Check database integrations',
      perplexity: !!process.env.PERPLEXITY_API_KEY,
      braveSearch: !!process.env.BRAVE_SEARCH_API_KEY,
      exa: !!process.env.EXA_API_KEY,
    },
  });
});

// API info endpoint
app.get('/api/info', (_req: Request, res: Response) => {
  res.json({
    name: 'OutageX API',
    version: '1.0.0',
    description: 'Autonomous AI Incident Response System with E2B MCP Servers',
    mcp: {
      type: 'E2B Sandbox + Docker Hub MCP',
      availableServers: e2bMCPManager.getAvailableServers(),
      servers: {
        github: 'Repository interactions',
        perplexity: 'AI-powered research',
        'brave-search': 'Web search',
        exa: 'Semantic AI search',
      },
    },
    endpoints: [
      'GET /health - Health check',
      'GET /api/info - API information',
    ],
    websocket: {
      url: `http://localhost:${PORT}`,
      events: {
        client_to_server: [
          'incident:trigger',
          'solution:execute',
          'chat:message',
          'agent:stop',
        ],
        server_to_client: [
          'incident:detected',
          'agent:update',
          'logs:stream',
          'solution:proposed',
          'status:change',
          'chat:message',
          'timeline:add',
        ],
      },
    },
  });
});

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*', // Allow all origins for Socket.io
    methods: ['GET', 'POST'],
    credentials: false, // Socket.io doesn't support credentials with wildcard origin
  },
});

// IMPORTANT: Set socket.io instance IMMEDIATELY so it's available for error reporting
// This must happen before initializeServices() to ensure socket is available when errors arrive
setWebhooksSocketIO(io);
setRuntimeMonitorSocketIO(io);
logger.info('✅ Socket.io instance set for webhooks and runtime monitor');

/**
 * Initialize all services
 */
async function initializeServices(): Promise<void> {
  logger.info('Initializing services...');

  try {
    // Initialize E2B MCP Manager (connects to all Docker Hub MCP servers)
    logger.info('Initializing E2B MCP Manager with Docker Hub MCP servers...');
    // Initialize E2B MCP with demo-user (will load GitHub token from database)
    await e2bMCPManager.initialize('demo-user');
    
    const availableServers = e2bMCPManager.getAvailableServers();
    if (availableServers.length > 0) {
      logger.info(`✓ E2B MCP servers initialized: ${availableServers.join(', ')}`);
    } else {
      logger.warn('⚠ No MCP servers available - using mock data');
      logger.warn('Add E2B_API_KEY and other API keys to enable MCP servers');
    }

    // Initialize orchestrator with Socket.io
    orchestrator.initialize(io);

    // Setup WebSocket handlers
    new WebSocketHandlers(io);

    // Runtime monitor is ready (no polling - errors come from SDK/webhooks)
    logger.info('✅ Runtime error monitor ready (SDK-based)');

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Error initializing services:', error);
    // Don't exit - system can run with mock data
    logger.warn('Running with mock data only');
  }
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    await initializeServices();

    httpServer.listen(PORT, () => {
      logger.info(`🚀 OutageX Backend running on port ${PORT}`);
      logger.info(`📡 WebSocket server ready`);
      logger.info(`🐳 E2B MCP integration: ${e2bMCPManager.getAvailableServers().length > 0 ? 'ACTIVE' : 'MOCK MODE'}`);
      logger.info(`🌐 Frontend URL: ${FRONTEND_URL}`);
      logger.info(`💚 Health check: http://localhost:${PORT}/health`);
      logger.info(`📚 API info: http://localhost:${PORT}/api/info`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down gracefully...`);
  
  // Cleanup E2B MCP Manager
  await e2bMCPManager.cleanup();
  
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();

export default app;

