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
import {ingest,runAutomation,reservePublication} from '../src/automation.js';
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
 const item={title:'Informação sobre transporte',summary:'O serviço de transporte foi anunciado em Palmas.'},v={title:'Transporte em Palmas',summary:'Informações sobre o serviço.',paragraphs:['O serviço foi anunciado em Palmas.'],category:'cidades',city:'Palmas',tags:['Transporte'],sensitive:false,alerts:[]};assert.equal(validateGenerated(v,item,['cidades']).alerts.length,0);assert.equal(validateGenerated({...v,city:'Gurupi',paragraphs:['O serviço terá 30 veículos.']},item,['cidades']).alerts.length,2);assert.throws(()=>validateGenerated({...v,category:'inexistente'},item,['cidades']));assert.equal(validateGenerated(v,{...item,title:'Suspeito de crime é preso'},['cidades']).sensitive,true);
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
   if(role==='editor'){const page=await agent.get('/admin/tags'),token=page.text.match(/name="_csrf" value="([^"]+)"/)[1];await agent.post('/admin/tags').type('form').send({_csrf:token,name:'Formação',action:'create'}).expect(302);await agent.post('/admin/tags').type('form').send({_csrf:token,slug:'educacao',target:'formacao',action:'merge'}).expect(302);assert.deepEqual((await tagsFor(db,id)).map(t=>t.slug),['formacao']);}
  }
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
