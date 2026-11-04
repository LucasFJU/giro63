import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../src/server.js';
import { hashPassword, verifyPassword } from '../src/db.js';

let dir,app,server,db,editor,author,other;
const password='Senha exclusiva de teste 63!';
const token = response => {const match=response.text.match(/name="_csrf" value="([^"]+)"/);assert.ok(match,'Token CSRF presente');return match[1];};
async function login(email){const agent=request.agent(server);const page=await agent.get('/admin/login');await agent.post('/admin/login').type('form').send({_csrf:token(page),email,password}).expect(302);return agent;}
async function csrfFor(agent,url='/admin/noticias/nova'){return token(await agent.get(url).expect(200));}
const fields={title:'Uma reportagem para testar o Giro63',summary:'Um resumo verificado para a matéria de teste.',body:'<p>Conteúdo apurado com contexto e fontes.</p>',category:'cidades',city:'Palmas',credit:'Equipe de testes',sources:'Entrevista de teste',demo:'',featured:'0'};
async function postArticle(agent,url,values={},image=null){let r=agent.post(url).field('_csrf',await csrfFor(agent));for(const [k,v]of Object.entries({...fields,...values}))r=r.field(k,String(v));if(image)r=r.attach('image',image,{filename:'capa.png',contentType:'image/png'});return r;}
before(async()=>{
  dir=mkdtempSync(path.join(os.tmpdir(),'giro63-test-'));app=createApp({dataDir:dir,uploadDir:path.join(dir,'uploads'),seed:true});db=app.locals.db;
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  for(const [name,email,role]of [['Editor','editor@example.test','editor'],['Autor','autor@example.test','author'],['Outra pessoa','outra@example.test','author']])db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name,email,hashPassword(password),role);
  editor=await login('editor@example.test');author=await login('autor@example.test');other=await login('outra@example.test');
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150});});

