import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {createApp} from '../src/server.js';
import {openDatabase,hashPassword} from '../src/db.js';
import {PGlite} from '@electric-sql/pglite';
import {openPostgres,postgresSql,transaction} from '../src/postgres.js';
import {selectAd,recordAdEvent} from '../src/advertising.js';
import {popularArticles,publicCities} from '../src/reader-experience.js';
import {SQLiteSessionStore} from '../src/security.js';

test('PostgreSQL: parâmetros, schema privado, conflitos e sessões',async()=>{
  assert.throws(()=>openPostgres('senha-isolada'),/DATABASE_URL inválida/);
  assert.throws(()=>openPostgres('postgresql://postgres@localhost/postgres'),/DATABASE_URL inválida/);
  assert.throws(()=>openPostgres('postgresql://postgres:percentual%zz@localhost/postgres'),/DATABASE_URL inválida/);
  assert.equal(postgresSql("SELECT '?',? AS value, 'it''s ?'"),"SELECT '?',$1 AS value, 'it''s ?'");
  const engine=new PGlite();await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await engine.exec(readFileSync(new URL('../db/schema-postgres.sql',import.meta.url),'utf8'));
  const pool={query:(sql,values)=>engine.query(sql,values),connect:async()=>({query:(sql,values)=>engine.query(sql,values),release(){}}),end:()=>engine.close()};
  const db=openPostgres('postgres://test.invalid/database',{pool});
  try{
    await db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run('name','Giro63');
    await db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run('name','Duplicado');
    assert.equal((await db.prepare('SELECT * FROM settings WHERE key=?').get('name')).value,'Giro63');
    assert.equal((await db.prepare('SELECT normalize_search(?) AS value').get('SAÚDE E EDUCAÇÃO')).value,'saude e educacao');
    const store=new SQLiteSessionStore(db),call=(method,...args)=>new Promise((resolve,reject)=>store[method](...args,(error,result)=>error?reject(error):resolve(result)));
    await call('set','session',{userId:1});await call('set','session',{userId:2});assert.equal((await call('get','session')).userId,2);await call('destroy','session');assert.equal(await call('get','session'),null);
    const now=new Date().toISOString();
    const a=await db.prepare('INSERT INTO articles(slug,title,category,city,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?)').run('teste','Teste','cidades','Novo Acordo','published',now,now,now);
    assert.equal(typeof a.lastInsertRowid,'number');
    await db.prepare('INSERT INTO article_daily_reads(article_id,day,views) VALUES(?,?,1) ON CONFLICT(article_id,day) DO UPDATE SET views=views+1').run(a.lastInsertRowid,now.slice(0,10));
    await db.prepare('INSERT INTO article_daily_reads(article_id,day,views) VALUES(?,?,1) ON CONFLICT(article_id,day) DO UPDATE SET views=views+1').run(a.lastInsertRowid,now.slice(0,10));
    assert.equal((await popularArticles(db,Date.parse(now)+3*3600000))[0].reads,2);assert.ok((await publicCities(db)).includes('Novo Acordo'));
    for(let i=1;i<=2;i++)await db.prepare('INSERT INTO ads(name,image,alt,link,position) VALUES(?,?,?,?,?)').run('Campanha '+i,'/image','Descrição','https://example.com','top');
    const first=await selectAd(db,'top'),second=await selectAd(db,'top');assert.notEqual(first.id,second.id);
    await recordAdEvent(db,first.deliveryToken,'impression');await recordAdEvent(db,first.deliveryToken,'impression');await recordAdEvent(db,first.deliveryToken,'click');assert.equal((await db.prepare('SELECT * FROM ad_daily WHERE ad_id=?').get(first.id)).impressions,1);
    await assert.rejects(transaction(db,async()=>{await db.prepare('UPDATE settings SET value=? WHERE key=?').run('Erro','name');throw Error('Rollback');}));assert.equal((await db.prepare('SELECT * FROM settings WHERE key=?').get('name')).value,'Giro63');
    const roles=await engine.query("SELECT has_schema_privilege('anon','giro63','USAGE') allowed");assert.equal(roles.rows[0].allowed,false);
    const directory=mkdtempSync(path.join(os.tmpdir(),'giro63-postgres-')),local=openDatabase(directory);
    try{
      for(const table of ['settings','editorial_categories'])for(const row of local.prepare('SELECT * FROM '+table).all())await db.prepare(`INSERT OR IGNORE INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
      await db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run('Editor','editor@example.test',hashPassword('Senha de teste PostgreSQL!'),'editor');
      const app=await createApp({database:db,dataDir:directory,uploadDir:path.join(directory,'uploads'),seed:false});
      await request(app).get('/').expect(200);await request(app).get('/busca?q=teste').expect(200);
      const agent=request.agent(app),page=await agent.get('/admin/login').expect(200),csrf=page.text.match(/name="_csrf" value="([^"]+)"/)[1];
      await agent.post('/admin/login').type('form').send({_csrf:csrf,email:'EDITOR@example.test',password:'Senha de teste PostgreSQL!'}).expect(302);
      await agent.get('/admin').expect(200);await agent.get('/admin/publicidade').expect(200);await agent.get('/admin/audiencia').expect(200);await agent.get('/admin/instagram').expect(200);await agent.get('/admin/automacao').expect(200);await agent.get('/admin/automacao?status=published-review').expect(200);
    }finally{local.close();rmSync(directory,{recursive:true,force:true});}
  }finally{await db.close();}
});
