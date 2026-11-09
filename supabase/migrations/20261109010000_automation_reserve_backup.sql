CREATE SCHEMA IF NOT EXISTS giro63_backup_20261109;
REVOKE ALL ON SCHEMA giro63_backup_20261109 FROM PUBLIC, anon, authenticated;
CREATE TABLE giro63_backup_20261109.automation_items AS TABLE giro63.automation_items;
CREATE TABLE giro63_backup_20261109.automation_daily AS TABLE giro63.automation_daily;
CREATE TABLE giro63_backup_20261109.automation_events AS TABLE giro63.automation_events;
CREATE TABLE giro63_backup_20261109.settings AS TABLE giro63.settings;
ALTER TABLE giro63_backup_20261109.automation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE giro63_backup_20261109.automation_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE giro63_backup_20261109.automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE giro63_backup_20261109.settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA giro63_backup_20261109 FROM PUBLIC, anon, authenticated;
UPDATE giro63.settings SET value='prepare' WHERE key='instagram_mode';
-- Existing TEXT states and atomic daily counters support waiting without schema changes.