test('senha usa salt individual e scrypt com verificação correta',()=>{const h=hashPassword(password);assert.notEqual(h,hashPassword(password));assert.ok(verifyPassword(password,h));assert.equal(verifyPassword('errada',h),false);assert.equal(verifyPassword(password,'corrompido'),false);});
test('site, editorias, cidades e todas as páginas institucionais renderizam',async()=>{
  for(const url of ['/','/ultimas','/editoria/cidades','/editoria/politica','/cidade/palmas','/pagina/sobre','/pagina/expediente','/pagina/contato','/pagina/anuncie','/pagina/politica-editorial'])await request(app).get(url).expect(200);
  const home=await request(app).get('/');assert.match(home.text,/EDIÇÃO DEMONSTRATIVA/);assert.match(home.headers['content-security-policy'],/script-src 'self'/);
  const article=db.prepare("SELECT * FROM articles WHERE status='published' LIMIT 1").get();const read=await request(app).get('/noticia/'+article.slug).expect(200);assert.match(read.text,/Conteúdo demonstrativo/);assert.match(read.text,/og:image/);assert.match(read.text,/WhatsApp/);
  for(const url of ['/inexistente','/editoria/inexistente','/cidade/inexistente','/noticia/inexistente'])await request(app).get(url).expect(404);
});
test('busca e paginação retornam resultados reais e estado vazio',async()=>{
  const search=await request(app).get('/busca?q=Palmas').expect(200);assert.match(search.text,/Palmas, uma cidade/);
  const empty=await request(app).get('/busca?q=xyzsemresultado').expect(200);assert.match(empty.text,/Nenhuma história/);
  const first=await request(app).get('/ultimas').expect(200),second=await request(app).get('/ultimas?page=2').expect(200);assert.match(first.text,/Página 1 de 2/);assert.match(second.text,/Página 2 de 2/);
  await request(app).get('/busca?q=%27%20OR%201%3D1--').expect(200);
});
test('painel exige login e mutações exigem CSRF válido',async()=>{
  await request(app).get('/admin').expect(302).expect('Location','/admin/login');
  await editor.post('/admin/configuracoes').type('form').send({name:'Alterado'}).expect(403);
  await editor.post('/admin/noticias').field('title','Sem token').expect(403);
  const agent=request.agent(app),page=await agent.get('/admin/login');await agent.post('/admin/login').type('form').send({_csrf:token(page),email:'editor@example.test',password:'senha errada'}).expect(401);
});
test('editor pode acessar páginas administrativas; autor é bloqueado',async()=>{
  for(const url of ['/admin','/admin/noticias/nova','/admin/equipe','/admin/configuracoes','/admin/publicidade'])await editor.get(url).expect(200);
  for(const url of ['/admin/equipe','/admin/configuracoes','/admin/publicidade'])await author.get(url).expect(403);
  await author.post('/admin/equipe').type('form').send({_csrf:await csrfFor(author)}).expect(403);
});
test('fluxo completo: rascunho, revisão, devolução, publicação e retirada',async()=>{
  assert.equal((await postArticle(author,'/admin/noticias',{action:'draft'})).status,302);
  let a=db.prepare('SELECT * FROM articles WHERE title=?').get(fields.title);assert.ok(a);assert.equal(a.status,'draft');
  await request(app).get('/noticia/'+a.slug).expect(404);
  await author.get(`/admin/noticias/${a.id}/preview`).expect(200);
  await other.get(`/admin/noticias/${a.id}`).expect(403);
  const illegal=await postArticle(other,`/admin/noticias/${a.id}`,{action:'draft'});assert.equal(illegal.status,403);
  const publishAttempt=await postArticle(author,`/admin/noticias/${a.id}`,{action:'published'});assert.equal(publishAttempt.status,403);
  assert.equal((await postArticle(author,`/admin/noticias/${a.id}`,{action:'review'})).status,302);assert.equal(db.prepare('SELECT status FROM articles WHERE id=?').get(a.id).status,'review');
  assert.equal((await postArticle(editor,`/admin/noticias/${a.id}`,{action:'draft',feedback:'Adicione contexto.'})).status,302);
  assert.match((await author.get(`/admin/noticias/${a.id}`)).text,/Adicione contexto/);
  await postArticle(author,`/admin/noticias/${a.id}`,{action:'review'});
  assert.equal((await postArticle(editor,`/admin/noticias/${a.id}`,{action:'published',featured:'1'})).status,302);
  a=db.prepare('SELECT * FROM articles WHERE id=?').get(a.id);assert.equal(a.status,'published');assert.equal(a.featured,1);
  assert.equal(db.prepare("SELECT count(*) n FROM articles WHERE featured=1 AND status='published'").get().n,1);
  await request(app).get('/noticia/'+a.slug).expect(200);await author.get(`/admin/noticias/${a.id}`).expect(403);
  assert.equal((await postArticle(editor,`/admin/noticias/${a.id}`,{action:'draft'})).status,302);await request(app).get('/noticia/'+a.slug).expect(404);
});
test('sanitização remove scripts, atributos e links executáveis',async()=>{
  const response=await postArticle(editor,'/admin/noticias',{title:'Sanitização de conteúdo',action:'draft',body:'<p onclick="alert(1)">Texto</p><script>alert(2)</script><a href="javascript:alert(3)">Link</a><img src=x onerror=alert(4)><h2>Título</h2>'});assert.equal(response.status,302);
  const saved=db.prepare('SELECT body FROM articles WHERE title=?').get('Sanitização de conteúdo').body;
  assert.doesNotMatch(saved,/script|onclick|onerror|javascript|<img/);assert.match(saved,/<h2>Título<\/h2>/);
});
test('publicação real valida fontes e crédito; upload valida conteúdo da imagem',async()=>{
  const invalid=await postArticle(editor,'/admin/noticias',{title:'Publicação incompleta',action:'published',sources:'',credit:''});assert.equal(invalid.status,400);
  const fake=await postArticle(editor,'/admin/noticias',{title:'Imagem inválida',action:'draft'},Buffer.from('isto não é um PNG'));assert.equal(fake.status,400);
  const image=await sharp({create:{width:60,height:40,channels:3,background:'#102a43'}}).png().toBuffer();
  const valid=await postArticle(editor,'/admin/noticias',{title:'Matéria com imagem validada',action:'published'},image);assert.equal(valid.status,302);
  const row=db.prepare('SELECT * FROM articles WHERE title=?').get('Matéria com imagem validada');assert.match(row.cover,/^\/uploads\/[a-f0-9]+\.webp$/);assert.ok(existsSync(path.join(dir,row.cover)));
  await request(app).get(row.cover).expect(200).expect('Content-Type',/webp/);
});
test('publicidade pode ser criada, editada, ativada e retirada',async()=>{
  const image=await sharp({create:{width:160,height:40,channels:3,background:'#c96b3b'}}).png().toBuffer();
  const csrf=await csrfFor(editor,'/admin/publicidade');
  await editor.post('/admin/publicidade').field('_csrf',csrf).field('name','Anúncio de teste').field('alt','Publicidade de teste').field('link','https://example.com').field('position','top').field('active','on').attach('image',image,'banner.png').expect(302);
  let ad=db.prepare('SELECT * FROM ads WHERE name=?').get('Anúncio de teste');assert.equal(ad.active,0);
  await editor.post(`/admin/publicidade/${ad.id}/alternar`).type('form').send({_csrf:await csrfFor(editor,'/admin/publicidade')}).expect(302);
  assert.match((await request(app).get('/')).text,/Publicidade de teste/);
  await editor.get(`/admin/publicidade/${ad.id}`).expect(200);
  await editor.post(`/admin/publicidade/${ad.id}`).field('_csrf',await csrfFor(editor,`/admin/publicidade/${ad.id}`)).field('name','Anúncio atualizado').field('alt','Descrição atualizada').field('link','https://example.org').field('position','sidebar').field('active','on').expect(302);
  ad=db.prepare('SELECT * FROM ads WHERE id=?').get(ad.id);assert.equal(ad.position,'sidebar');assert.equal(ad.alt,'Descrição atualizada');
  await editor.post(`/admin/publicidade/${ad.id}/alternar`).type('form').send({_csrf:await csrfFor(editor,'/admin/publicidade')}).expect(302);assert.equal(db.prepare('SELECT active FROM ads WHERE id=?').get(ad.id).active,0);
  await author.post('/admin/publicidade').field('_csrf',await csrfFor(author)).expect(403);
});
test('equipe: cadastro, desativação revoga sessões e proteção da própria conta',async()=>{
  const csrf=await csrfFor(editor,'/admin/equipe');
  await editor.post('/admin/equipe').type('form').send({_csrf:csrf,name:'Nova pessoa',email:'nova@example.test',password,role:'author'}).expect(302);
  const person=db.prepare('SELECT * FROM users WHERE email=?').get('nova@example.test');assert.ok(person);const agent=await login(person.email);
  await editor.post(`/admin/equipe/${person.id}/alternar`).type('form').send({_csrf:await csrfFor(editor,'/admin/equipe')}).expect(302);await agent.get('/admin').expect(302);
  await editor.post('/admin/equipe/1/alternar').type('form').send({_csrf:await csrfFor(editor,'/admin/equipe')}).expect(302);assert.equal(db.prepare('SELECT active FROM users WHERE id=1').get().active,1);
});
test('configurações validam URLs e refletem contatos no site',async()=>{
  const data={_csrf:await csrfFor(editor,'/admin/configuracoes'),name:'Giro63',tagline:'O Tocantins em perspectiva.',instagram:'https://www.instagram.com/giro63.teste/',email:'redacao@example.test',phone:'A preencher',about:'Sobre de teste',staff:'Expediente de teste',editorial:'Política de teste'};
  await editor.post('/admin/configuracoes').type('form').send({...data,instagram:'javascript:alert(1)'}).expect(400);
  await editor.post('/admin/configuracoes').type('form').send(data).expect(302);
  const home=await request(app).get('/');assert.match(home.text,/instagram.com\/giro63.teste/);
  assert.match((await request(app).get('/pagina/contato')).text,/redacao@example.test/);
});
test('dados e sessões sobrevivem à reabertura da aplicação',async()=>{
  const second=createApp({dataDir:dir,uploadDir:path.join(dir,'uploads'),seed:true});
  try{assert.equal(second.locals.db.prepare('SELECT count(*) AS n FROM articles').get().n,db.prepare('SELECT count(*) AS n FROM articles').get().n);assert.equal(second.locals.db.prepare('SELECT value FROM settings WHERE key=?').get('email').value,'redacao@example.test');const sessionCount=second.locals.db.prepare('SELECT count(*) n FROM sessions').get().n;assert.ok(sessionCount>0);await request(second).get('/').expect(200);}finally{second.locals.db.close();}
});
test('logout encerra a sessão',async()=>{const agent=await login('editor@example.test');await agent.post('/admin/logout').type('form').send({_csrf:await csrfFor(agent)}).expect(302);await agent.get('/admin').expect(302).expect('Location','/admin/login');});

