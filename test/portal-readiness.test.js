import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtempSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp,root } from '../src/server.js';
import { hashPassword } from '../src/db.js';
import { portalDefaults } from '../src/portal.js';
let dir,app,db,server,editor,author;
const csrf=page=>page.text.match(/name="csrf-token" content="([^"]+)"/)[1];
const audienceToken=page=>page.text.match(/name="audience-token" content="([^"]*)"/)[1];
const setting=(key,value)=>db.prepare('UPDATE settings SET value=? WHERE key=?').run(value,key);
async function login(email){const agent=request.agent(server),page=await agent.get('/admin/login');await agent.post('/admin/login').type('form').send({_csrf:csrf(page),email,password:'Senha de teste exclusiva!'}).expect(302);return agent;}
before(async()=>{dir=mkdtempSync(path.join(os.tmpdir(),'giro63-ready-'));app=createApp({dataDir:dir,uploadDir:path.join(dir,'uploads')});db=app.locals.db;server=app.listen(0,'127.0.0.1');for(const role of ['editor','author'])db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(role,role+'@example.test',hashPassword('Senha de teste exclusiva!'),role);editor=await login('editor@example.test');author=await login('author@example.test');});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150});});
test('metadados, compartilhamento, paginação e bloqueio inicial de indexação',async()=>{
 const home=await request(server).get('/').expect(200);assert.match(home.headers['x-robots-tag'],/noindex/);assert.match(home.text,/og-giro63.png/);assert.match(home.text,/apple-touch-icon/);
 assert.match((await request(server).get('/robots.txt')).text,/Disallow: \//);await request(server).get('/sitemap.xml').expect(503);
 for(const url of ['/ultimas','/editoria/cidades','/cidade/palmas','/pagina/sobre','/pagina/contato','/pagina/privacidade','/pagina/termos-de-uso']){const page=await request(server).get(url).expect(200);assert.match(page.text,/og:image/);assert.match(page.text,/rel="canonical"/);}
 setting('public_url','https://giro63.example');setting('indexing','1');
 const second=await request(server).get('/ultimas?page=2').expect(200);assert.match(second.text,/Últimas notícias — Página 2/);assert.match(second.text,/https:\/\/giro63.example\/ultimas\?page=2/);assert.equal(second.headers['x-robots-tag'],undefined);
 const demo=db.prepare('SELECT * FROM articles LIMIT 1').get();const page=await request(server).get('/noticia/'+demo.slug);assert.match(page.text,/og:type" content="article/);assert.match(page.headers['x-robots-tag'],/noindex/);assert.doesNotMatch(page.text,/og:image" content="http:\/\/localhost/);
 assert.match((await request(server).get('/busca?q=saude')).headers['x-robots-tag'],/noindex/);assert.match((await request(server).get('/inexistente')).headers['x-robots-tag'],/noindex/);
});
test('sitemap inclui só publicações reais; documentos legais exigem dados e revisão',async()=>{
 const item=db.prepare('SELECT * FROM articles LIMIT 1').get();setting('public_url','https://giro63.example');setting('indexing','1');
 let sitemap=await request(server).get('/sitemap.xml').expect(200);assert.doesNotMatch(sitemap.text,/\/noticia\//);assert.doesNotMatch(sitemap.text,/privacidade|termos-de-uso/);
 db.prepare('UPDATE articles SET demo=0 WHERE id=?').run(item.id);sitemap=await request(server).get('/sitemap.xml');assert.ok(sitemap.text.includes('/noticia/'+item.slug));assert.ok(sitemap.text.includes('/cidade/jalapao'));assert.doesNotMatch(sitemap.text,/\/admin|\/busca/);
 const fields={...portalDefaults,public_url:'https://giro63.example',indexing:'on',privacy_reviewed:'on',terms_reviewed:'on'};
 let page=await editor.get('/admin/portal').expect(200);const bad=await editor.post('/admin/portal').type('form').send({...fields,_csrf:csrf(page)}).expect(400);assert.match(bad.text,/data-error-for="privacy_reviewed"/);assert.equal(db.prepare("SELECT value FROM settings WHERE key='privacy_reviewed'").get().value,'0');
 await editor.post('/admin/portal').type('form').send({...fields,legal_owner:'Redação de testes',privacy_email:'privacidade@example.test',_csrf:csrf(bad)}).expect(302);
 const legal=await request(server).get('/pagina/privacidade');assert.doesNotMatch(legal.text,/Rascunho — revisão pendente/);assert.equal(legal.headers['x-robots-tag'],undefined);assert.match((await request(server).get('/sitemap.xml')).text,/\/pagina\/privacidade/);
 setting('privacy_reviewed','0');assert.match((await request(server).get('/pagina/privacidade')).text,/Rascunho — revisão pendente/);
 await author.get('/admin/portal').expect(403);const authorCsrf=csrf(await author.get('/admin'));await author.post('/admin/portal').type('form').send({_csrf:authorCsrf}).expect(403);await editor.post('/admin/portal').type('form').send({public_url:'javascript:alert(1)'}).expect(403);
 db.prepare('UPDATE articles SET demo=1 WHERE id=?').run(item.id);
});
test('audiência respeita aceite, recusa, token único, expiração e exclusão da equipe',async()=>{
 const reader=request.agent(server);let page=await reader.get('/pagina/sobre');const token=audienceToken(page);assert.ok(token);
 await reader.post('/audiencia/visualizacao').type('form').send({_csrf:csrf(page),token}).expect(403);assert.equal(db.prepare('SELECT COUNT(*) n FROM audience_daily').get().n,0);
 await reader.post('/preferencias-cookies').type('form').send({_csrf:csrf(page),choice:'accepted'}).expect(204);assert.equal((await reader.get('/preferencias-cookies')).body.choice,'accepted');
 await reader.post('/audiencia/visualizacao').type('form').send({_csrf:csrf(page),token}).expect(204);await reader.post('/audiencia/visualizacao').type('form').send({_csrf:csrf(page),token}).expect(403);
 assert.equal(db.prepare('SELECT SUM(views) n FROM audience_daily').get().n,1);
 page=await reader.get('/pagina/sobre');await reader.post('/preferencias-cookies').type('form').send({_csrf:csrf(page),choice:'rejected'}).expect(204);await reader.post('/audiencia/visualizacao').type('form').send({_csrf:csrf(page),token:audienceToken(page)}).expect(403);
 await reader.post('/preferencias-cookies').type('form').send({_csrf:csrf(page),choice:'accepted'}).expect(204);
 const now=Date.now;Date.now=()=>now()+300001;try{await reader.post('/audiencia/visualizacao').type('form').send({_csrf:csrf(page),token:audienceToken(page)}).expect(403);}finally{Date.now=now;}
 assert.equal(audienceToken(await editor.get('/')), '');assert.equal(audienceToken(await reader.get('/busca?q=segredo')), '');
 const preview=await editor.get('/admin/noticias/1/preview');assert.equal(audienceToken(preview),'');
 const head=await reader.head('/pagina/sobre').expect(200);assert.equal(head.text,undefined);
 const columns=db.prepare('PRAGMA table_info(audience_daily)').all().map(r=>r.name);assert.deepEqual(columns,['day','path','views']);
});
test('relatórios e limpeza de audiência, filtros e permissões',async()=>{
 db.prepare("INSERT INTO audience_daily VALUES('2020-01-01','/',999)").run();
 // A new application runs the startup retention cleanup against the same database.
 const reopened=createApp({dataDir:dir,uploadDir:path.join(dir,'uploads')});reopened.locals.db.close();assert.equal(db.prepare("SELECT COUNT(*) n FROM audience_daily WHERE day='2020-01-01'").get().n,0);
 const report=await editor.get('/admin/audiencia').expect(200);assert.match(report.text,/1 visualizações/);assert.match(report.text,/\/pagina\/sobre/);await author.get('/admin/audiencia').expect(403);await request(server).get('/admin/audiencia').expect(302);
 await editor.get('/admin/audiencia?from=2026-02-30&to=2026-03-01').expect(400);await editor.get('/admin/audiencia?from=2020-01-01&to=2026-01-01').expect(400);
 const totals=db.prepare('SELECT SUM(views) n FROM audience_daily').get().n;assert.equal(totals,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM ad_daily').get().n,0);
});
test('assets locais têm tamanhos corretos e são servidos com sucesso',async()=>{
 for(const [name,width,height] of [['images/og-giro63.png',1200,630],['icons/favicon-32.png',32,32],['icons/apple-touch-icon.png',180,180],['icons/android-512.png',512,512]]){const meta=await sharp(path.join(root,'public',name)).metadata();assert.equal(meta.width,width);assert.equal(meta.height,height);await request(server).get('/'+name).expect(200);}
 await request(server).get('/favicon.ico').expect(200);await request(server).get('/site.webmanifest').expect(200);
});
test('formulário preserva textos e capa anterior em upload inválido ou excessivo',async()=>{
 const item=db.prepare('SELECT * FROM articles LIMIT 1').get(),page=await editor.get('/admin/noticias/'+item.id);const fields={_csrf:csrf(page),title:'Texto preservado após falha',summary:'Resumo que não pode desaparecer',body:'<p>Conteúdo mantido.</p>',category:'cidades',city:'Palmas',credit:'Crédito de teste',action:'draft'};
 let req=editor.post('/admin/noticias/'+item.id);for(const [k,v] of Object.entries(fields))req=req.field(k,v);const invalid=await req.attach('image',Buffer.from('imagem falsa'),{filename:'falsa.jpg',contentType:'image/jpeg'}).expect(400);assert.match(invalid.text,/Texto preservado após falha/);assert.equal(db.prepare('SELECT cover FROM articles WHERE id=?').get(item.id).cover,item.cover);
 req=editor.post('/admin/noticias/'+item.id);for(const [k,v] of Object.entries(fields))req=req.field(k,v);const huge=await req.attach('image',Buffer.alloc(8*1024*1024+1),{filename:'grande.jpg',contentType:'image/jpeg'}).expect(400);assert.match(huge.text,/Resumo que não pode desaparecer/);assert.equal(db.prepare('SELECT cover FROM articles WHERE id=?').get(item.id).cover,item.cover);
});
