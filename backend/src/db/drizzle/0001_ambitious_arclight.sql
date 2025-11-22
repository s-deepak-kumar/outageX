CREATE TABLE IF NOT EXISTS "runtime_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"deployment_id" text,
	"function_name" text,
	"request_id" text,
	"url" text,
	"method" text,
	"status_code" integer,
	"source" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "vercel_log_drain_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runtime_logs" ADD CONSTRAINT "runtime_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