test('categorias: editor cria e renomeia, autor é bloqueado e editoria aparece no portal',async()=>{
 await author.get('/admin/categorias').expect(403);
 await editor.post('/admin/categorias').type('form').send({name:'Educação'}).expect(403);
 await editor.post('/admin/categorias').type('form').send({_csrf:await csrfFor(editor,'/admin/categorias'),name:'Educação',show_menu:'on'}).expect(302);
 assert.equal(db.prepare('SELECT name FROM editorial_categories WHERE slug=?').get('educacao').name,'Educação');
 await request(app).get('/editoria/educacao').expect(200);
 await author.post('/admin/categorias').type('form').send({_csrf:await csrfFor(author),name:'Proibida'}).expect(403);
 await editor.post('/admin/categorias').type('form').send({_csrf:await csrfFor(editor,'/admin/categorias'),name:'Educação'}).expect(400);
 await postArticle(editor,'/admin/noticias',{title:'Educação no Tocantins',category:'educacao',action:'draft'}).then(r=>{assert.equal(r.status,302);assert.match(r.headers.location,/^\/admin\/noticias\/\d+$/);});
 await editor.post('/admin/categorias/educacao').type('form').send({_csrf:await csrfFor(editor,'/admin/categorias'),name:'Educação e formação',position:2}).expect(302);
 const renamed=await request(app).get('/editoria/educacao').expect(200);assert.match(renamed.text,/Educação e formação/);
 const home=await request(app).get('/');assert.doesNotMatch(home.text,/<a[^>]+href="\/editoria\/educacao"/);
 await editor.get('/admin/materias').expect(200);
});
