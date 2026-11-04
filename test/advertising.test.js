import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import sharp from 'sharp';
import { openDatabase, hashPassword } from '../src/db.js';
import { createApp } from '../src/server.js';
import { parseLocalDateTime, localDateTime, campaignState, selectAd, recordAdEvent } from '../src/advertising.js';

test('campanhas: datas de São Paulo e limites de início e término',()=>{
  const start=parseLocalDateTime('2026-11-10T08:00'),end=parseLocalDateTime('2026-11-11T08:00');
  assert.equal(start,'2026-11-10T11:00:00.000Z');assert.equal(localDateTime(start),'2026-11-10T08:00');
  assert.throws(()=>parseLocalDateTime('2026-02-30T10:00'));assert.throws(()=>parseLocalDateTime('amanhã'));
  const ad={active:1,archived:0,starts_at:start,ends_at:end};
  assert.equal(campaignState(ad,Date.parse(start)-1),'scheduled');assert.equal(campaignState(ad,Date.parse(start)),'running');
  assert.equal(campaignState(ad,Date.parse(end)-1),'running');assert.equal(campaignState(ad,Date.parse(end)),'ended');
  assert.equal(campaignState({...ad,active:0},Date.parse(start)),'paused');assert.equal(campaignState({...ad,archived:1},Date.parse(start)),'archived');
});

test('migração preserva anúncios legados, rodízio e métricas persistem sem duplicação',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'giro63-ads-'));let db;
  try{
    const legacy=new DatabaseSync(path.join(dir,'giro63.sqlite'));legacy.exec("CREATE TABLE ads(id INTEGER PRIMARY KEY,name TEXT NOT NULL,image TEXT NOT NULL,alt TEXT NOT NULL,link TEXT NOT NULL DEFAULT '',position TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1); INSERT INTO ads(name,image,alt,link,position) VALUES('Legado','/images/cerrado.jpg','Descrição','https://example.com','top');");legacy.close();
    db=openDatabase(dir);const old=db.prepare('SELECT * FROM ads WHERE id=1').get();assert.equal(old.active,1);assert.equal(old.archived,0);assert.equal(old.starts_at,null);assert.equal(old.advertiser,'');
    const insert=db.prepare('INSERT INTO ads(name,image,alt,link,position,active,archived,starts_at,ends_at) VALUES(?,?,?,?,?,?,?,?,?)');
    insert.run('Segunda','/image','Arte','','top',1,0,null,null);
    insert.run('Pausada','/image','Arte','','top',0,0,null,null);
    insert.run('Arquivada','/image','Arte','','top',1,1,null,null);
    insert.run('Futura','/image','Arte','','top',1,0,'2030-01-01T03:00:00.000Z',null);
    insert.run('Encerrada','/image','Arte','','top',1,0,null,'2020-01-01T03:00:00.000Z');
    const now=Date.parse('2026-11-10T02:59:59Z'),one=selectAd(db,'top',now);assert.equal(one.id,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM ad_daily').get().n,0);
    db.close();db=openDatabase(dir);assert.equal(selectAd(db,'top',now).id,2);assert.equal(selectAd(db,'top',now).id,1);
    recordAdEvent(db,one.deliveryToken,'impression',now);recordAdEvent(db,one.deliveryToken,'impression',now);recordAdEvent(db,one.deliveryToken,'click',now);recordAdEvent(db,one.deliveryToken,'click',now);
    const daily=db.prepare('SELECT * FROM ad_daily').get();assert.equal(daily.day,'2026-11-09');assert.equal(daily.impressions,1);assert.equal(daily.clicks,1);
    assert.equal(recordAdEvent(db,'fake','impression',now),null);assert.equal(recordAdEvent(db,one.deliveryToken,'impression',now+3600000),null);
    const noLink=selectAd(db,'top',now);assert.equal(recordAdEvent(db,noLink.deliveryToken,'click',now),null);assert.equal(selectAd(db,'sidebar',now),null);
    db.close();db=openDatabase(dir);assert.equal(db.prepare('SELECT clicks FROM ad_daily').get().clicks,1);recordAdEvent(db,one.deliveryToken,'click',now);assert.equal(db.prepare('SELECT clicks FROM ad_daily').get().clicks,1);
  }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});

