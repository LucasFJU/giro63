import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

// Keep the existing parameterized statement interface; all remote calls are awaited.
export function postgresSql(input) {
  let sql = input.replace(/\bBEGIN IMMEDIATE\b/g, 'BEGIN');
  if (/^INSERT OR IGNORE INTO /i.test(sql)) sql=sql.replace(/^INSERT OR IGNORE INTO /i,'INSERT INTO ')+' ON CONFLICT DO NOTHING';
  if (/^INSERT OR REPLACE INTO sessions/i.test(sql)) sql=sql.replace(/^INSERT OR REPLACE INTO /i,'INSERT INTO ')+' ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires=excluded.expires';
  sql=sql.replace(/SET (views|impressions|clicks)=\1\+1/g,(_,column)=>`SET ${column}=${/INTO\s+(\w+)/i.exec(sql)?.[1]}.${column}+1`);
  const tables='users|articles|ads|settings|editorial_categories|sessions|article_daily_reads|article_read_windows|ad_rotation|ad_deliveries|ad_daily|audience_daily|audience_deliveries|login_attempts';
  sql=sql.replace(new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+(${tables})\\b`,'gi'),(_,action,table)=>`${action} giro63.${table}`);
  sql=sql.replace(/\bnormalize_search\(/g,'giro63.normalize_search(');
  // Do not replace question marks inside string literals or quoted identifiers.
  let quoted=false,identifier=false,index=0,result='';
  for(let i=0;i<sql.length;i++){
    const ch=sql[i];
    if(ch==="'"&&!identifier){if(quoted&&sql[i+1]==="'"){result+="''";i++;continue;}quoted=!quoted;}
    if(ch==='"'&&!quoted)identifier=!identifier;
    result+=ch==='?'&&!quoted&&!identifier?'$'+(++index):ch;
  }
  return result;
}

export function openPostgres(connectionString,{pool:providedPool}={}) {
  if(!connectionString)throw Error('DATABASE_URL não configurada.');
  const pool=providedPool||new pg.Pool({connectionString,max:3,idleTimeoutMillis:20000,connectionTimeoutMillis:10000,application_name:'giro63'});
  const context=new AsyncLocalStorage();
  const query=(sql,values=[]) => (context.getStore()||pool).query(postgresSql(sql),values);
  const numbers=row=>row&&Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='string'&&/^(id|author_id|ad_id|last_id|n|total|views|reads|impressions|clicks|expires|expires_at)$/.test(k)&&/^-?\d+$/.test(v)?Number(v):v]));
  return {
    dialect:'postgres',
    prepare(sql){return {
      async all(...values){return (await query(sql,values)).rows.map(numbers);},
      async get(...values){return numbers((await query(sql,values)).rows[0]);},
      async run(...values){const insert=/^INSERT\s+(?:OR (?:IGNORE|REPLACE)\s+)?INTO\s+(users|articles|ads)\b/i.test(sql);const result=await query(sql+(insert?' RETURNING id':''),values);return {changes:result.rowCount,lastInsertRowid:insert?Number(result.rows[0]?.id):undefined};}
    };},
    async exec(sql){await query(sql);},
    async transaction(fn){
      if(context.getStore())return fn();
      const client=await pool.connect();
      try{return await context.run(client,async()=>{await client.query('BEGIN');try{const result=await fn();await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}});}finally{client.release();}
    },
    async close(){await pool.end();}
  };
}

const queues=new WeakMap();
export async function transaction(db,fn){
  if(db.transaction)return db.transaction(fn);
  const previous=queues.get(db)||Promise.resolve();let release;
  const gate=new Promise(resolve=>{release=resolve;});queues.set(db,gate);
  await previous;
  db.exec('BEGIN IMMEDIATE');
  try{const result=await fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}finally{release();}
}
