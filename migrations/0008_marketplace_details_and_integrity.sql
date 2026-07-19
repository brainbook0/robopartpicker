CREATE TABLE marketplace_listing_details (
  listing_id TEXT PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  runtime_hours INTEGER CHECK (runtime_hours IS NULL OR runtime_hours >= 0),
  provenance_text TEXT,
  seller_declares_test_report INTEGER NOT NULL DEFAULT 0 CHECK (seller_declares_test_report IN (0, 1)),
  seller_declares_video INTEGER NOT NULL DEFAULT 0 CHECK (seller_declares_video IN (0, 1)),
  seller_accepts_returns INTEGER NOT NULL DEFAULT 0 CHECK (seller_accepts_returns IN (0, 1)),
  serial_available INTEGER NOT NULL DEFAULT 0 CHECK (serial_available IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE INDEX marketplace_saves_listing_idx ON marketplace_saves(listing_id, created_at DESC);
CREATE INDEX marketplace_reports_status_created_idx ON marketplace_reports(status, created_at);
CREATE INDEX marketplace_offers_inquiry_status_idx ON marketplace_offers(inquiry_id, status, updated_at DESC);
