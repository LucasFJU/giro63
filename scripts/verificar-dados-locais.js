import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
const db=new DatabaseSync(path.resolve('data/giro63.sqlite'),{readOnly:true});
try {
  const names=['users','editorial_categories','settings','articles','ads','sessions','article_daily_reads','ad_rotation','ad_deliveries','ad_daily','audience_daily'];
  for(const name of names){const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);if(exists)console.log(name+': '+db.prepare(`SELECT count(*) AS total FROM "${name}"`).get().total);}
} finally {db.close();}