test('gestão de campanhas: permissões, programação, prévia, cliques, relatório e arquivo',async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'giro63-ad-http-'));const app=createApp({dataDir:dir,uploadDir:path.join(dir,'uploads'),seed:false}),db=app.locals.db;
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
    for(const role of ['editor','author'])db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(role,role+'@example.test',hashPassword('Senha de teste exclusiva 63!'),role);
    const token=r=>r.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const login=async role=>{const a=request.agent(server),page=await a.get('/admin/login');await a.post('/admin/login').type('form').send({_csrf:token(page),email:role+'@example.test',password:'Senha de teste exclusiva 63!'}).expect(302);return a;};
    const editor=await login('editor'),author=await login('author');const csrf=async()=>token(await editor.get('/admin/publicidade/nova').expect(200));
    await request(server).get('/admin/publicidade').expect(302);await author.get('/admin/publicidade').expect(403);await author.post('/admin/publicidade').expect(403);await editor.post('/admin/publicidade/1/arquivar').expect(403);
    const image=await sharp({create:{width:100,height:25,channels:3,background:'#ED521A'}}).png().toBuffer();
    await editor.post('/admin/publicidade').field('_csrf',await csrf()).field('name','Campanha inicial').field('advertiser','Empresa exemplo').field('alt','Arte da empresa').field('link','https://example.com/oferta').field('position','top').field('active','on').attach('image',image,'arte.png').expect(302);
    let item=db.prepare('SELECT * FROM ads').get();assert.equal(item.active,0);assert.doesNotMatch((await request(server).get('/')).text,/data-ad-token/);
    const toggle=()=>editor.post(`/admin/publicidade/${item.id}/alternar`).type('form');
    await toggle().send({_csrf:await csrf()}).expect(302);item=db.prepare('SELECT * FROM ads').get();assert.equal(item.active,1);
    const page=await request(server).get('/').expect(200),delivery=page.text.match(/data-ad-token="([a-f0-9]+)"/)[1];
    const cursor=db.prepare('SELECT last_id FROM ad_rotation').get().last_id,deliveries=db.prepare('SELECT COUNT(*) n FROM ad_deliveries').get().n;
    await editor.get(`/admin/publicidade/${item.id}/preview`).expect(200);await editor.get(`/admin/publicidade/${item.id}`).expect(200);await request(server).get(item.image).expect(200);
    assert.equal(db.prepare('SELECT last_id FROM ad_rotation').get().last_id,cursor);assert.equal(db.prepare('SELECT COUNT(*) n FROM ad_deliveries').get().n,deliveries);
    await request(server).post('/publicidade/exibicao').type('form').send({token:'invalid'}).expect(400);
    await request(server).post('/publicidade/exibicao').set('Origin','https://evil.example').type('form').send({token:delivery}).expect(403);
    for(let i=0;i<2;i++)await request(server).post('/publicidade/exibicao').type('form').send({token:delivery}).expect(204);
    for(let i=0;i<2;i++)await request(server).get('/publicidade/clique/'+delivery).expect(302).expect('Location','https://example.com/oferta');
    const stats=db.prepare('SELECT * FROM ad_daily').get();assert.equal(stats.impressions,1);assert.equal(stats.clicks,1);
    await author.get(`/admin/publicidade/${item.id}/resultados`).expect(403);await editor.get(`/admin/publicidade/${item.id}/resultados`).expect(200);await editor.get(`/admin/publicidade/${item.id}/resultados?from=2026-12-01&to=2026-01-01`).expect(400);
    const invalid=await editor.post(`/admin/publicidade/${item.id}`).field('_csrf',await csrf()).field('name','Texto preservado').field('advertiser','Anunciante preservado').field('alt','Arte alterada').field('link','https://example.com').field('position','sidebar').field('starts_at','2026-11-12T10:00').field('ends_at','2026-11-11T10:00').expect(400);
    assert.match(invalid.text,/Texto preservado/);assert.match(invalid.text,/Anunciante preservado/);assert.equal(db.prepare('SELECT image FROM ads').get().image,item.image);
    await editor.post(`/admin/publicidade/${item.id}`).field('_csrf',await csrf()).field('name','Campanha agendada').field('alt','Arte da empresa').field('position','top').field('active','on').field('starts_at','2030-01-01T08:00').field('ends_at','2030-02-01T08:00').expect(302);
    assert.doesNotMatch((await request(server).get('/')).text,/data-ad-token/);
    for(let i=0;i<2;i++)await editor.post(`/admin/publicidade/${item.id}/arquivar`).type('form').send({_csrf:await csrf()}).expect(302);
    item=db.prepare('SELECT * FROM ads').get();assert.equal(item.archived,0);assert.equal(item.active,0);assert.equal(db.prepare('SELECT clicks FROM ad_daily').get().clicks,1);
    await editor.get('/admin/publicidade?q=Empresa&status=paused&position=top').expect(200);
  }finally{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});}
});
