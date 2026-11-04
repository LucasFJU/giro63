// Produces an ignored, sensitive local export for a one-time cloud import.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const db=new DatabaseSync(path.resolve(process.env.GIRO63_DATA_DIR||'data','giro63.sqlite'),{readOnly:true});
const tables=['users','editorial_categories','settings','articles','ads','article_daily_reads','ad_rotation','ad_daily','audience_daily'];
const quote=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
const statements=['BEGIN;',"DO $$ BEGIN IF EXISTS(SELECT 1 FROM giro63.users) OR EXISTS(SELECT 1 FROM giro63.articles) THEN RAISE EXCEPTION 'O destino já contém dados. Não sobrescrever.'; END IF; END $$;"];
const counts={};
try{
  for(const table of tables){
    if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
    const rows=db.prepare(`SELECT * FROM ${table}`).all();counts[table]=rows.length;
    for(const row of rows){
      if(table==='settings'&&row.key==='indexing')row.value='0';
      if(table==='settings'&&row.key==='public_url'&&/^http:\/\/(localhost|127\.)/.test(row.value))row.value='';
      statements.push(`INSERT INTO giro63.${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')});`);
    }
  }
  for(const table of ['users','articles','ads'])statements.push(`SELECT setval(pg_get_serial_sequence('giro63.${table}','id'),COALESCE(MAX(id),1),MAX(id) IS NOT NULL) FROM giro63.${table};`);
  statements.push('COMMIT;');mkdirSync('exports',{recursive:true});writeFileSync('exports/import-postgres.sql',statements.join('\n'),{mode:0o600});
  console.log(JSON.stringify({file:'exports/import-postgres.sql',counts}));
}finally{db.close();}
