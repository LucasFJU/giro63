import {initializeInstagram} from './instagram-schema.js';
export const reviewColumns={confirmed_hash:"TEXT NOT NULL DEFAULT ''",review_completed_by:'INTEGER REFERENCES users(id)',review_completed_at:"TEXT NOT NULL DEFAULT ''",policy_version:"INTEGER NOT NULL DEFAULT 0",blockers:`TEXT NOT NULL DEFAULT '["LEGACY_REVIEW"]'`,review_reasons:"TEXT NOT NULL DEFAULT '[]'",review_pending:'INTEGER NOT NULL DEFAULT 0',reviewed_by:'INTEGER REFERENCES users(id)',reviewed_at:"TEXT NOT NULL DEFAULT ''",resolution_note:"TEXT NOT NULL DEFAULT ''",approved_cover:"TEXT NOT NULL DEFAULT ''",publication_counted:'INTEGER NOT NULL DEFAULT 0'};
export const editorialSchema=`
CREATE TABLE IF NOT EXISTS tags(slug TEXT PRIMARY KEY,name TEXT NOT NULL,normalized TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS article_tags(article_id INTEGER NOT NULL REFERENCES articles(id),tag_slug TEXT NOT NULL REFERENCES tags(slug),PRIMARY KEY(article_id,tag_slug));
CREATE TABLE IF NOT EXISTS automation_sources(id TEXT PRIMARY KEY,name TEXT NOT NULL,website TEXT NOT NULL,feed TEXT NOT NULL DEFAULT '',hosts TEXT NOT NULL,permission_note TEXT NOT NULL DEFAULT '',approved INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 0,region TEXT NOT NULL DEFAULT 'national',last_error TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS automation_items(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES automation_sources(id),uid TEXT NOT NULL,url TEXT NOT NULL,title TEXT NOT NULL,summary TEXT NOT NULL,fingerprint TEXT NOT NULL,original_at TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,article_id INTEGER REFERENCES articles(id),note TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,UNIQUE(source_id,uid),UNIQUE(url));
CREATE INDEX IF NOT EXISTS automation_queue ON automation_items(state,original_at);
CREATE INDEX IF NOT EXISTS automation_fingerprint ON automation_items(fingerprint);
CREATE TABLE IF NOT EXISTS automation_daily(day TEXT PRIMARY KEY,calls INTEGER NOT NULL DEFAULT 0,published INTEGER NOT NULL DEFAULT 0,national INTEGER NOT NULL DEFAULT 0,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS automation_lock(id TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS automation_events(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,message TEXT NOT NULL);
`;
export const initialSources=[
  ['agencia-brasil','Agência Brasil','https://agenciabrasil.ebc.com.br','https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml','agenciabrasil.ebc.com.br,rss.ebc.com.br','national'],
  ['g1-tocantins','G1 Tocantins','https://g1.globo.com/to/tocantins/','','g1.globo.com','regional'],
  ['agencia-tocantins','Agência Tocantins','https://www.agenciatocantins.com.br','','www.agenciatocantins.com.br,agenciatocantins.com.br','regional']
];
export async function initializeEditorial(db){
  await initializeInstagram(db);
  if(db.dialect!=='postgres'){
    await db.exec(editorialSchema);
    const columns=new Set((await db.prepare('PRAGMA table_info(automation_items)').all()).map(c=>c.name));
    for(const [name,type] of Object.entries(reviewColumns))if(!columns.has(name)){await db.exec('ALTER TABLE automation_items ADD COLUMN '+name+' '+type);if(name==='publication_counted')await db.prepare("UPDATE automation_items SET publication_counted=1 WHERE state='published'").run();}
  }
  for(const [id,name,website,feed,hosts,region] of initialSources)await db.prepare('INSERT INTO automation_sources(id,name,website,feed,hosts,region) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,name,website,feed,hosts,region);
  for(const [key,value] of [['automation_paused','1'],['automation_publish','0']])await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').run(key,value);
}
