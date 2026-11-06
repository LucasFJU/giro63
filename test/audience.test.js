import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {hashPassword} from '../src/db.js';
import {createApp} from '../src/server.js';

const login=async(app,email)=>{const agent=request.agent(app),page=await agent.get('/admin/login'),csrf=page.text.match(/name="_csrf" value="([^"]+)"/)[1];await agent.post('/admin/login').type('form').send({_csrf:csrf,email,password:'Senha de teste editorial!'}).expect(302);return agent;};

test('painel de audiência: indicadores, gráfico, títulos das matérias, estado vazio e datas inválidas',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'giro63-audience-')),app=await createApp({dataDir:dir,uploadDir:path.join(dir,'uploads')}),db=app.locals.db;
 try{
  for(const role of ['author','editor'])await db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(role,role+'@example.test',hashPassword('Senha de teste editorial!'),role);
  const now=new Date().toISOString(),day=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
  await db.prepare("INSERT INTO articles(slug,title,category,status,created_at,updated_at) VALUES('plano-de-obras','Plano de obras <b>2027</b>','cidades','published',?,?)").run(now,now);
  const add=db.prepare('INSERT INTO audience_daily(day,path,views) VALUES(?,?,?)');
  await add.run(day(1),'/',30);await add.run(day(1),'/noticia/plano-de-obras',12);await add.run(day(2),'/noticia/plano-de-obras',8);
  const editor=await login(app,'editor@example.test');
  const page=await editor.get('/admin/audiencia').expect(200);
  assert.match(page.text,/<svg[^>]+role="img"/);
  assert.match(page.text,/Plano de obras &lt;b&gt;2027&lt;\/b&gt;/);
  assert.doesNotMatch(page.text,/Plano de obras <b>/);
  assert.match(page.text,/Por tipo de página/);
  assert.match(page.text,/>50<\/strong>/);
  assert.doesNotMatch(page.text,/style="/);
  assert.match((await editor.get('/admin/audiencia?from=2020-01-01&to=2020-01-05').expect(200)).text,/Ainda não há visualizações/);
  await editor.get('/admin/audiencia?from=2026-12-31&to=2026-01-01').expect(400);
  await editor.get('/admin/audiencia?from=2024-01-01&to=2026-01-01').expect(400);
  const author=await login(app,'author@example.test');
  assert.notEqual((await author.get('/admin/audiencia')).status,200);
  await request(app).get('/admin/audiencia').expect(302);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
