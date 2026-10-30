CREATE TABLE IF NOT EXISTS conversion_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (
    event_name IN (
      'call_click',
      'whatsapp_click',
      'pickup_request',
      'directions_click'
    )
  ),
  page_path TEXT NOT NULL DEFAULT '/',
  cta_location TEXT NOT NULL DEFAULT 'unknown',
  service_context TEXT,
  occurred_at TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversion_project_event_time
  ON conversion_events(project, event_name, received_at);

CREATE INDEX IF NOT EXISTS idx_conversion_received_at
  ON conversion_events(received_at);
