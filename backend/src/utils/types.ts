/**
 * OutageX - Core Type Definitions
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

export interface CommitInfo {
  sha: string;
  author: string;
  message: string;
  timestamp: Date;
  filesChanged: string[];
  additions: number;
  deletions: number;
}

export interface ResearchResult {
  source: string;
  title: string;
  summary: string;
  url?: string;
  relevance: number;
}

export interface RootCause {
  description: string;
  reasoning: string;
  evidence: string[];
  confidence: number;
  suspectedCommit?: CommitInfo;
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
  testResults?: TestResult;
  metadata?: {
    filePath?: string;
    projectName?: string;
    deploymentId?: string;
    [key: string]: any;
  };
}

export interface TestResult {
  success: boolean;
  output: string;
  errors?: string[];
  warnings?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    phase?: AgentPhase;
    actions?: InlineAction[];
  };
}

export interface InlineAction {
  label: string;
  action: string;
  data?: any;
}

export interface SystemMetrics {
  cpu: number;
  memory: number;
  errorRate: number;
  requestRate: number;
  latency: number;
}

// Socket.io Event Payloads
export interface IncidentDetectedPayload {
  incident: Incident;
}

export interface AgentUpdatePayload {
  phase: AgentPhase;
  status: string;
  message: string;
  data?: any;
}

export interface LogsStreamPayload {
  logs: LogEntry[];
}

export interface SolutionProposedPayload {
  solution: Solution;
  rootCause: RootCause;
}

export interface StatusChangePayload {
  status: IncidentStatus;
  incident: Incident;
}

export interface ChatMessagePayload {
  message: ChatMessage;
}

export interface TimelineAddPayload {
  entry: TimelineEntry;
}

// MCP Response Types
export interface GitHubCommitResponse {
  commits: CommitInfo[];
}

export interface GitHubDiffResponse {
  sha: string;
  diff: string;
}

export interface PerplexitySearchResponse {
  answer: string;
  sources: ResearchResult[];
}

export interface WebSearchResponse {
  results: ResearchResult[];
}

