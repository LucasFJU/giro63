import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import request from 'supertest';
import {createApp} from '../src/server.js';import {hashPassword} from '../src/db.js';
test('painel pagina e filtra no servidor, mantém totais e isola telas preservadas',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'giro-admin-')),app=await createApp({dataDir:dir,uploadDir:path.join(dir,'uploads')}),db=app.locals.db,token=r=>r.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{for(const role of ['editor','author'])db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(role,role+'@test.example',hashPassword('Teste local de interface 123!'),role);
 const stamp=new Date().toISOString();for(let n=0;n<27;n++)db.prepare('INSERT INTO articles(slug,title,summary,body,category,city,status,author_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('news-'+n,'Educação '+n,'Resumo','<p>Texto</p>',n%2?'cidades':'brasil',n%2?'Palmas':'',n%2?'review':'draft',n%2?2:1,stamp,stamp);
 const login=async role=>{const agent=request.agent(server),page=await agent.get('/admin/login');await agent.post('/admin/login').type('form').send({_csrf:token(page),email:role+'@test.example',password:'Teste local de interface 123!'}).expect(302);return agent;};const editor=await login('editor');
 const home=await editor.get('/admin').expect(200);assert.equal((home.text.match(/tr data-status=/g)||[]).length,10);assert.doesNotMatch(home.text,/Da pauta à publicação/);
 const first=await editor.get('/admin/materias').expect(200);assert.equal((first.text.match(/tr data-status=/g)||[]).length,20);
 const second=await editor.get('/admin/materias?page=2').expect(200);assert.equal((second.text.match(/tr data-status=/g)||[]).length,7);
 const filtered=await editor.get('/admin/materias?q=EDUCACAO&status=review&category=cidades').expect(200);assert.equal((filtered.text.match(/tr data-status=/g)||[]).length,13);assert.match(filtered.text,/value="EDUCACAO"/);
 for(const route of ['/admin/audiencia','/admin/publicidade','/admin/login','/'])assert.doesNotMatch((await editor.get(route)).text,/href="\/admin-refined.css"/);
 assert.match(first.text,/href="\/admin-refined.css"/);const author=await login('author');const own=await author.get('/admin/materias').expect(200);assert.equal((own.text.match(/tr data-status=/g)||[]).length,13);assert.doesNotMatch(own.text,/href="\/admin\/automacao"/);

 const csrf=token(await editor.get('/admin/materias'));await editor.post('/admin/materias/1/arquivar').type('form').send({}).expect(403);await editor.post('/admin/materias/1/arquivar').type('form').send({_csrf:csrf}).expect(302);
 assert.ok(db.prepare('SELECT archived_at FROM articles WHERE id=1').get().archived_at);await editor.get('/admin/noticias/1').expect(409);assert.doesNotMatch((await editor.get('/admin/materias')).text,/href="\/admin\/noticias\/1"/);assert.match((await editor.get('/admin/materias?status=archived')).text,/Restaurar rascunho/);
 await editor.post('/admin/materias/1/restaurar').type('form').send({_csrf:csrf}).expect(302);assert.equal(db.prepare('SELECT archived_at FROM articles WHERE id=1').get().archived_at,'');
 db.prepare("UPDATE articles SET status='published' WHERE id=1").run();await request(server).get('/noticia/news-0').expect(200);await author.post('/admin/materias/1/excluir').type('form').send({_csrf:token(await author.get('/admin/materias'))}).expect(403);
 await editor.post('/admin/materias/1/excluir').type('form').send({_csrf:csrf}).expect(302);await request(server).get('/noticia/news-0').expect(404);assert.match((await editor.get('/admin/materias?status=trash')).text,/Restaurar rascunho/);await editor.post('/admin/materias/1/restaurar').type('form').send({_csrf:csrf}).expect(302);assert.equal(db.prepare('SELECT status FROM articles WHERE id=1').get().status,'draft');assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n,27);
 for(let n=0;n<32;n++){db.prepare('INSERT INTO tags(slug,name,normalized) VALUES(?,?,?)').run('tag-'+n,'Assunto '+n,'assunto '+n);db.prepare('INSERT INTO editorial_categories(slug,name,position) VALUES(?,?,?)').run('editoria-'+n,'Editoria '+n,n+10);}
 for(const route of ['/admin/tags','/admin/categorias']){const directory=await editor.get(route).expect(200);assert.equal((directory.text.match(/class="directory-row"/g)||[]).length,15);const next=await editor.get(route+'?page=2').expect(200);assert.equal((next.text.match(/class="directory-row"/g)||[]).length,15);assert.match(next.text,/Página 2 de/);}
 const edit=await editor.get('/admin/tags?q=Assunto&edit=tag-0').expect(200);assert.equal((edit.text.match(/class="directory-editor"/g)||[]).length,1);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});}
});
