import {authorizeWorkflow} from './workflow-auth.js';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {transaction} from './postgres.js';
import {dayInSaoPaulo} from './reader-experience.js';
import {slugify} from './db.js';
import {assignTags} from './tags.js';
import {fetchFeed,parseFeed,approvedUrl} from './feed-reader.js';
import {generateNews} from './gemini-editor.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function event(db,message){await db.prepare('INSERT INTO automation_events(id,created_at,message) VALUES(?,?,?)').run(randomUUID(),new Date().toISOString(),message.slice(0,500));}
export async function reservePublication(db,regional,now=Date.now()){
  const day=dayInSaoPaulo(now);await db.prepare('INSERT INTO automation_daily(day) VALUES(?) ON CONFLICT DO NOTHING').run(day);
  const result=await db.prepare('UPDATE automation_daily SET published=published+1,national=national+? WHERE day=? AND published<10 AND national+?<=3').run(regional?0:1,day,regional?0:1);return result.changes===1;
}
export async function ingest(db,source,entries){
  for(const entry of entries){
    const fingerprint=hash((entry.title+' '+entry.summary).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''));
    const old=await db.prepare('SELECT * FROM automation_items WHERE (source_id=? AND uid=?) OR url=?').get(source.id,entry.uid,entry.url);
    if(old){if(old.fingerprint!==fingerprint){await db.prepare('UPDATE automation_items SET note=?,updated_at=? WHERE id=?').run('Fonte atualizada: conferir a origem. Texto editorial preservado.',new Date().toISOString(),old.id);}continue;}
    const candidates=await db.prepare('SELECT title,fingerprint FROM automation_items WHERE original_at>=?').all(new Date(Date.now()-48*3600000).toISOString());
    const words=new Set(slugify(entry.title).split('-').filter(w=>w.length>3));
    const duplicate=candidates.some(x=>{const other=new Set(slugify(x.title).split('-').filter(w=>w.length>3)),shared=[...words].filter(w=>other.has(w)).length;return x.fingerprint===fingerprint||words.size>=4&&shared/Math.max(words.size,other.size)>=0.75;});
    const state=entry.summary.length<180?'review':duplicate?'review':'queued',note=entry.summary.length<180?'Resumo insuficiente.':duplicate?'Possível duplicata entre fontes.':'';
    await db.prepare('INSERT INTO automation_items(id,source_id,uid,url,title,summary,fingerprint,original_at,state,note,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').run(randomUUID(),source.id,entry.uid,entry.url,entry.title,entry.summary,fingerprint,entry.originalAt,state,note,new Date().toISOString());
  }
}
export async function runAutomation(db,{readFeed=fetchFeed,generate=generateNews,key=process.env.GEMINI_API_KEY,now=Date.now()}={}){
  const settings=Object.fromEntries((await db.prepare("SELECT key,value FROM settings WHERE key IN ('automation_paused','automation_publish')").all()).map(x=>[x.key,x.value]));
  if(settings.automation_paused!=='0')return {message:'Automação pausada.'};if(!key)return {message:'Configure GEMINI_API_KEY na Vercel.'};
  const owner=randomUUID(),lease=await db.prepare('INSERT INTO automation_lock(id,owner,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE automation_lock.expires_at<?').run('runner',owner,now+120000,now);
  if(!lease.changes)return {message:'Uma execução já está em andamento.'};
  const deadline=Date.now()+45000;let processed=0;
  try{
    const sources=await db.prepare('SELECT * FROM automation_sources WHERE active=1 AND approved=1 ORDER BY region DESC,id').all();
    for(const source of sources){if(Date.now()>deadline-25000)break;try{await ingest(db,source,parseFeed(await readFeed(source.feed,source.hosts.split(',')),source.hosts.split(',')));await db.prepare("UPDATE automation_sources SET last_error='' WHERE id=?").run(source.id);}catch{await db.prepare('UPDATE automation_sources SET last_error=? WHERE id=?').run('Falha ao consultar ou validar o feed. Confira o endereço e tente novamente.',source.id);}}
    await db.prepare("UPDATE automation_items SET state=CASE WHEN attempts<2 THEN 'failed' ELSE 'review' END,note='Execução anterior interrompida.' WHERE state='processing' AND updated_at<?").run(new Date(now-120000).toISOString());
    const queue=await db.prepare("SELECT i.*,s.name AS source_name,s.region FROM automation_items i JOIN automation_sources s ON s.id=i.source_id WHERE i.state IN ('queued','failed') AND i.attempts<2 AND s.active=1 AND s.approved=1 AND i.original_at>=? ORDER BY s.region DESC,i.original_at DESC LIMIT 1").all(new Date(now-48*3600000).toISOString());
    const categories=(await db.prepare('SELECT slug FROM editorial_categories').all()).map(x=>x.slug);
    for(const item of queue){
      if(Date.now()>deadline-37000)break;
      const day=dayInSaoPaulo();const claimed=await transaction(db,async()=>{
        await db.prepare('INSERT INTO automation_daily(day) VALUES(?) ON CONFLICT DO NOTHING').run(day);
        const quota=await db.prepare('UPDATE automation_daily SET calls=calls+1 WHERE day=? AND calls<20').run(day);if(!quota.changes)return false;
        const claim=await db.prepare("UPDATE automation_items SET state='processing',attempts=attempts+1,updated_at=? WHERE id=? AND state IN ('queued','failed') AND attempts<2").run(new Date().toISOString(),item.id);return claim.changes===1;
      });if(!claimed)break;
      try{
        const {result,usage}=await generate(item,categories);await db.prepare('UPDATE automation_daily SET input_tokens=input_tokens+?,output_tokens=output_tokens+? WHERE day=?').run(usage.input,usage.output,day);
        await transaction(db,async()=>{
          const permitted=await db.prepare('SELECT active,approved FROM automation_sources WHERE id=?').get(item.source_id),pause=await db.prepare("SELECT value FROM settings WHERE key='automation_paused'").get(),publishing=await db.prepare("SELECT value FROM settings WHERE key='automation_publish'").get();
          const publish=publishing.value==='1'&&pause.value==='0'&&permitted.active&&permitted.approved&&!result.sensitive&&!result.alerts.length&&await reservePublication(db,item.region==='regional');
          const stamp=new Date().toISOString(),slug=(slugify(result.title).slice(0,100)||'noticia')+'-'+item.id.slice(0,8),body=result.paragraphs.map(p=>'<p>'+escape(p)+'</p>').join('')+'<p>Conteúdo preparado com auxílio de inteligência artificial, a partir de informações de '+escape(item.source_name)+'. <a href="'+escape(item.url)+'">Leia a publicação original</a>.</p>';
          const saved=await db.prepare('INSERT INTO articles(slug,title,summary,body,category,city,byline,cover,cover_alt,credit,sources,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(slug,result.title,result.summary,body,result.category,result.city,'Giro63 · preparação automatizada','/images/og-giro63.png','Arte ilustrativa com a marca Giro63','Arte ilustrativa Giro63',item.source_name+' — '+item.url,publish?'published':'review',stamp,stamp,publish?stamp:null);
          await assignTags(db,saved.lastInsertRowid,result.tags);
          await db.prepare('UPDATE automation_items SET state=?,article_id=?,note=?,updated_at=? WHERE id=?').run(publish?'published':'review',saved.lastInsertRowid,result.alerts.join(' · ')||(result.sensitive?'Tema sensível: revisão editorial obrigatória.':publish?'Publicado automaticamente.':'Publicação automática pausada ou quota atingida.'),stamp,item.id);
        });processed++;
      }catch(error){await db.prepare('UPDATE automation_items SET state=?,note=?,updated_at=? WHERE id=?').run(item.attempts+1>=2?'review':'failed',/Gemini|JSON|Campos|Texto/.test(error.message)?error.message.slice(0,200):error.name==='TimeoutError'?'Gemini excedeu o prazo de 35 segundos.':'Falha no processamento. Nova tentativa limitada.',new Date().toISOString(),item.id);}
    }
    await event(db,'Execução concluída. Itens processados: '+processed);return {message:'Execução concluída.',processed};
  }finally{await db.prepare('DELETE FROM automation_lock WHERE id=? AND owner=?').run('runner',owner);}
}
export function mountAutomation(app,{db,requireUser,editor,checkCsrf}){
  app.get('/admin/automacao',requireUser,editor,async(req,res)=>res.render('automation',{title:'Automação editorial',error:'',configured:!!process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||'gemini-3.7-flash',sources:await db.prepare('SELECT * FROM automation_sources ORDER BY name').all(),items:await db.prepare('SELECT i.*,s.name AS source_name FROM automation_items i JOIN automation_sources s ON s.id=i.source_id ORDER BY i.updated_at DESC LIMIT 100').all(),events:await db.prepare('SELECT * FROM automation_events ORDER BY created_at DESC LIMIT 20').all(),daily:await db.prepare('SELECT * FROM automation_daily WHERE day=?').get(dayInSaoPaulo())||{calls:0,published:0,national:0,input_tokens:0,output_tokens:0}}));
  app.post('/admin/automacao/config',requireUser,editor,checkCsrf,async(req,res)=>{await transaction(db,async()=>{await db.prepare("UPDATE settings SET value=? WHERE key='automation_paused'").run(req.body.enabled==='on'?'0':'1');await db.prepare("UPDATE settings SET value=? WHERE key='automation_publish'").run(req.body.publish==='on'?'1':'0');});res.redirect('/admin/automacao');});
  app.post('/admin/automacao/fontes/:id',requireUser,editor,checkCsrf,async(req,res)=>{
    const source=await db.prepare('SELECT * FROM automation_sources WHERE id=?').get(req.params.id);if(!source)return res.sendStatus(404);
    const note=String(req.body.note||'').trim().slice(0,2000),feed=String(req.body.feed||'').trim().slice(0,1000),approved=req.body.approved==='on'?1:0,active=req.body.active==='on'?1:0;
    try{if(feed)approvedUrl(feed,source.hosts.split(','));if((active||approved)&&(!feed||note.length<20||!approved))throw Error();if(active)parseFeed(await fetchFeed(feed,source.hosts.split(',')),source.hosts.split(','));await db.prepare('UPDATE automation_sources SET feed=?,permission_note=?,approved=?,active=?,last_error=? WHERE id=?').run(feed,note,approved,active,'',source.id);}catch{await db.prepare('UPDATE automation_sources SET active=0,approved=0,feed=?,permission_note=?,last_error=? WHERE id=?').run(feed,note,'Não ativada: confirme feed HTTPS válido e registre as condições de reutilização.',source.id);}res.redirect('/admin/automacao');
  });
  app.post('/admin/automacao/executar',requireUser,editor,checkCsrf,async(req,res)=>{const result=await runAutomation(db);req.session.flash=result.message;res.redirect('/admin/automacao');});
  app.post('/admin/automacao/itens/:id/descartar',requireUser,editor,checkCsrf,async(req,res)=>{await db.prepare("UPDATE automation_items SET state='discarded',note='Descartado pela redação.' WHERE id=? AND state<>'published'").run(req.params.id);res.redirect('/admin/automacao');});
  app.post('/internal/automation/run',async(req,res)=>{
    const expected=Buffer.from(process.env.AUTOMATION_SECRET||''),supplied=Buffer.from(String(req.get('authorization')||'').replace(/^Bearer /,''));const staticAuth=expected.length>=32&&expected.length===supplied.length&&timingSafeEqual(expected,supplied);if(!staticAuth&&!await authorizeWorkflow(db,supplied.toString()))return res.sendStatus(401);res.set('Cache-Control','no-store').json(await runAutomation(db));
  });
}
