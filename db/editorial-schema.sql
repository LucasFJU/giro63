
CREATE TABLE IF NOT EXISTS giro63.tags(slug TEXT PRIMARY KEY,name TEXT NOT NULL,normalized TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS giro63.article_tags(article_id BIGINT NOT NULL REFERENCES giro63.articles(id),tag_slug TEXT NOT NULL REFERENCES giro63.tags(slug),PRIMARY KEY(article_id,tag_slug));
CREATE TABLE IF NOT EXISTS giro63.automation_sources(id TEXT PRIMARY KEY,name TEXT NOT NULL,website TEXT NOT NULL,feed TEXT NOT NULL DEFAULT '',hosts TEXT NOT NULL,permission_note TEXT NOT NULL DEFAULT '',approved INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 0,region TEXT NOT NULL DEFAULT 'national',last_error TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS giro63.automation_items(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES giro63.automation_sources(id),uid TEXT NOT NULL,url TEXT NOT NULL,title TEXT NOT NULL,summary TEXT NOT NULL,fingerprint TEXT NOT NULL,original_at TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,article_id BIGINT REFERENCES giro63.articles(id),note TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,UNIQUE(source_id,uid),UNIQUE(url));
CREATE INDEX IF NOT EXISTS automation_queue ON giro63.automation_items(state,original_at);
CREATE INDEX IF NOT EXISTS automation_fingerprint ON giro63.automation_items(fingerprint);
CREATE TABLE IF NOT EXISTS giro63.automation_daily(day TEXT PRIMARY KEY,calls INTEGER NOT NULL DEFAULT 0,published INTEGER NOT NULL DEFAULT 0,national INTEGER NOT NULL DEFAULT 0,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS giro63.automation_lock(id TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS giro63.automation_events(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,message TEXT NOT NULL);

REVOKE ALL ON ALL TABLES IN SCHEMA giro63 FROM PUBLIC,anon,authenticated;
