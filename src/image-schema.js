export const imageColumns={photo_photographer:"TEXT NOT NULL DEFAULT ''",photo_source:"TEXT NOT NULL DEFAULT ''",photo_source_url:"TEXT NOT NULL DEFAULT ''",photo_license:"TEXT NOT NULL DEFAULT ''",photo_caption:"TEXT NOT NULL DEFAULT ''",photo_cover:"TEXT NOT NULL DEFAULT ''",photo_thumb:"TEXT NOT NULL DEFAULT ''",photo_share:"TEXT NOT NULL DEFAULT ''",photo_x:'INTEGER NOT NULL DEFAULT 50',photo_y:'INTEGER NOT NULL DEFAULT 50'};
export const suggestionSchema=`CREATE TABLE IF NOT EXISTS article_image_suggestions(id TEXT PRIMARY KEY,article_id INTEGER NOT NULL REFERENCES articles(id),image_url TEXT NOT NULL,source_page TEXT NOT NULL,source TEXT NOT NULL DEFAULT '',photographer TEXT NOT NULL DEFAULT '',caption TEXT NOT NULL DEFAULT '',alt TEXT NOT NULL DEFAULT '',license TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),created_at TEXT NOT NULL,reviewed_at TEXT,reviewed_by INTEGER REFERENCES users(id),UNIQUE(article_id,image_url)); CREATE INDEX IF NOT EXISTS image_suggestion_article ON article_image_suggestions(article_id,status);`;
export function initializeImages(db){
 if(db.dialect==='postgres')return;
 const existing=new Set(db.prepare('PRAGMA table_info(articles)').all().map(x=>x.name));
 for(const [name,type] of Object.entries(imageColumns))if(!existing.has(name))db.exec(`ALTER TABLE articles ADD COLUMN ${name} ${type}`);
 db.exec(suggestionSchema);
}
