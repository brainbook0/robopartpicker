CREATE TABLE traffic_daily_metrics (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer_host TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT '',
  device_class TEXT NOT NULL CHECK (device_class IN ('desktop', 'mobile', 'tablet', 'bot', 'unknown')),
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  first_view_at TEXT NOT NULL,
  last_view_at TEXT NOT NULL,
  PRIMARY KEY (day, path, referrer_host, utm_source, utm_medium, utm_campaign, country_code, device_class)
);

CREATE INDEX traffic_daily_metrics_day_views_idx
  ON traffic_daily_metrics(day DESC, views DESC);

CREATE INDEX traffic_daily_metrics_path_day_idx
  ON traffic_daily_metrics(path, day DESC);
