CREATE TABLE analytics_daily_events (
  day TEXT NOT NULL,
  event_name TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  dimension_key TEXT NOT NULL DEFAULT '',
  dimension_value TEXT NOT NULL DEFAULT '',
  referrer_host TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT '',
  device_class TEXT NOT NULL CHECK (device_class IN ('desktop', 'mobile', 'tablet', 'unknown')),
  events INTEGER NOT NULL DEFAULT 0 CHECK (events >= 0),
  first_event_at TEXT NOT NULL,
  last_event_at TEXT NOT NULL,
  PRIMARY KEY (
    day, event_name, path, target_type, target_id, dimension_key, dimension_value,
    referrer_host, utm_source, utm_medium, utm_campaign, country_code, device_class
  )
);

CREATE INDEX analytics_daily_events_day_event_idx
  ON analytics_daily_events(day DESC, event_name, events DESC);
CREATE INDEX analytics_daily_events_target_day_idx
  ON analytics_daily_events(target_type, target_id, day DESC);
CREATE INDEX analytics_daily_events_path_day_idx
  ON analytics_daily_events(path, day DESC);
