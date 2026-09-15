BEGIN;

CREATE TYPE agent_access_mode AS ENUM (
  'FULL_TRUST',
  'CAUTIOUS',
  'VERY_CAUTIOUS'
);

ALTER TABLE agents
  ADD COLUMN access_mode agent_access_mode NOT NULL DEFAULT 'CAUTIOUS';

COMMIT;
