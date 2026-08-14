CREATE TABLE partner_interest_submissions (
  id TEXT PRIMARY KEY,
  inquiry_type TEXT NOT NULL CHECK (inquiry_type IN ('advertiser', 'supplier', 'partner', 'project_owner', 'service_provider')),
  organization_name TEXT NOT NULL,
  normalized_organization TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  website_url TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'reviewing', 'qualified', 'closed', 'spam')),
  source TEXT NOT NULL DEFAULT 'public_partners_page',
  ip_hash TEXT,
  user_agent TEXT,
  request_id TEXT,
  admin_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX partner_interest_status_created_idx
  ON partner_interest_submissions(status, created_at DESC);

CREATE INDEX partner_interest_email_org_created_idx
  ON partner_interest_submissions(normalized_email, normalized_organization, created_at DESC);
