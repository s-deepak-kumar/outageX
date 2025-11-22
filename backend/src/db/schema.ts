import {
  timestamp,
  pgTable,
  text,
  integer,
  pgEnum,
  boolean,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

// Enums
export const incidentStatusEnum = pgEnum("incident_status", [
  "detecting",
  "analyzing",
  "researching",
  "diagnosing",
  "solving",
  "proposing",
  "executing",
  "resolved",
  "failed",
]);

export const incidentSeverityEnum = pgEnum("incident_severity", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const solutionTypeEnum = pgEnum("solution_type", [
  "patch",
  "rollback",
  "config_fix",
  "restart",
]);

// Incidents Table
export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(), // Link to user who triggered
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: incidentStatusEnum("status").notNull().default("detecting"),
  severity: incidentSeverityEnum("severity").notNull().default("medium"),
  
  affectedServices: jsonb("affected_services").$type<string[]>().default([]),
  errorRate: integer("error_rate").default(0),
  
  // Root cause analysis
  rootCause: text("root_cause"),
  rootCauseConfidence: integer("root_cause_confidence"),
  
  // Timestamps
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Logs Table (for incident logs)
export const incidentLogs = pgTable("incident_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
  
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  level: text("level").notNull(), // error, warn, info, debug
  service: text("service").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Commits Table (GitHub commits related to incidents)
export const commits = pgTable("commits", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
  
  sha: text("sha").notNull(),
  author: text("author").notNull(),
  message: text("message").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  
  filesChanged: jsonb("files_changed").$type<string[]>().default([]),
  additions: integer("additions").default(0),
  deletions: integer("deletions").default(0),
  
  diff: text("diff"),
  isSuspicious: boolean("is_suspicious").default(false),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Research Results Table
export const researchResults = pgTable("research_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
  
  source: text("source").notNull(), // perplexity, brave, exa, github
  query: text("query").notNull(),
  result: jsonb("result").$type<any>().notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Solutions Table
export const solutions = pgTable("solutions", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
  
  type: solutionTypeEnum("type").notNull(),
  description: text("description").notNull(),
  reasoning: text("reasoning").notNull(),
  
  code: text("code"),
  steps: jsonb("steps").$type<string[]>().default([]),
  
  confidence: integer("confidence").notNull(), // 0-100
  risk: text("risk").notNull(), // low, medium, high
  
  // Test results
  tested: boolean("tested").default(false),
  testResults: jsonb("test_results").$type<any>(),
  
  // Execution
  executed: boolean("executed").default(false),
  executionResult: jsonb("execution_result").$type<any>(),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Timeline Events Table
export const timelineEvents = pgTable("timeline_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
  
  type: text("type").notNull(), // detected, analyzing, researching, etc.
  title: text("title").notNull(),
  description: text("description"),
  metadata: jsonb("metadata").$type<any>(),
  
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Chat Messages Table
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
  
  role: text("role").notNull(), // user, assistant, system
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<any>(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Integrations Table (for storing user credentials)
export const integrationProviderEnum = pgEnum("integration_provider", [
  "vercel",
  "github",
  "datadog",
  "sentry",
]);

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(), // Link to auth user
  
  provider: integrationProviderEnum("provider").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  
  // Encrypted credentials
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  
  // Provider-specific config
  config: jsonb("config").$type<{
    projectName?: string;
    teamId?: string;
    repoOwner?: string;
    repoName?: string;
    [key: string]: any;
  }>(),
  
  // Metadata
  lastUsed: timestamp("last_used", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Projects Table (user's monitored Vercel projects with auto-webhook setup)
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(), // Link to auth user
  
  // Vercel details
  vercelProjectId: text("vercel_project_id").notNull(),
  vercelProjectName: text("vercel_project_name").notNull(),
  vercelWebhookId: text("vercel_webhook_id"), // Auto-created webhook ID
  vercelLogDrainId: text("vercel_log_drain_id"), // Auto-created Log Drain ID for runtime logs
  
  // GitHub details  
  githubOwner: text("github_owner").notNull(),
  githubRepo: text("github_repo").notNull(),
  githubWebhookId: text("github_webhook_id"), // Auto-created webhook ID
  
  // Monitoring config
  enabled: boolean("enabled").notNull().default(true),
  autoFix: boolean("auto_fix").notNull().default(false), // Auto-execute fixes if confidence > threshold
  autoFixThreshold: integer("auto_fix_threshold").notNull().default(90), // Only auto-fix if confidence >= 90%
  
  // Metadata
  framework: text("framework"), // nextjs, remix, etc
  lastDeployment: jsonb("last_deployment").$type<Record<string, any>>(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Runtime Logs Table (stores logs from Vercel Log Drains)
export const runtimeLogs = pgTable("runtime_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  
  // Log data from Vercel Log Drain
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  level: text("level").notNull(), // info, warn, error, debug
  message: text("message").notNull(),
  
  // Vercel-specific fields
  deploymentId: text("deployment_id"),
  functionName: text("function_name"),
  requestId: text("request_id"),
  url: text("url"),
  method: text("method"),
  statusCode: integer("status_code"),
  source: text("source"), // function, edge, build, etc.
  
  // Full log payload for reference
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

