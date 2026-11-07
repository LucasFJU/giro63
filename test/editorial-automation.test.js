import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {openDatabase,hashPassword} from '../src/db.js';
import {initializeEditorial} from '../src/editorial-schema.js';
import {assignTags,tagsFor} from '../src/tags.js';
import {parseFeed,approvedUrl,publicAddress} from '../src/feed-reader.js';
import {validateGenerated} from '../src/gemini-editor.js';
import {ingest,runAutomation,reservePublication,trimAutomationQueue} from '../src/automation.js';
import {validWorkflow} from '../src/workflow-auth.js';
import {createApp} from '../src/server.js';
const temporary=()=>mkdtempSync(path.join(os.tmpdir(),'giro63-automation-'));
const article=db=>Number(db.prepare("INSERT INTO articles(slug,title,category,status,created_at,updated_at) VALUES('teste','Teste','cidades','published',?,?)").run(new Date().toISOString(),new Date().toISOString()).lastInsertRowid);

test('licença da fonte não libera automaticamente conteúdo de agência parceira',async()=>{
 const dir=temporary(),db=openDatabase(dir);try{await initializeEditorial(db);await ingest(db,{id:'agencia-brasil'},[{uid:'partner',url:'https://agenciabrasil.ebc.com.br/partner',title:'Informe internacional',summary:'Informações recebidas da Reuters. '+('Contexto confirmado. '.repeat(15)),originalAt:new Date().toISOString()}]);const item=db.prepare("SELECT state,note FROM automation_items WHERE uid='partner'").get();assert.equal(item.state,'review');assert.match(item.note,/permissão específica/);}finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('tags normalizam acentos e espaços, limitam nomes genéricos e reaproveitam associações',async()=>{
 const dir=temporary(),db=openDatabase(dir);try{await initializeEditorial(db);const id=article(db);await assignTags(db,id,['Educação',' educação ','NOTÍCIAS','G1','Transporte']);await assignTags(db,id,['EDUCACAO']);assert.deepEqual((await tagsFor(db,id)).map(t=>t.slug).sort(),['educacao','transporte']);}finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('RSS e rede rejeitam endereços privados, XML perigoso e itens fora da janela',()=>{
 assert.throws(()=>approvedUrl('http://site.example/feed',['site.example']));assert.throws(()=>approvedUrl('https://127.0.0.1/feed',['127.0.0.1']));assert.throws(()=>approvedUrl('https://attacker.example/feed',['site.example']));for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false);assert.equal(publicAddress('8.8.8.8'),true);
 assert.throws(()=>parseFeed('<!DOCTYPE x><rss/>',['site.example']));assert.throws(()=>parseFeed('<html/>',['site.example']));
 const now=Date.now(),date=new Date(now-1000).toUTCString(),xml=`<rss><channel><item><guid>1</guid><title>Uma notícia</title><link>https://site.example/noticia?utm_source=x</link><description>Resumo</description><pubDate>${date}</pubDate></item></channel></rss>`;
 assert.equal(parseFeed(xml,['site.example'],now)[0].url,'https://site.example/noticia');assert.equal(parseFeed(xml,['site.example'],now+49*3600000).length,0);
});
test('validação Gemini encaminha temas sensíveis e dados não confirmados à revisão',()=>{
 const item={title:'Informação sobre transporte',summary:'O serviço de transporte foi anunciado em Palmas.'},v={title:'Transporte em Palmas',summary:'Informações sobre o serviço.',paragraphs:['O serviço foi anunciado em Palmas.'],category:'cidades',city:'Palmas',tags:['Transporte'],sensitive:false,alerts:[]};assert.equal(validateGenerated(v,item,['cidades']).alerts.length,1);assert.equal(validateGenerated({...v,city:'Gurupi',paragraphs:['O serviço terá 30 veículos.']},item,['cidades']).alerts.length,3);assert.throws(()=>validateGenerated({...v,category:'inexistente'},item,['cidades']));assert.equal(validateGenerated(v,{...item,title:'Suspeito de crime é preso'},['cidades']).sensitive,true);
});
test('fila persistida, publicação, revisão, duplicatas, pausa e quota de chamadas',async()=>{
 const dir=temporary(),db=openDatabase(dir);try{
  await initializeEditorial(db);db.prepare("UPDATE settings SET value='0' WHERE key='automation_paused'").run();db.prepare("UPDATE settings SET value='1' WHERE key='automation_publish'").run();db.prepare("UPDATE automation_sources SET active=1,approved=1 WHERE id='g1-tocantins'").run();
  const source=db.prepare("SELECT * FROM automation_sources WHERE id='g1-tocantins'").get(),summary='A prefeitura anunciou serviços de transporte em Palmas para atender a população. '.repeat(4),entry={uid:'1',url:'https://g1.globo.com/to/noticia',title:'Transporte em Palmas terá nova organização',summary,originalAt:new Date().toISOString()};await ingest(db,source,[entry,entry]);assert.equal(db.prepare('SELECT COUNT(*) n FROM automation_items').get().n,1);
  const generate=async()=>({result:{title:'Novo transporte em Palmas',summary:'Serviços anunciados.',paragraphs:['A prefeitura anunciou serviços de transporte em Palmas.'],category:'cidades',city:'Palmas',tags:['Transporte'],sensitive:false,alerts:[]},usage:{input:20,output:30}});
  const options={readFeed:async()=>'<rss><channel><item><title>antigo</title></item></channel></rss>',generate,key:'test'};
  await runAutomation(db,options);assert.equal(db.prepare('SELECT status FROM articles').get().status,'published');assert.equal((await tagsFor(db,1))[0].slug,'transporte');assert.equal(db.prepare('SELECT calls FROM automation_daily').get().calls,1);
  await ingest(db,source,[{...entry,summary:'Atualização '+summary}]);assert.match(db.prepare('SELECT note FROM automation_items').get().note,/atualizada/);assert.equal(db.prepare('SELECT title FROM articles').get().title,'Novo transporte em Palmas');
  db.prepare("UPDATE settings SET value='1' WHERE key='automation_paused'").run();assert.match((await runAutomation(db,options)).message,/pausada/);
  db.prepare('UPDATE automation_daily SET published=9,national=2').run();assert.equal(await reservePublication(db,false),true);assert.equal(await reservePublication(db,true),false);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('OIDC rejeita outro repositório, branch e evento',()=>{
 const p={repository_id:'1445851477',repository_owner_id:'53629446',repository:'LucasFJU/giro63',ref:'refs/heads/main',workflow_ref:'LucasFJU/giro63/.github/workflows/editorial-automation.yml@refs/heads/main',event_name:'schedule',jti:'token'};assert.equal(validWorkflow(p),true);for(const change of [{repository_id:'1'},{ref:'refs/heads/feature'},{event_name:'pull_request'},{workflow_ref:'outro'}])assert.equal(validWorkflow({...p,...change}),false);
});
test('painel de tags e automação exige editor; busca e página de tags preservam filtro',async()=>{
 const dir=temporary(),app=await createApp({dataDir:dir,uploadDir:path.join(dir,'uploads')}),db=app.locals.db;
 try{
  assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n,0);const id=article(db);await assignTags(db,id,['Educação']);await request(app).get('/tag/educacao').expect(200);await request(app).get('/busca?tag=educacao').expect(200);await request(app).get('/admin/automacao').expect(302);await request(app).post('/internal/automation/run').expect(401);
  for(const role of ['author','editor'])db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(role,role+'@example.test',hashPassword('Senha de teste editorial!'),role);
  for(const role of ['author','editor']){const agent=request.agent(app),p=await agent.get('/admin/login'),csrf=p.text.match(/name="_csrf" value="([^"]+)"/)[1];await agent.post('/admin/login').type('form').send({_csrf:csrf,email:role+'@example.test',password:'Senha de teste editorial!'}).expect(302);await agent.get('/admin/automacao').expect(role==='editor'?200:403);await agent.get('/admin/tags').expect(role==='editor'?200:403);
   if(role==='editor'){const page=await agent.get('/admin/tags'),token=page.text.match(/name="_csrf" value="([^"]+)"/)[1];await agent.post('/admin/tags').type('form').send({_csrf:token,name:'Formação',action:'create'}).expect(302);await agent.post('/admin/tags').type('form').send({_csrf:token,slug:'educacao',target:'formacao',action:'merge'}).expect(302);assert.deepEqual((await tagsFor(db,id)).map(t=>t.slug),['formacao']);
    const stamp=new Date().toISOString();for(let n=0;n<19;n++)db.prepare('INSERT INTO automation_items(id,source_id,uid,url,title,summary,fingerprint,original_at,state,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('item-'+n,'agencia-brasil','item-'+n,'https://agenciabrasil.ebc.com.br/item-'+n,'Conferência '+n,'Resumo recebido','hash-'+n,stamp,n===18?'published':'review',stamp);
    db.prepare("UPDATE articles SET status='review',body='<p>Texto preparado para revisão.</p>' WHERE id=?").run(id);
    db.prepare("UPDATE automation_items SET article_id=? WHERE id NOT IN ('item-0','item-18')").run(id);
    db.prepare("UPDATE automation_items SET note='Resumo insuficiente.' WHERE id='item-17'").run();
    const pending=await agent.get('/admin/automacao').expect(200);assert.match(pending.text,/Central de revisão/);assert.equal((pending.text.match(/class="automation-item"/g)||[]).length,15);assert.doesNotMatch(pending.text,/<h3>Conferência 18<\/h3>/);assert.doesNotMatch(pending.text,/Sem matéria criada/);assert.doesNotMatch(pending.text,/<h3>Conferência (0|17)<\/h3>/);
    const blocked=await agent.get('/admin/automacao?status=unprepared').expect(200);assert.equal((blocked.text.match(/class="automation-item"/g)||[]).length,2);assert.match(blocked.text,/<h3>Conferência 17<\/h3>/);
    const all=await agent.get('/admin/automacao?status=all&q=Confer%C3%AAncia%200').expect(200);assert.match(all.text,/Sem matéria criada/);
    await agent.post('/admin/automacao/itens/item-0/criar-materia').type('form').send({}).expect(403);
    const initialCount=db.prepare('SELECT count(*) n FROM articles').get().n;
    const created=await agent.post('/admin/automacao/itens/item-0/criar-materia').type('form').send({_csrf:token}).expect(302);
    const draftId=db.prepare("SELECT article_id FROM automation_items WHERE id='item-0'").get().article_id;
    const draft=db.prepare('SELECT * FROM articles WHERE id=?').get(draftId);assert.equal(draft.status,'draft');assert.equal(draft.body,'');assert.match(draft.sources,/agenciabrasil/);assert.equal(created.headers.location,'/admin/noticias/'+draftId);
    await agent.post('/admin/automacao/itens/item-0/criar-materia').type('form').send({_csrf:token}).expect(302);
    assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n,initialCount+1);
    const second=await agent.get('/admin/automacao?status=pending&page=2').expect(200);assert.equal((second.text.match(/class="automation-item"/g)||[]).length,1);
    const search=await agent.get('/admin/automacao?status=published&q=CONFERENCIA%2018&source=agencia-brasil').expect(200);assert.equal((search.text.match(/class="automation-item"/g)||[]).length,1);assert.match(search.text,/<h3>Conferência 18<\/h3>/);
    const empty=await agent.get('/admin/automacao?status=discarded').expect(200);assert.match(empty.text,/Nenhum item encontrado/);
    await agent.post('/admin/automacao/descartar-varios').type('form').send({_csrf:token,scope:'selected',items:['item-17','item-1','item-18']}).expect(302);
    assert.equal(db.prepare("SELECT state FROM automation_items WHERE id='item-17'").get().state,'discarded');assert.equal(db.prepare("SELECT state FROM automation_items WHERE id='item-1'").get().state,'review');assert.equal(db.prepare("SELECT state FROM automation_items WHERE id='item-18'").get().state,'published');
    await agent.post('/admin/automacao/descartar-varios').type('form').send({_csrf:token,scope:'all'}).expect(400);
    await agent.post('/admin/automacao/descartar-varios').type('form').send({_csrf:token,scope:'all',confirm_all:'on'}).expect(302);
    assert.equal(db.prepare("SELECT state FROM automation_items WHERE id='item-0'").get().state,'discarded');assert.equal(db.prepare('SELECT status FROM articles WHERE id=?').get(draftId).status,'draft');

   }
  }
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('matérias desenvolvidas aceitam mais parágrafos e textos curtos exigem revisão',()=>{
 const paragraph='A prefeitura informou os detalhes do serviço de transporte em Palmas para orientar a população sobre o atendimento disponível na cidade e a organização das atividades.';
 const item={title:'Transporte em Palmas',summary:Array(10).fill(paragraph).join(' ')};
 const value={title:item.title,summary:'Detalhes do serviço de transporte.',paragraphs:Array(8).fill(paragraph),category:'cidades',city:'Palmas',tags:[],sensitive:false,alerts:[]};
 assert.equal(validateGenerated(value,item,['cidades']).alerts.length,0);
 assert.match(validateGenerated({...value,paragraphs:[paragraph]},item,['cidades']).alerts.join(' '),/pouco desenvolvido/);
 assert.match(validateGenerated({...value,paragraphs:[paragraph]},{...item,summary:paragraph},['cidades']).alerts.join(' '),/Material recebido curto/);
});

test('fila limita 20 itens, quatro nacionais e expira mais de 48 horas',async()=>{
 const dir=temporary(),db=openDatabase(dir);try{await initializeEditorial(db);const now=Date.now();
 for(let n=0;n<35;n++)db.prepare('INSERT INTO automation_items(id,source_id,uid,url,title,summary,fingerprint,original_at,state,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('queue-'+n,n<18?'g1-tocantins':'agencia-brasil','q'+n,'https://example.test/'+n,'Título '+n,'Material','fp'+n,new Date(now-(n===0?49:1)*3600000).toISOString(),'queued',new Date(now).toISOString());
 await trimAutomationQueue(db,now);const rows=db.prepare("SELECT source_id FROM automation_items WHERE state='queued'").all();assert.equal(rows.length,20);assert.equal(rows.filter(r=>r.source_id==='agencia-brasil').length,3);assert.match(db.prepare("SELECT note FROM automation_items WHERE id='queue-0'").get().note,/Expirado/);
 await trimAutomationQueue(db,now+49*3600000);assert.equal(db.prepare("SELECT count(*) n FROM automation_items WHERE state='queued'").get().n,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('validação rejeita números por substring, cidade parcial e citações inventadas; temas ampliados vão à revisão',()=>{
 const base={title:'Obras',summary:'Resumo da obra.',paragraphs:['A obra segue em andamento.'],category:'cidades',city:'',tags:[],sensitive:false,alerts:[]};
 const item={title:'Obras em Palmas',summary:'A prefeitura de Palmas investiu 15 milhões em obras.'};
 assert.ok(validateGenerated({...base,paragraphs:['O investimento foi de 5 milhões.']},item,['cidades']).alerts.some(a=>/Número/.test(a)));
 assert.ok(!validateGenerated({...base,paragraphs:['O investimento foi de 15 milhões.']},item,['cidades']).alerts.some(a=>/Número/.test(a)));
 assert.equal(validateGenerated({...base,city:'Palma'},item,['cidades']).city,'');
 assert.equal(validateGenerated({...base,city:'Palmas'},item,['cidades']).city,'Palmas');
 assert.ok(validateGenerated({...base,paragraphs:['O prefeito disse: “vamos entregar”.']},item,['cidades']).alerts.some(a=>/Citação/.test(a)));
 assert.equal(validateGenerated(base,{title:'Acidente na TO-050',summary:'Um acidente deixou feridos.'},['cidades']).sensitive,true);
 assert.equal(validateGenerated(base,item,['cidades']).sensitive,false);
});
