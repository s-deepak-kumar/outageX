import { io, Socket } from 'socket.io-client';
import { useFirefighterStore } from '@/store/firefighter';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

let socket: Socket | null = null;

/**
 * Initialize Socket.io connection
 */
export function initializeSocket(): Socket {
  if (socket) {
    return socket;
  }

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  // Setup event listeners
  setupSocketListeners(socket);

  return socket;
}

/**
 * Setup Socket.io event listeners
 */
function setupSocketListeners(socket: Socket): void {
  const store = useFirefighterStore.getState();

  // Connection events
  socket.on('connect', () => {
    console.log('Socket connected');
    store.setConnected(true);
    store.setSocket(socket);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
    store.setConnected(false);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    store.setConnected(false);
  });

  // Incident events
  socket.on('incident:detected', (data: any) => {
    console.log('Incident detected:', data);
    const incident = {
      ...data.incident,
      startedAt: new Date(data.incident.startedAt),
      resolvedAt: data.incident.resolvedAt ? new Date(data.incident.resolvedAt) : undefined,
    };
    store.setIncident(incident);
  });

  socket.on('status:change', (data: any) => {
    console.log('Status change:', data);
    if (data.incident) {
      const incident = {
        ...data.incident,
        startedAt: new Date(data.incident.startedAt),
        resolvedAt: data.incident.resolvedAt ? new Date(data.incident.resolvedAt) : undefined,
      };
      store.setIncident(incident);
    }
  });

  // Agent updates
  socket.on('agent:update', (data: any) => {
    console.log('Agent update:', data);
    store.setAgentState(data.phase, data.status);
    
    // Show typing indicator
    store.setTyping(true);
    setTimeout(() => store.setTyping(false), 500);
  });

  // Timeline events
  socket.on('timeline:add', (data: any) => {
    console.log('Timeline entry:', data);
    const entry = {
      ...data.entry,
      timestamp: new Date(data.entry.timestamp),
    };
    store.addTimelineEntry(entry);
  });

  // Logs events
  socket.on('logs:stream', (data: any) => {
    console.log('Logs stream:', data);
    const logs = data.logs.map((log: any) => ({
      ...log,
      timestamp: new Date(log.timestamp),
    }));
    store.addLogs(logs);
  });

  // Solution events
  socket.on('solution:proposed', (data: any) => {
    console.log('Solution proposed:', data);
    store.setSolution(data.solution, data.rootCause);
  });

  // Chat events
  socket.on('chat:message', (data: any) => {
    console.log('Chat message:', data);
    const message = {
      ...data.message,
      timestamp: new Date(data.message.timestamp),
    };
    store.addMessage(message);
    
    // Show typing indicator briefly for agent messages
    if (message.role === 'agent') {
      store.setTyping(true);
      setTimeout(() => store.setTyping(false), 300);
    }
  });
}

/**
 * Disconnect socket
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Trigger incident demo
 */
export function triggerIncident(): void {
  if (socket) {
    socket.emit('incident:trigger');
  }
}

/**
 * Execute solution
 */
export function executeSolution(solutionId: string): void {
  if (socket) {
    socket.emit('solution:execute', { solutionId });
  }
}

/**
 * Send chat message
 */
export function sendChatMessage(message: string): void {
  if (socket) {
    socket.emit('chat:message', { message });
    
    // Add user message to store immediately
    const store = useFirefighterStore.getState();
    store.addMessage({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    });
  }
}

/**
 * Stop agent
 */
export function stopAgent(): void {
  if (socket) {
    socket.emit('agent:stop');
  }
}

/**
 * Get socket instance
 */
export function getSocket(): Socket | null {
  return socket;
}

