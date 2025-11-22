import dotenv from 'dotenv';
import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  incidents,
  incidentLogs,
  commits,
  researchResults,
  solutions,
  timelineEvents,
  chatMessages,
  integrations,
} from "./schema";

// Load environment variables first (before accessing process.env)
dotenv.config();

// Types
export type Incident = InferSelectModel<typeof incidents>;
export type NewIncident = InferInsertModel<typeof incidents>;

export type IncidentLog = InferSelectModel<typeof incidentLogs>;
export type NewIncidentLog = InferInsertModel<typeof incidentLogs>;

export type Commit = InferSelectModel<typeof commits>;
export type NewCommit = InferInsertModel<typeof commits>;

export type ResearchResult = InferSelectModel<typeof researchResults>;
export type NewResearchResult = InferInsertModel<typeof researchResults>;

export type Solution = InferSelectModel<typeof solutions>;
export type NewSolution = InferInsertModel<typeof solutions>;

export type TimelineEvent = InferSelectModel<typeof timelineEvents>;
export type NewTimelineEvent = InferInsertModel<typeof timelineEvents>;

export type ChatMessage = InferSelectModel<typeof chatMessages>;
export type NewChatMessage = InferInsertModel<typeof chatMessages>;

export type Integration = InferSelectModel<typeof integrations>;
export type NewIntegration = InferInsertModel<typeof integrations>;

// Supabase Database Connection
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Create postgres client
const client = postgres(connectionString, {
  prepare: false, // Disable prepared statements for Supabase compatibility
});

// Database instance
export const db = drizzle(client);

// Export schema for migrations
export * from "./schema";

