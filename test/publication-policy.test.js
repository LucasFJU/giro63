import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';import request from 'supertest';import sharp from 'sharp';
import {createApp} from '../src/server.js';import {hashPassword,openDatabase} from '../src/db.js';
import {initializeEditorial} from '../src/editorial-schema.js';
import {validateGenerated} from '../src/gemini-editor.js';
import {splitIssues,sourceFooter,replaceStandardFooter} from '../src/publication-policy.js';
import {migrateAutomationFooters} from '../src/footer-migration.js';
import {addImageSuggestion} from '../src/article-images.js';
const csrf=r=>r.text.match(/name="_csrf" value="([^"]+)"/)?.[1];
test('códigos distinguem pendências, fatos e alertas desconhecidos; cidade e tags regionais precisam de contexto',()=>{
 assert.deepEqual(splitIssues(['SENSITIVE','TAGS','misterioso']),{blockers:['misterioso'],pending:['SENSITIVE','TAGS']});
 const item={title:'Transporte anunciado',summary:'O serviço de transporte foi anunciado em São Paulo e estará disponível para os moradores do bairro a partir da abertura da unidade.'};
 const value={title:'Transporte anunciado',summary:'Serviço para os moradores.',paragraphs:['O serviço foi anunciado em São Paulo.'],category:'cidades',city:'Palmas',tags:['Tocantins','Transporte'],sensitive:true,alerts:[]};
 let generated=validateGenerated(value,item,['cidades']);assert.equal(generated.city,'');assert.deepEqual(generated.tags,['Transporte']);assert.equal(generated.issues.blockers.length,0);assert.ok(generated.issues.pending.includes('SENSITIVE'));
 generated=validateGenerated({...value,paragraphs:['Serão 99 veículos, disse o prefeito: “Todos terão transporte gratuito”.']},item,['cidades']);assert.ok(generated.issues.blockers.includes('UNCONFIRMED_NUMBER'));assert.ok(generated.issues.blockers.includes('UNCONFIRMED_QUOTE'));
 assert.ok(validateGenerated({...value,alerts:['confira uma coisa nova']},item,['cidades']).issues.blockers.includes('UNKNOWN_ALERT'));
 const police={...item,summary:'Segundo a polícia, um suspeito foi detido em São Paulo durante uma operação. O caso segue em investigação e a defesa não se manifestou.'};
 assert.ok(validateGenerated({...value,paragraphs:['O criminoso foi detido em São Paulo.']},police,['cidades']).issues.blockers.includes('ATTRIBUTION_LOST'));
});
test('migração de crédito exige backup e preserva edição e menções editoriais à IA',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'giro63-footer-')),db=openDatabase(dir);
 try{await initializeEditorial(db);const stamp=new Date().toISOString(),url='https://agenciabrasil.ebc.com.br/teste',old=sourceFooter('Agência Brasil',url).replace('preparado a partir','preparado com auxílio de inteligência artificial, a partir');
 const body='<p>Reportagem sobre inteligência artificial, escrita pela redação.</p>'+old+'<p>Complemento editorial depois do crédito.</p>';
 const id=Number(db.prepare('INSERT INTO articles(slug,title,body,category,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('teste','Teste',body,'brasil',stamp,stamp).lastInsertRowid);
 db.prepare('INSERT INTO automation_items(id,source_id,uid,url,title,summary,fingerprint,original_at,updated_at,article_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run('x','agencia-brasil','x',url,'Teste','Fonte','f',stamp,stamp,id);
 await assert.rejects(migrateAutomationFooters(db,{}),/Backup obrigatório/);let backedUp=false;
 const result=await migrateAutomationFooters(db,{backup:rows=>{assert.equal(rows[0].body,body);backedUp=true;}});assert.equal(backedUp,true);assert.equal(result.changed,1);
 const saved=db.prepare('SELECT body FROM articles').get().body;assert.equal(saved,body.replace(old,sourceFooter('Agência Brasil',url)));assert.equal((await migrateAutomationFooters(db,{})).changed,0);
 assert.equal(replaceStandardFooter(old.replace('informações de ','informações da ').replaceAll('"','\\"'),'Agência Brasil',url).changed,true);
 assert.equal(replaceStandardFooter(old+old,'Agência Brasil',url).changed,false);assert.equal(replaceStandardFooter('<p>Texto próprio com inteligência artificial.</p>','Agência Brasil',url).needsReview,false);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('aprovação de imagem, publicação sensível, cotas, retirada e conferência são independentes e protegidas',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'giro63-policy-')),bytes=await sharp({create:{width:500,height:350,channels:3,background:'blue'}}).png().toBuffer();let invalid=false;
 const app=await createApp({dataDir:dir,uploadDir:path.join(dir,'uploads'),suggestedImageReader:async()=>{if(invalid)throw Error('A sugestão não contém imagem válida.');return bytes;}}),db=app.locals.db;
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
 for(const role of ['editor','author'])db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(role,role+'@test.example',hashPassword('Senha de teste!'),role);
 db.prepare("UPDATE automation_sources SET approved=1,active=1 WHERE id='g1-tocantins'").run();
 const stamp=new Date().toISOString(),body='<p>Segundo a polícia, um suspeito foi detido em Palmas.</p>',title='Suspeito detido em Palmas';
 const id=Number(db.prepare('INSERT INTO articles(slug,title,summary,body,category,byline,author_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('teste',title,'Detenção em Palmas.',body,'seguranca','Giro63 - Redação',2,'review',stamp,stamp).lastInsertRowid);
 const sourcePage='https://g1.globo.com/to/tocantins/noticia/2026/11/07/teste.ghtml';
 db.prepare('INSERT INTO automation_items(id,source_id,uid,url,title,summary,fingerprint,original_at,updated_at,article_id,state,policy_version,blockers,review_reasons,review_pending) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('test','g1-tocantins','test',sourcePage,title,'Segundo a polícia, um suspeito foi detido em Palmas. A investigação continua com informações fornecidas pela polícia.','f',stamp,stamp,id,'review',1,'["IMAGE_PENDING"]','["SENSITIVE","TAGS"]',1);
 await addImageSuggestion(db,id,{image_url:'https://s2-g1.glbimg.com/foto.jpg',source_page:sourcePage,source:'G1 Tocantins'});const suggestion=db.prepare('SELECT id FROM article_image_suggestions').get().id;
 const login=async role=>{const a=request.agent(server),r=await a.get('/admin/login');await a.post('/admin/login').type('form').send({_csrf:csrf(r),email:role+'@test.example',password:'Senha de teste!'}).expect(302);return a;};const editor=await login('editor'),author=await login('author');
 const values={title,summary:'Detenção em Palmas.',body,category:'seguranca',byline:'Giro63 - Redação',city:'Palmas',sources:'G1 Tocantins — '+sourcePage,credit:'Fotógrafa / G1',photo_photographer:'Fotógrafa',photo_source:'G1 Tocantins',photo_source_url:sourcePage,photo_license:'Autorização verificada pela editora',cover_alt:'Registro da operação',action:'approve-publish'};
 const post=async(extra={},status=302)=>editor.post('/admin/noticias/'+id).type('form').send({...values,...extra,_csrf:csrf(await editor.get('/admin/noticias/'+id))}).expect(status);
 await editor.post('/admin/noticias/'+id).type('form').send(values).expect(403);await author.post('/admin/noticias/'+id).type('form').send({...values,_csrf:csrf(await author.get('/admin/noticias/'+id))}).expect(403);
 await post({},400);assert.equal(db.prepare('SELECT status FROM articles').get().status,'review');
 const approval={image_suggestion:suggestion,editorial_image_rights:'on',editorial_image_context:'on'};
 invalid=true;await post(approval,400);invalid=false;assert.equal(db.prepare('SELECT cover FROM articles').get().cover,'/images/cerrado.jpg');
 await post({...approval,action:'draft'});let item=db.prepare('SELECT * FROM automation_items').get();assert.equal(db.prepare('SELECT status FROM articles').get().status,'draft');assert.equal(item.publication_counted,0);assert.ok(item.approved_cover.startsWith('/uploads/'));assert.equal(db.prepare('SELECT status FROM article_image_suggestions').get().status,'approved');
 await post();item=db.prepare('SELECT * FROM automation_items').get();assert.equal(item.state,'published');assert.equal(item.review_pending,1);assert.equal(db.prepare('SELECT published FROM automation_daily').get().published,1);
 const pending=await editor.get('/admin/automacao?status=published-review').expect(200);assert.match(pending.text,/Publicado — conferir/);assert.match(pending.text,/Concluir conferência/);
 await editor.post('/admin/automacao/itens/test/concluir').type('form').send({}).expect(403);await author.post('/admin/automacao/itens/test/concluir').type('form').send({_csrf:csrf(await author.get('/admin/noticias/'+id))}).expect(403);
 await editor.post('/admin/automacao/itens/test/concluir').type('form').send({_csrf:csrf(pending)}).expect(302);item=db.prepare('SELECT * FROM automation_items').get();assert.equal(item.review_pending,0);assert.equal(item.review_completed_by,1);assert.ok(item.review_completed_at);
 await post();assert.equal(db.prepare('SELECT review_pending FROM automation_items').get().review_pending,0);assert.equal(db.prepare('SELECT published FROM automation_daily').get().published,1);
 await editor.post('/admin/automacao/itens/test/retirar').type('form').send({_csrf:csrf(await editor.get('/admin/automacao'))}).expect(302);assert.equal(db.prepare('SELECT status FROM articles').get().status,'draft');
 db.prepare('UPDATE automation_daily SET published=10').run();await post();assert.equal(db.prepare('SELECT published FROM automation_daily').get().published,10); // Same article is not a second publication.
 db.prepare("UPDATE articles SET status='review'").run();db.prepare('UPDATE automation_items SET publication_counted=0').run();await post({},400);assert.equal(db.prepare('SELECT status FROM articles').get().status,'review');
 db.prepare('UPDATE automation_daily SET published=0').run();await post({body:'<p>Foram encontrados 99 veículos.</p>'},400);assert.equal(db.prepare('SELECT status FROM articles').get().status,'review');
 db.prepare("UPDATE automation_sources SET region='national' WHERE id='g1-tocantins'").run();db.prepare('UPDATE automation_daily SET national=3,published=3').run();await post({},400);db.prepare('UPDATE automation_daily SET national=0,published=0').run();
 db.prepare("UPDATE automation_items SET blockers='[\"UNKNOWN_ALERT\"]'").run();await post({},400);await post({classify_unknown:'SENSITIVE',resolved_issues:'UNKNOWN_ALERT',resolution_note:'Conferida na fonte: apenas indicação de tema sensível.'});assert.equal(db.prepare('SELECT status FROM articles').get().status,'published');
 db.prepare("UPDATE articles SET status='review'").run();db.prepare("UPDATE automation_sources SET approved=0 WHERE id='g1-tocantins'").run();await post({resolved_issues:'SOURCE_UNAUTHORIZED',resolution_note:'Tentativa não pode liberar uma fonte não autorizada.'},400);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});}
});
