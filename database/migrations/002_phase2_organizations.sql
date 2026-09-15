BEGIN;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE projects DROP CONSTRAINT projects_name_key;
CREATE UNIQUE INDEX projects_organization_name_unique
  ON projects(organization_id, name) NULLS NOT DISTINCT;

ALTER TABLE tasks ADD COLUMN plan jsonb;

COMMIT;
