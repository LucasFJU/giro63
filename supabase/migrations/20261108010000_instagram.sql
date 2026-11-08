
CREATE TABLE IF NOT EXISTS giro63.instagram_connection(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,username TEXT NOT NULL,account_type TEXT NOT NULL,token_cipher TEXT NOT NULL,expires_at BIGINT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS giro63.instagram_oauth(id TEXT PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES giro63.users(id),expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS giro63.instagram_posts(id TEXT PRIMARY KEY,article_id BIGINT NOT NULL UNIQUE REFERENCES giro63.articles(id),source_version TEXT NOT NULL,headline TEXT NOT NULL,standfirst TEXT NOT NULL,caption TEXT NOT NULL,photo_x INTEGER NOT NULL DEFAULT 50,photo_y INTEGER NOT NULL DEFAULT 50,rights_version TEXT NOT NULL DEFAULT '',rights_note TEXT NOT NULL DEFAULT '',approved_by BIGINT REFERENCES giro63.users(id),approved_at TEXT NOT NULL DEFAULT '',feed_path TEXT NOT NULL DEFAULT '',fallback_path TEXT NOT NULL DEFAULT '',story_path TEXT NOT NULL DEFAULT '',prepared_by BIGINT REFERENCES giro63.users(id),prepared_at TEXT NOT NULL DEFAULT '',auto_candidate INTEGER NOT NULL DEFAULT 0,test_requested INTEGER NOT NULL DEFAULT 0,cancelled INTEGER NOT NULL DEFAULT 0,change_notice TEXT NOT NULL DEFAULT '',error TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS giro63.instagram_deliveries(post_id TEXT NOT NULL REFERENCES giro63.instagram_posts(id),target TEXT NOT NULL CHECK(target IN ('feed','story')),state TEXT NOT NULL DEFAULT 'prepared',container_id TEXT NOT NULL DEFAULT '',media_id TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at BIGINT NOT NULL DEFAULT 0,ratio TEXT NOT NULL DEFAULT '3:4',error TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,PRIMARY KEY(post_id,target));
CREATE INDEX IF NOT EXISTS instagram_pending ON giro63.instagram_deliveries(state,next_attempt_at);
CREATE TABLE IF NOT EXISTS giro63.instagram_events(id TEXT PRIMARY KEY,post_id TEXT REFERENCES giro63.instagram_posts(id),created_at TEXT NOT NULL,message TEXT NOT NULL);

ALTER TABLE giro63.instagram_connection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON giro63.instagram_connection FROM PUBLIC,anon,authenticated;

ALTER TABLE giro63.instagram_oauth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON giro63.instagram_oauth FROM PUBLIC,anon,authenticated;

ALTER TABLE giro63.instagram_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON giro63.instagram_posts FROM PUBLIC,anon,authenticated;

ALTER TABLE giro63.instagram_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON giro63.instagram_deliveries FROM PUBLIC,anon,authenticated;

ALTER TABLE giro63.instagram_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON giro63.instagram_events FROM PUBLIC,anon,authenticated;
