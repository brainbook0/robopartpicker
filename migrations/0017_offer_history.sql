-- IU-SOURCING-DATA: revision-aware supplier offer time-series + provenance/risk fields.
-- supplier_offers already carries unit_price_minor, stock_quantity, minimum_quantity,
-- lead_time_days, region_code, currency, availability, observed_at and expires_at. This
-- adds the remaining sourcing fields without rewriting or dropping existing offers.
ALTER TABLE supplier_offers ADD COLUMN condition TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE supplier_offers ADD COLUMN price_breaks TEXT;
ALTER TABLE supplier_offers ADD COLUMN reliability_score REAL;
ALTER TABLE supplier_offers ADD COLUMN risk_label TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE supplier_offers ADD COLUMN freshness_label TEXT NOT NULL DEFAULT 'unknown';

-- Enrich observations so history is not a bare price point.
ALTER TABLE offer_price_history ADD COLUMN minimum_quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE offer_price_history ADD COLUMN lead_time_days INTEGER;

CREATE INDEX supplier_offers_freshness_idx ON supplier_offers(freshness_label, observed_at DESC);
