import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import request from 'supertest';
import {createApp} from '../src/server.js';import {hashPassword} from '../src/db.js';
test('painel pagina e filtra no servidor, mantém totais e isola telas preservadas',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'giro-admin-')),app=await createApp({dataDir:dir,uploadDir:path.join(dir,'uploads')}),db=app.locals.db,token=r=>r.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
 try{for(const role of ['editor','author'])db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(role,role+'@test.example',hashPassword('Teste local de interface 123!'),role);
 const stamp=new Date().toISOString();for(let n=0;n<27;n++)db.prepare('INSERT INTO articles(slug,title,summary,body,category,city,status,author_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('news-'+n,'Educação '+n,'Resumo','<p>Texto</p>',n%2?'cidades':'brasil',n%2?'Palmas':'',n%2?'review':'draft',n%2?2:1,stamp,stamp);
 const login=async role=>{const agent=request.agent(app),page=await agent.get('/admin/login');await agent.post('/admin/login').type('form').send({_csrf:token(page),email:role+'@test.example',password:'Teste local de interface 123!'}).expect(302);return agent;};const editor=await login('editor');
 const home=await editor.get('/admin').expect(200);assert.equal((home.text.match(/tr data-status=/g)||[]).length,10);assert.doesNotMatch(home.text,/Da pauta à publicação/);
 const first=await editor.get('/admin/materias').expect(200);assert.equal((first.text.match(/tr data-status=/g)||[]).length,20);
 const second=await editor.get('/admin/materias?page=2').expect(200);assert.equal((second.text.match(/tr data-status=/g)||[]).length,7);
 const filtered=await editor.get('/admin/materias?q=EDUCACAO&status=review&category=cidades').expect(200);assert.equal((filtered.text.match(/tr data-status=/g)||[]).length,13);assert.match(filtered.text,/value="EDUCACAO"/);
 for(const route of ['/admin/audiencia','/admin/publicidade','/admin/login','/'])assert.doesNotMatch((await editor.get(route)).text,/href="\/admin-refined.css"/);
 assert.match(first.text,/href="\/admin-refined.css"/);const author=await login('author');const own=await author.get('/admin/materias').expect(200);assert.equal((own.text.match(/tr data-status=/g)||[]).length,13);assert.doesNotMatch(own.text,/href="\/admin\/automacao"/);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
