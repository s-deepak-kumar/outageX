import { create } from 'zustand';
import { Socket } from 'socket.io-client';

/**
 * DevOps Firefighter Store
 * 
 * Manages all state for the incident response system
 */

export type IncidentStatus =
  | 'idle'
  | 'detecting'
  | 'analyzing'
  | 'researching'
  | 'diagnosing'
  | 'proposing'
  | 'executing'
  | 'resolved'
  | 'failed';

export type AgentPhase =
  | 'detection'
  | 'log_analysis'
  | 'commit_correlation'
  | 'research'
  | 'diagnosis'
  | 'solution_generation'
  | 'execution';

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: IncidentStatus;
  startedAt: Date;
  resolvedAt?: Date;
  affectedServices: string[];
}

export interface TimelineEntry {
  id: string;
  timestamp: Date;
  phase: AgentPhase;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

export interface LogEntry {
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  service: string;
  metadata?: Record<string, any>;
}

export interface Solution {
  id: string;
  type: 'rollback' | 'config_fix' | 'patch' | 'restart';
  description: string;
  reasoning: string;
  risk: 'low' | 'medium' | 'high';
  confidence: number;
  estimatedTime: string;
  steps: string[];
  code?: string;
  diff?: string;
  testResults?: {
    success: boolean;
    output: string;
    errors?: string[];
    warnings?: string[];
  };
}

export interface RootCause {
  description: string;
  reasoning: string;
  evidence: string[];
  confidence: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    phase?: AgentPhase;
    actions?: Array<{ label: string; action: string; data?: any }>;
  };
}

export interface SystemMetrics {
  cpu: number;
  memory: number;
  errorRate: number;
  requestRate: number;
  latency: number;
}

interface FirefighterState {
  // Socket connection
  socket: Socket | null;
  isConnected: boolean;
  
  // Incident state
  incident: Incident | null;
  
  // Timeline
  timeline: TimelineEntry[];
  
  // Logs
  logs: LogEntry[];
  
  // Chat messages
  messages: ChatMessage[];
  isTyping: boolean;
  
  // Solution
  currentSolution: Solution | null;
  rootCause: RootCause | null;
  
  // Metrics
  metrics: SystemMetrics;
  
  // Agent state
  currentPhase: AgentPhase | null;
  agentStatus: string;
  
  // Actions
  setSocket: (socket: Socket | null) => void;
  setConnected: (connected: boolean) => void;
  setIncident: (incident: Incident | null) => void;
  addTimelineEntry: (entry: TimelineEntry) => void;
  updateTimelineEntry: (id: string, updates: Partial<TimelineEntry>) => void;
  addLogs: (logs: LogEntry[]) => void;
  clearLogs: () => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  setTyping: (typing: boolean) => void;
  setSolution: (solution: Solution | null, rootCause?: RootCause | null) => void;
  setMetrics: (metrics: Partial<SystemMetrics>) => void;
  setAgentState: (phase: AgentPhase | null, status: string) => void;
  reset: () => void;
}

const initialMetrics: SystemMetrics = {
  cpu: 45,
  memory: 62,
  errorRate: 2.3,
  requestRate: 1250,
  latency: 145,
};

export const useFirefighterStore = create<FirefighterState>((set) => ({
  // Initial state
  socket: null,
  isConnected: false,
  incident: null,
  timeline: [],
  logs: [],
  messages: [],
  isTyping: false,
  currentSolution: null,
  rootCause: null,
  metrics: initialMetrics,
  currentPhase: null,
  agentStatus: 'idle',

  // Actions
  setSocket: (socket) => set({ socket }),
  
  setConnected: (connected) => set({ isConnected: connected }),
  
  setIncident: (incident) => set({ incident }),
  
  addTimelineEntry: (entry) =>
    set((state) => {
      // Check if entry already exists (by id)
      const existingIndex = state.timeline.findIndex((e) => e.id === entry.id);
      if (existingIndex !== -1) {
        // Update existing entry
        const newTimeline = [...state.timeline];
        newTimeline[existingIndex] = entry;
        return { timeline: newTimeline };
      }
      // Add new entry
      return { timeline: [...state.timeline, entry] };
    }),
  
  updateTimelineEntry: (id, updates) =>
    set((state) => ({
      timeline: state.timeline.map((entry) =>
        entry.id === id ? { ...entry, ...updates } : entry
      ),
    })),
  
  addLogs: (logs) =>
    set((state) => ({
      logs: [...state.logs, ...logs],
    })),
  
  clearLogs: () => set({ logs: [] }),
  
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  
  clearMessages: () => set({ messages: [] }),
  
  setTyping: (typing) => set({ isTyping: typing }),
  
  setSolution: (solution, rootCause = null) =>
    set({
      currentSolution: solution,
      rootCause: rootCause ?? undefined,
    }),
  
  setMetrics: (metrics) =>
    set((state) => ({
      metrics: { ...state.metrics, ...metrics },
    })),
  
  setAgentState: (phase, status) =>
    set({
      currentPhase: phase,
      agentStatus: status,
    }),
  
  reset: () =>
    set({
      incident: null,
      timeline: [],
      logs: [],
      messages: [],
      isTyping: false,
      currentSolution: null,
      rootCause: null,
      metrics: initialMetrics,
      currentPhase: null,
      agentStatus: 'idle',
    }),
}));

