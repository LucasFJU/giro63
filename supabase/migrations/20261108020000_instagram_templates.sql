CREATE SCHEMA IF NOT EXISTS giro63_backup_20261108;
REVOKE ALL ON SCHEMA giro63_backup_20261108 FROM PUBLIC,anon,authenticated;
CREATE TABLE giro63_backup_20261108.instagram_posts_before_templates AS SELECT * FROM giro63.instagram_posts;
ALTER TABLE giro63_backup_20261108.instagram_posts_before_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON giro63_backup_20261108.instagram_posts_before_templates FROM PUBLIC,anon,authenticated;
ALTER TABLE giro63.instagram_posts ADD COLUMN IF NOT EXISTS art_template TEXT NOT NULL DEFAULT 'navy';
ALTER TABLE giro63.instagram_posts ADD COLUMN IF NOT EXISTS generated_template TEXT NOT NULL DEFAULT 'navy';
UPDATE giro63.instagram_posts p SET art_template=CASE WHEN art_template='light' THEN 'light' ELSE 'navy' END,feed_path='',fallback_path='',story_path='',prepared_at=''
WHERE NOT EXISTS(SELECT 1 FROM giro63.instagram_deliveries d WHERE d.post_id=p.id AND d.state IN ('published','publishing','uncertain'));
UPDATE giro63.instagram_posts p SET caption=trim(regexp_replace(regexp_replace(caption,'Leia a matéria completa no Giro63: https?://[^[:space:]]+','','g'),'https?://[^[:space:]]+','','g')) || E'\n\nLink da matéria na íntegra nos stories.'
WHERE caption LIKE '%Leia a matéria completa no Giro63:%' AND NOT EXISTS(SELECT 1 FROM giro63.instagram_deliveries d WHERE d.post_id=p.id AND d.state IN ('published','publishing','uncertain'));
