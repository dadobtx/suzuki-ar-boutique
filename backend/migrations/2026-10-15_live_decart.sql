ALTER TABLE live_sesiones ADD COLUMN completed_at DATETIME DEFAULT NULL;
ALTER TABLE live_sesiones ADD COLUMN provider TEXT NOT NULL DEFAULT 'fal';

CREATE TABLE IF NOT EXISTS live_intentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  live_session_id INTEGER,
  session_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  provider TEXT NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_live_intentos_created_at ON live_intentos(created_at);
CREATE INDEX IF NOT EXISTS idx_live_intentos_reason ON live_intentos(reason);
