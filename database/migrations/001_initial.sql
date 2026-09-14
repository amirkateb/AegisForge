BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE agent_environment AS ENUM ('PRODUCTION', 'DEVELOPMENT', 'TESTING');
CREATE TYPE agent_status AS ENUM ('ONLINE', 'OFFLINE', 'DISABLED', 'REVOKED');
CREATE TYPE task_status AS ENUM ('QUEUED', 'UNDERSTANDING', 'PLANNING', 'WAITING_APPROVAL', 'EXECUTING', 'VERIFYING', 'FIXING', 'COMPLETED', 'FAILED', 'CANCELLED', 'UNKNOWN');
CREATE TYPE risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');
CREATE TYPE approval_scope AS ENUM ('ONCE', 'SESSION');

CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 100),
  environment agent_environment NOT NULL,
  permission_level smallint NOT NULL CHECK (permission_level BETWEEN 0 AND 4),
  token_digest text NOT NULL,
  status agent_status NOT NULL DEFAULT 'OFFLINE',
  inventory jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 120),
  repository_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  root_path text NOT NULL CHECK (char_length(root_path) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, agent_id, root_path)
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  goal text NOT NULL CHECK (char_length(goal) BETWEEN 3 AND 20000),
  status task_status NOT NULL DEFAULT 'QUEUED',
  max_fix_attempts smallint NOT NULL DEFAULT 2 CHECK (max_fix_attempts BETWEEN 0 AND 5),
  fix_attempts smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_assignment_idx ON tasks(project_id, agent_id, status);

CREATE TABLE task_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  title text NOT NULL,
  tool_name text,
  arguments jsonb,
  state text NOT NULL,
  evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, position)
);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  risk risk_level NOT NULL,
  reason text NOT NULL,
  impact text NOT NULL,
  affected_resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  argument_hash text NOT NULL,
  status approval_status NOT NULL DEFAULT 'PENDING',
  scope approval_scope,
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_pending_idx ON approvals(status, created_at DESC);

CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  request_hash text NOT NULL,
  task_id uuid REFERENCES tasks(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days'
);

CREATE TABLE project_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category text NOT NULL,
  content jsonb NOT NULL,
  source_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, category)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  user_id text,
  action text NOT NULL,
  duration_ms integer,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_time_idx ON audit_events(timestamp DESC);

COMMIT;
