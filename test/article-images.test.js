import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';
import sharp from 'sharp';import request from 'supertest';
import {createApp} from '../src/server.js';import {hashPassword} from '../src/db.js';
import {cropImage,imageFromPage,photoValues,addImageSuggestion,readSuggestedImage} from '../src/article-images.js';
const page='https://agenciabrasil.ebc.com.br/noticia/teste',candidate={image_url:'https://imagens.ebc.com.br/foto.jpg',source_page:page,source:'Agência Brasil',photographer:'Fotógrafa de teste',caption:'Foto de arquivo.',alt:'Duas faixas coloridas.',license:''};
test('sugestões restringem origem, mantêm direitos pendentes e capturam crédito da própria foto',async()=>{
 const html=`<meta content="${candidate.image_url}" property="og:image"><meta name="twitter:image:alt" content="Uma imagem. Foto: Autora/Agência Brasil"><figcaption class="credito-foto">© Autora/ Agência Brasil/Arquivo</figcaption>`;
 const result=imageFromPage(html,page);assert.equal(result.photographer,'Autora');assert.match(result.license,/Uso jornalístico/);assert.equal(result.caption,'Uma imagem.');assert.equal(imageFromPage(html.replace(candidate.image_url,'https://127.0.0.1/foto.jpg'),page),null);assert.equal(imageFromPage(html.replace(candidate.image_url,'https://imagens.ebc.com.br/logo.png'),page),null);
 await assert.rejects(readSuggestedImage({...candidate,image_url:'https://127.0.0.1/imagem'}),/domínios aprovados/);
 assert.throws(()=>photoValues({photo_source_url:'javascript:alert(1)'}));assert.throws(()=>photoValues({photo_x:'110'}));
});
test('recorte usa orientação e ponto escolhido e produz 1200 × 630 para compartilhamento',async()=>{
 const red=await sharp({create:{width:1200,height:630,channels:3,background:'red'}}).png().toBuffer(),blue=await sharp({create:{width:1200,height:630,channels:3,background:'blue'}}).png().toBuffer();
 const original=await sharp({create:{width:2400,height:630,channels:3,background:'white'}}).composite([{input:red,left:0,top:0},{input:blue,left:1200,top:0}]).png().toBuffer();
 const left=await cropImage(original,1200,630,0,50),right=await cropImage(original,1200,630,100,50);assert.equal((await sharp(left).metadata()).width,1200);assert.equal((await sharp(right).metadata()).height,630);const l=await sharp(left).resize(1,1).raw().toBuffer(),r=await sharp(right).resize(1,1).raw().toBuffer();assert.ok(l[0]>200&&l[2]<40);assert.ok(r[2]>200&&r[0]<40);
});
test('editor aprova sugestão com direitos e contexto; autor, CSRF, falhas e origem cruzada são bloqueados',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'giro63-images-')),bytes=await sharp({create:{width:800,height:600,channels:3,background:'#102a43'}}).png().toBuffer();let fail=false;
 const app=await createApp({dataDir:dir,uploadDir:path.join(dir,'uploads'),suggestedImageReader:async()=>{if(fail)throw Error('A sugestão não contém uma imagem JPG válida.');return bytes;},discoverArticleImage:async()=>candidate}),db=app.locals.db;const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const csrf=r=>/name="_csrf" value="([^"]+)"/.exec(r.text)?.[1];
 try{
  db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run('Editora','editor@test.example',hashPassword('senha-segura-de-teste'),'editor');db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run('Autor','autor@test.example',hashPassword('senha-segura-de-teste'),'author');
  const stamp=new Date().toISOString(),id=Number(db.prepare("INSERT INTO articles(slug,title,summary,body,category,author_id,cover,credit,sources,status,created_at,updated_at) VALUES('imagem','Matéria com foto','Resumo','<p>Texto.</p>','cidades',2,'/images/cerrado.jpg','Crédito anterior','Fonte','draft',?,?)").run(stamp,stamp).lastInsertRowid);
  await addImageSuggestion(db,id,candidate);await addImageSuggestion(db,id,candidate);assert.equal(db.prepare('SELECT count(*) AS n FROM article_image_suggestions').get().n,1);const s=db.prepare('SELECT * FROM article_image_suggestions').get();
  const login=async email=>{const a=request.agent(server),r=await a.get('/admin/login');await a.post('/admin/login').type('form').send({_csrf:csrf(r),email,password:'senha-segura-de-teste'}).expect(302);return a;};const editor=await login('editor@test.example'),author=await login('autor@test.example');
  const values={title:'Matéria com foto',summary:'Resumo mantido',body:'<p>Texto apurado.</p>',category:'cidades',credit:'Crédito anterior',sources:'Fonte',image_suggestion:s.id,photo_photographer:'Fotógrafa',photo_source:'Agência Brasil',photo_source_url:page,photo_license:'Permissão verificada no teste',cover_alt:'Foto de teste',photo_caption:'Legenda verificada',photo_x:25,photo_y:75,action:'draft'};
  let form=await editor.get('/admin/noticias/'+id).expect(200);assert.match(form.text,/WhatsApp · 1200/);await editor.post('/admin/noticias/'+id).type('form').send(values).expect(403);
  await author.post('/admin/noticias/'+id).type('form').send({...values,_csrf:csrf(await author.get('/admin/noticias/'+id))}).expect(403);
  await editor.post('/admin/noticias/'+id).type('form').send({...values,_csrf:csrf(form)}).expect(400);assert.equal(db.prepare('SELECT cover FROM articles WHERE id=?').get(id).cover,'/images/cerrado.jpg');
  const approved={...values,image_rights_confirmed:'on',image_context_confirmed:'on'};
  await editor.post('/admin/noticias/'+id).type('form').send({...approved,image_suggestion:'outro-artigo',_csrf:csrf(await editor.get('/admin/noticias/'+id))}).expect(400);
  fail=true;await editor.post('/admin/noticias/'+id).type('form').send({...approved,_csrf:csrf(await editor.get('/admin/noticias/'+id))}).expect(400);assert.equal(db.prepare('SELECT status FROM article_image_suggestions').get().status,'pending');fail=false;
  await editor.post('/admin/noticias/'+id).type('form').send({...approved,_csrf:csrf(await editor.get('/admin/noticias/'+id))}).expect(302);
  const saved=db.prepare('SELECT * FROM articles WHERE id=?').get(id);assert.notEqual(saved.cover,'/images/cerrado.jpg');assert.equal(saved.photo_caption,'Legenda verificada');assert.equal(saved.photo_x,25);assert.equal(saved.credit,'Fotógrafa / Agência Brasil');assert.equal(db.prepare('SELECT status FROM article_image_suggestions').get().status,'approved');assert.equal((await sharp(readFileSync(path.join(dir,'uploads',saved.photo_share.replace('/uploads/','')))).metadata()).width,1200);
  await editor.post('/admin/noticias/'+id).type('form').send({...approved,image_suggestion:'',action:'published',_csrf:csrf(await editor.get('/admin/noticias/'+id))}).expect(302);const published=await request(server).get('/noticia/imagem').expect(200);assert.ok(published.text.includes(saved.photo_share));assert.match(published.text,/Legenda verificada/);assert.match(published.text,/og:image:height" content="630/);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('G1 Tocantins sugere apenas CDN aprovado e mantém licença pendente',()=>{
 const page='https://g1.globo.com/to/tocantins/noticia/2026/11/07/teste.ghtml',image='https://s2-g1.glbimg.com/token/1200x0/internal_photos/bs/2026/foto.jpg';
 const html=`<meta property="og:image" content="${image}"><figure><img src="${image}" alt="Praça em Palmas — Foto: Autora/Arquivo pessoal"></figure>`;
 const result=imageFromPage(html,page);assert.equal(result.photographer,'Autora/Arquivo pessoal');assert.equal(result.caption,'Praça em Palmas');assert.equal(result.license,'');assert.match(result.source,/direitos a conferir/);
 assert.equal(imageFromPage(html.replaceAll('s2-g1.glbimg.com','attacker.example'),page),null);
 assert.throws(()=>imageFromPage(html,page.replace('/to/tocantins/','/sp/')));
 assert.equal(imageFromPage(html.replace('<figure>','<figure hidden>').replaceAll('alt="Praça em Palmas — Foto: Autora/Arquivo pessoal"','alt=""'),page).photographer,'');
});

test('sugestão G1 persiste pendente e rejeita associação de origem cruzada',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'giro63-g1-images-')),app=await createApp({dataDir:dir,uploadDir:path.join(dir,'uploads')}),db=app.locals.db;
 try{const stamp=new Date().toISOString(),saved=db.prepare("INSERT INTO articles(slug,title,category,created_at,updated_at) VALUES('g1','Matéria','cidades',?,?)").run(stamp,stamp);
 const g1={...candidate,source_page:'https://g1.globo.com/to/tocantins/noticia/2026/11/07/teste.ghtml',image_url:'https://s2-g1.glbimg.com/teste.jpg',source:'G1 Tocantins — direitos a conferir'};
 await addImageSuggestion(db,saved.lastInsertRowid,g1);await addImageSuggestion(db,saved.lastInsertRowid,g1);assert.equal(db.prepare('SELECT count(*) n FROM article_image_suggestions').get().n,1);assert.equal(db.prepare('SELECT status FROM article_image_suggestions').get().status,'pending');assert.equal(db.prepare('SELECT cover FROM articles').get().cover,'/images/cerrado.jpg');
 await assert.rejects(addImageSuggestion(db,saved.lastInsertRowid,{...g1,source_page:page}),/domínios aprovados/);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
