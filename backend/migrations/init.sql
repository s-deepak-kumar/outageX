-- Create integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  config JSONB DEFAULT '{}',
  last_used TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  vercel_project_id TEXT NOT NULL,
  vercel_project_name TEXT NOT NULL,
  vercel_webhook_id TEXT,
  github_owner TEXT NOT NULL,
  github_repo TEXT NOT NULL,
  github_webhook_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_fix BOOLEAN NOT NULL DEFAULT false,
  auto_fix_threshold INTEGER NOT NULL DEFAULT 90,
  framework TEXT,
  last_deployment JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create users table (simple for demo)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Insert demo user
INSERT INTO users (id, email, name)
VALUES ('demo-user', 'dipkfilms@gmail.com', 'S Deepak Kumar')
ON CONFLICT (id) DO NOTHING;

