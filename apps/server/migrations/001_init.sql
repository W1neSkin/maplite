-- First project database.
-- Project edits are ordered by change_seq, assigned inside the write
-- transaction. Device clocks are not used.
-- Live positions use position_seq and are not rows in project_changes.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Plain tokens are never stored. The hash is SHA-256 of a 256-bit secret.
CREATE TABLE project_tokens (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  device_id TEXT,
  revoked_at TEXT
);

CREATE TABLE enrollment_codes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  redeemed_at TEXT
);

CREATE TABLE entities (
  project_id TEXT NOT NULL REFERENCES projects(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  change_seq INTEGER NOT NULL,
  PRIMARY KEY (project_id, entity_type, entity_id)
);

CREATE INDEX entities_by_seq ON entities (project_id, change_seq);

CREATE TABLE project_changes (
  project_id TEXT NOT NULL REFERENCES projects(id),
  seq INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
  payload_json TEXT NOT NULL,
  PRIMARY KEY (project_id, seq)
);

CREATE TABLE accepted_operations (
  project_id TEXT NOT NULL,
  op_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  PRIMARY KEY (project_id, op_id)
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  platform TEXT NOT NULL,
  display_name TEXT NOT NULL,
  actual_state TEXT NOT NULL,
  desired_state TEXT NOT NULL,
  last_seen_at TEXT,
  battery_percent INTEGER
);

-- The push service needs the raw token. It is never written to the log.
CREATE TABLE device_push_tokens (
  device_id TEXT PRIMARY KEY REFERENCES devices(id),
  provider TEXT NOT NULL,
  token TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE device_commands (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  body_json TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  acked_at TEXT,
  result TEXT
);

CREATE TABLE live_objects (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  payload_json TEXT NOT NULL
);

CREATE TABLE live_positions (
  project_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  position_seq INTEGER NOT NULL,
  fix_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL,
  sampled_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  source TEXT,
  horizontal_accuracy_m REAL,
  speed_mps REAL,
  course_deg REAL,
  PRIMARY KEY (project_id, position_seq),
  UNIQUE (object_id, fix_id)
);

CREATE TABLE track_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  profile TEXT NOT NULL,
  point_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE track_points (
  session_id TEXT NOT NULL REFERENCES track_sessions(id),
  seq INTEGER NOT NULL,
  point_id TEXT NOT NULL,
  sampled_at TEXT NOT NULL,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);
