import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,mkdirSync,readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { openDatabase,hashPassword } from '../src/db.js';
import { createApp,root } from '../src/server.js';
import { dayInSaoPaulo,popularArticles,recordArticleRead,homepageSections,publicCities,readingMinutes,shortPublication } from '../src/reader-experience.js';
import { editorialMedia } from '../src/editorial-media.js';

const temporary=()=>mkdtempSync(path.join(os.tmpdir(),'giro63-reader-'));
const cleanup=dir=>rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150});
function article(db,overrides={}){
  const item={slug:'teste-'+Math.random().toString(36).slice(2),title:'Educação e saúde em Araguaína',summary:'Serviço à comunidade.',category:'cidades',city:'Araguaína',status:'published',created_at:'2026-10-30T10:00:00Z',updated_at:'2026-10-30T10:00:00Z',published_at:'2026-10-30T10:00:00Z',...overrides};
  const keys=Object.keys(item);const result=db.prepare(`INSERT INTO articles(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(item));return db.prepare('SELECT * FROM articles WHERE id=?').get(Number(result.lastInsertRowid));
}
test('ranking: sete dias de calendário de São Paulo, desempate, limite e retirada',async ()=>{
  const dir=temporary(),db=openDatabase(dir);try{
    const now=Date.parse('2026-10-30T02:59:59Z');assert.equal(dayInSaoPaulo(now),'2026-10-29');assert.equal(dayInSaoPaulo(now+1000),'2026-10-30');
    const old=article(db,{published_at:'2026-10-20T10:00:00Z'}),recent=article(db),outside=article(db),draft=article(db,{status:'draft'});
    const add=db.prepare('INSERT INTO article_daily_reads VALUES(?,?,?)');
    add.run(old.id,'2026-10-23',3);add.run(recent.id,'2026-10-29',3);add.run(outside.id,'2026-10-22',99);add.run(outside.id,'2026-10-30',99);add.run(draft.id,'2026-10-29',999);
    assert.deepEqual((await popularArticles(db,now)).map(x=>x.id),[recent.id,old.id]);
    for(let i=0;i<6;i++)add.run(article(db).id,'2026-10-29',1);
    assert.equal((await popularArticles(db,now)).length,5);
    db.prepare("UPDATE articles SET status='draft' WHERE id=?").run(recent.id);assert.equal((await popularArticles(db,now))[0].id,old.id);
  }finally{db.close();(await cleanup(dir));}
});
test('visitas: 30 minutos exatos, sessões independentes, HEAD/equipe/rascunho e persistência',async ()=>{
  const dir=temporary();let db=openDatabase(dir);try{
    const a=article(db),session={},now=Date.parse('2026-10-30T02:50:00Z');const event={method:'GET',session,article:a};
    assert.equal((await recordArticleRead(db,event,now)),true);assert.equal((await recordArticleRead(db,event,now+1799999)),false);
    assert.equal((await recordArticleRead(db,{...event,method:'HEAD'},now+1800000)),false);
    assert.equal((await recordArticleRead(db,{...event,user:{id:1}},now+1800000)),false);
    assert.equal((await recordArticleRead(db,{...event,article:{...a,status:'draft'}},now+1800000)),false);
    assert.equal((await recordArticleRead(db,event,now+1800000)),true);
    assert.equal((await recordArticleRead(db,{...event,session:{}},now+1800001)),true);
    assert.deepEqual(db.prepare('SELECT day,views FROM article_daily_reads ORDER BY day').all().map(r=>({...r})),[{day:'2026-10-29',views:1},{day:'2026-10-30',views:2}]);
    db.close();db=openDatabase(dir);assert.equal((await popularArticles(db,now+1800001))[0].reads,3);
  }finally{db.close();(await cleanup(dir));}
});
test('inicial distribui chamadas sem repetição e adapta pouco conteúdo; cidades só publicadas',async ()=>{
  const all=Array.from({length:22},(_,id)=>({id,featured:id<4?id+1:0,category:id>12?'cultura-e-turismo':'cidades'}));
  const sections=homepageSections(all);assert.equal(sections.latest.length,8);assert.equal(sections.culture.length,4);
  const shown=[sections.hero,...sections.sidebarStories,...sections.latest,...sections.culture,...sections.digests.flatMap(s=>s.stories)];assert.equal(new Set(shown.map(a=>a.id)).size,shown.length);
  assert.equal(homepageSections([]).hero,undefined);assert.equal(homepageSections(all.slice(0,2)).sidebarStories.length,1);
  const dir=temporary(),db=openDatabase(dir);try{article(db,{city:'Novo Acordo'});article(db,{city:'Cidade de rascunho',status:'draft'});assert.ok((await publicCities(db)).includes('Novo Acordo'));assert.ok(!(await publicCities(db)).includes('Cidade de rascunho'));}finally{db.close();(await cleanup(dir));}
  assert.equal(readingMinutes('<p>'+('palavra '.repeat(401))+'</p>'),3);assert.equal(readingMinutes(''),1);
  assert.match(shortPublication('2026-10-29T15:00:00Z',Date.parse('2026-10-30T15:00:00Z')),/29\/10\/2026/);
});
test('busca combina acentos, caixa, cidade, editoria e preserva filtros na paginação',async()=>{
  const dir=temporary(),app=(await createApp({dataDir:dir,uploadDir:path.join(dir,'uploads'),seed:false})),db=app.locals.db;
  try{
    for(let i=0;i<14;i++)article(db,{title:'EDUCAÇÃO pública '+i,city:'Novo Acordo'});
    article(db,{title:'Educação de outra editoria',city:'Novo Acordo',category:'saude'});article(db,{title:'Educação de outra cidade',city:'Palmas'});
    const response=await request(app).get('/busca').query({q:'educacao',editoria:'cidades',cidade:'novo-acordo'}).expect(200);
    assert.match(response.text,/14 publicações encontradas/);assert.match(response.text,/q=educacao&amp;editoria=cidades&amp;cidade=novo-acordo&amp;page=2/);
    const second=await request(app).get('/busca?q=EDUCA%C3%87%C3%83O&editoria=cidades&cidade=novo-acordo&page=2').expect(200);assert.match(second.text,/Página 2 de 2/);assert.match(second.text,/value="novo-acordo" selected/);
    await request(app).get('/cidade/novo-acordo').expect(200);
    for(const q of ['%','_','xyz','\' OR 1=1--'])assert.match((await request(app).get('/busca').query({q})).text,/0 publicações encontradas/);
    assert.match((await request(app).get('/busca?cidade=inexistente')).text,/0 publicações encontradas/);
  }finally{db.close();(await cleanup(dir));}
});
test('HTTP: recargas e pedidos simultâneos não inflam ranking; prévias e equipe excluídas',async()=>{
  const dir=temporary(),app=(await createApp({dataDir:dir,uploadDir:path.join(dir,'uploads'),seed:false})),db=app.locals.db;const server=app.listen(0,'127.0.0.1');
  try{
    const a=article(db,{demo:1}),other=article(db);const reader=request.agent(server),url='/noticia/'+a.slug;
    const empty=await reader.get('/');assert.match(empty.text,/conforme receberem acessos/);
    await reader.head(url).expect(200);assert.equal((await popularArticles(db)).length,0);
    const page=await reader.get(url).expect(200);await Promise.all([reader.get(url),reader.get(url),reader.get(url)]);
    assert.equal(db.prepare('SELECT SUM(views) n FROM article_daily_reads').get().n,1);
    assert.ok(page.text.indexOf('article-author')<page.text.indexOf('article-ranking'));assert.ok(page.text.indexOf('article-ranking')<page.text.indexOf('Outras perspectivas'));assert.match(page.text,/min de leitura/);
    db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run('Editor','editor@teste.local',hashPassword('senha teste 63!'),'editor');
    const staff=request.agent(server),login=await staff.get('/admin/login'),csrf=login.text.match(/name="_csrf" value="([^"]+)"/)[1];
    await staff.post('/admin/login').type('form').send({_csrf:csrf,email:'editor@teste.local',password:'senha teste 63!'}).expect(302);
    await staff.get('/noticia/'+other.slug).expect(200);await staff.get('/admin/noticias/'+other.id+'/preview').expect(200);assert.equal((await popularArticles(db)).length,1);
    db.prepare("UPDATE articles SET status='draft' WHERE id=?").run(a.id);assert.equal((await popularArticles(db)).length,0);
    assert.match((await request(server).get('/')).text,/conforme receberem acessos/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM ad_rotation').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM ad_daily').get().n,0);
  }finally{await new Promise(resolve=>server.close(resolve));db.close();(await cleanup(dir));}
});
test('miniaturas: dimensões, arquivo original intacto, caminhos seguros e entrega HTTP',async()=>{
  const dir=temporary(),uploads=path.join(dir,'uploads');mkdirSync(uploads);const image=path.join(uploads,'capa.png');
  await sharp({create:{width:700,height:350,channels:3,background:'#123456'}}).png().toFile(image);const original=readFileSync(image);
  const media=editorialMedia({publicDir:path.join(root,'public'),uploadDir:uploads});await media.generate('/uploads/capa.png');
  const data=media.get('/uploads/capa.png');assert.equal(data.width,700);assert.equal(data.height,350);assert.match(data.srcset,/160w/);assert.match(data.srcset,/640w/);assert.doesNotMatch(data.srcset,/960w/);assert.deepEqual(readFileSync(image),original);
  assert.equal(media.get('/uploads/../package.json').src,'/images/cerrado.jpg');assert.equal(media.get('/images/inexistente.jpg').src,'/images/cerrado.jpg');
  const app=(await createApp({dataDir:dir,uploadDir:uploads,seed:false}));try{const url=data.srcset.split(' ')[0];await request(app).get(url).expect(200).expect('Content-Type',/image\/webp/);}finally{app.locals.db.close();(await cleanup(dir));}
});
