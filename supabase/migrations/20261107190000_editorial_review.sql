ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS policy_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS blockers TEXT NOT NULL DEFAULT '["LEGACY_REVIEW"]';
ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS review_reasons TEXT NOT NULL DEFAULT '[]';
ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS review_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES giro63.users(id);
ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS reviewed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS resolution_note TEXT NOT NULL DEFAULT '';
ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS approved_cover TEXT NOT NULL DEFAULT '';
ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS publication_counted INTEGER NOT NULL DEFAULT 0;
UPDATE giro63.automation_items SET publication_counted=1 WHERE state='published';

ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS confirmed_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS review_completed_by BIGINT REFERENCES giro63.users(id);
ALTER TABLE giro63.automation_items ADD COLUMN IF NOT EXISTS review_completed_at TEXT NOT NULL DEFAULT '';
