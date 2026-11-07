import {authorizeWorkflow} from './workflow-auth.js';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {transaction} from './postgres.js';
import {dayInSaoPaulo} from './reader-experience.js';
import {slugify} from './db.js';
import {assignTags} from './tags.js';
import {fetchFeed,parseFeed,approvedUrl} from './feed-reader.js';
import {generateNews} from './gemini-editor.js';
import {discoverImage,addImageSuggestion} from './article-images.js';
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
    const partner=/Reuters|France.Presse|Associated Press|Agência Lusa|\bAFP\b/i.test(entry.summary);
    const state=entry.summary.length<180||duplicate||partner?'review':'queued',note=entry.summary.length<180?'Resumo insuficiente.':partner?'Conteúdo parceiro: confirmar permissão específica de reutilização.':duplicate?'Possível duplicata entre fontes.':'';
    await db.prepare('INSERT INTO automation_items(id,source_id,uid,url,title,summary,fingerprint,original_at,state,note,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').run(randomUUID(),source.id,entry.uid,entry.url,entry.title,entry.summary,fingerprint,entry.originalAt,state,note,new Date().toISOString());
  }
}
export async function trimAutomationQueue(db,now=Date.now()){
  return transaction(db,async()=>{
    if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(6363)').get();
    const stamp=new Date(now).toISOString(),cutoff=new Date(now-48*3600000).toISOString();
    await db.prepare("UPDATE automation_items SET state='discarded',note='Expirado: mais de 48 horas desde a publicação original.',updated_at=? WHERE state IN ('queued','failed') AND article_id IS NULL AND original_at<?").run(stamp,cutoff);
    const running=await db.prepare("SELECT s.region FROM automation_items i JOIN automation_sources s ON s.id=i.source_id WHERE i.state='processing'").all();
    let slots=running.length,national=running.filter(i=>i.region!=='regional').length;
    const waiting=await db.prepare("SELECT i.id,s.region FROM automation_items i JOIN automation_sources s ON s.id=i.source_id WHERE i.state IN ('queued','failed') AND i.article_id IS NULL ORDER BY CASE WHEN s.region='regional' THEN 0 ELSE 1 END,i.original_at DESC,i.id").all();
    for(const item of waiting){const isNational=item.region!=='regional';if(slots<20&&(!isNational||national<4)){slots++;if(isNational)national++;continue;}
      await db.prepare("UPDATE automation_items SET state='discarded',note='Fora da fila: limite de 20 itens, com até 4 nacionais; prioridade regional e mais recente.',updated_at=? WHERE id=? AND state IN ('queued','failed')").run(stamp,item.id);
    }
  });
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
    await trimAutomationQueue(db,now);
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
        let suggestedImage=null;if(item.source_id==='agencia-brasil'&&Date.now()<deadline-9000){try{suggestedImage=await discoverImage(item.url);}catch{/* Keep the approved neutral art if image discovery fails. */}}
        await transaction(db,async()=>{
          const permitted=await db.prepare('SELECT active,approved FROM automation_sources WHERE id=?').get(item.source_id),pause=await db.prepare("SELECT value FROM settings WHERE key='automation_paused'").get(),publishing=await db.prepare("SELECT value FROM settings WHERE key='automation_publish'").get();
          const publish=publishing.value==='1'&&pause.value==='0'&&permitted.active&&permitted.approved&&!result.sensitive&&!result.alerts.length&&await reservePublication(db,item.region==='regional');
          const stamp=new Date().toISOString(),slug=(slugify(result.title).slice(0,100)||'noticia')+'-'+item.id.slice(0,8),body=result.paragraphs.map(p=>'<p>'+escape(p)+'</p>').join('')+'<p>Conteúdo preparado com auxílio de inteligência artificial, a partir de informações de '+escape(item.source_name)+'. <a href="'+escape(item.url)+'">Leia a publicação original</a>.</p>';
          const saved=await db.prepare('INSERT INTO articles(slug,title,summary,body,category,city,byline,cover,cover_alt,credit,sources,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(slug,result.title,result.summary,body,result.category,result.city,'Giro63 - Redação','/images/og-giro63.png','Arte ilustrativa com a marca Giro63','Arte ilustrativa Giro63',item.source_name+' — '+item.url,publish?'published':'review',stamp,stamp,publish?stamp:null);
          await assignTags(db,saved.lastInsertRowid,result.tags);
          await addImageSuggestion(db,saved.lastInsertRowid,suggestedImage);
          await db.prepare('UPDATE automation_items SET state=?,article_id=?,note=?,updated_at=? WHERE id=?').run(publish?'published':'review',saved.lastInsertRowid,result.alerts.join(' · ')||(result.sensitive?'Tema sensível: revisão editorial obrigatória.':publish?'Publicado automaticamente.':'Publicação automática pausada ou quota atingida.'),stamp,item.id);
        });processed++;
      }catch(error){await db.prepare('UPDATE automation_items SET state=?,note=?,updated_at=? WHERE id=?').run(item.attempts+1>=2?'review':'failed',/Gemini|JSON|Campos|Texto/.test(error.message)?error.message.slice(0,200):error.name==='TimeoutError'?'Gemini excedeu o prazo de 35 segundos.':'Falha no processamento. Nova tentativa limitada.',new Date().toISOString(),item.id);}
    }
    await event(db,'Execução concluída. Itens processados: '+processed);return {message:'Execução concluída.',processed};
  }finally{await db.prepare('DELETE FROM automation_lock WHERE id=? AND owner=?').run('runner',owner);}
}
export function mountAutomation(app,{db,requireUser,editor,checkCsrf}){
  app.get('/admin/automacao',requireUser,editor,async(req,res)=>{
    await trimAutomationQueue(db);
    const filter=['pending','unprepared','queued','published','discarded','all'].includes(req.query.status)?req.query.status:'pending';
    const q=String(req.query.q||'').trim().slice(0,100),sourceFilter=String(req.query.source||'').slice(0,100),conditions=[],params=[];
    const ready="i.state='review' AND EXISTS (SELECT 1 FROM articles a WHERE a.id=i.article_id AND a.status='review' AND trim(a.body)<>'') AND "+['resumo insuficiente','material recebido curto','pouco desenvolvido','duplic','permiss','restricao de uso','falha na gera'].map(term=>"normalize_search(i.note) NOT LIKE '%"+term+"%'").join(' AND ');
    const readyCount=Number((await db.prepare('SELECT count(*) AS n FROM automation_items i WHERE '+ready).get()).n);
    if(filter==='pending')conditions.push('('+ready+')');else if(filter==='unprepared')conditions.push("i.state IN ('review','failed') AND NOT ("+ready+")");else if(filter==='queued')conditions.push("i.state IN ('queued','processing')");else if(filter!=='all'){conditions.push('i.state=?');params.push(filter);}
    if(q){conditions.push("(normalize_search(i.title) LIKE normalize_search(?) ESCAPE '!' OR normalize_search(s.name) LIKE normalize_search(?) ESCAPE '!')");const term='%'+q.replace(/[!%_]/g,'!$&')+'%';params.push(term,term);}
    if(sourceFilter){conditions.push('i.source_id=?');params.push(sourceFilter);}
    const where=conditions.length?conditions.join(' AND '):'1=1',join='FROM automation_items i JOIN automation_sources s ON s.id=i.source_id';
    const total=(await db.prepare('SELECT count(*) AS n '+join+' WHERE '+where).get(...params)).n,page=Math.min(Math.max(1,Number.parseInt(req.query.page)||1),Math.max(1,Math.ceil(total/15)));
    const counts=Object.fromEntries((await db.prepare('SELECT state,count(*) AS n FROM automation_items GROUP BY state').all()).map(x=>[x.state,Number(x.n)]));
    const queueLink=(status=filter,n=1)=>{const query=new URLSearchParams({status});if(q)query.set('q',q);if(sourceFilter)query.set('source',sourceFilter);if(n>1)query.set('page',String(n));return '/admin/automacao?'+query.toString()+'#automation-queue';};
    res.render('automation',{title:'Automação editorial',error:'',configured:!!process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||'gemini-3.7-flash',sources:await db.prepare('SELECT * FROM automation_sources ORDER BY name').all(),items:await db.prepare('SELECT i.*,s.name AS source_name '+join+' WHERE '+where+' ORDER BY i.updated_at DESC,i.id LIMIT 15 OFFSET ?').all(...params,(page-1)*15),events:await db.prepare('SELECT * FROM automation_events ORDER BY created_at DESC LIMIT 20').all(),daily:await db.prepare('SELECT * FROM automation_daily WHERE day=?').get(dayInSaoPaulo())||{calls:0,published:0,national:0,input_tokens:0,output_tokens:0},filter,q,sourceFilter,total,page,pages:Math.ceil(total/15),counts,readyCount,queueLink});
  });
  app.post('/admin/automacao/descartar-varios',requireUser,editor,checkCsrf,async(req,res)=>{
    const ids=[...new Set([].concat(req.body.items||[]).map(String))].slice(0,100);
    if(req.body.scope==='all'&&req.body.confirm_all!=='on')return res.sendStatus(400);
    await transaction(db,async()=>{
      if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(6363)').get();
      const eligible="state IN ('review','failed') AND (article_id IS NULL OR NOT EXISTS (SELECT 1 FROM articles a WHERE a.id=automation_items.article_id AND a.status='review' AND trim(a.body)<>'' ) OR "+['resumo insuficiente','material recebido curto','pouco desenvolvido','duplic','permiss','restricao de uso','falha na gera'].map(t=>"normalize_search(note) LIKE '%"+t+"%'").join(' OR ')+")";
      if(req.body.scope==='all'||ids.length)await db.prepare("UPDATE automation_items SET state='discarded',note='Descartado em lote pela redação.',updated_at=? WHERE "+eligible+(req.body.scope==='all'?'':' AND id IN ('+ids.map(()=>'?').join(',')+')')).run(new Date().toISOString(),...(req.body.scope==='all'?[]:ids));
    });
    req.session.flash='Itens não preparados descartados. Matérias vinculadas foram preservadas.';res.redirect('/admin/automacao?status=unprepared');
  });
  app.post('/admin/automacao/config',requireUser,editor,checkCsrf,async(req,res)=>{await transaction(db,async()=>{await db.prepare("UPDATE settings SET value=? WHERE key='automation_paused'").run(req.body.enabled==='on'?'0':'1');await db.prepare("UPDATE settings SET value=? WHERE key='automation_publish'").run(req.body.publish==='on'?'1':'0');});res.redirect('/admin/automacao');});
  app.post('/admin/automacao/fontes/:id',requireUser,editor,checkCsrf,async(req,res)=>{
    const source=await db.prepare('SELECT * FROM automation_sources WHERE id=?').get(req.params.id);if(!source)return res.sendStatus(404);
    const note=String(req.body.note||'').trim().slice(0,2000),feed=String(req.body.feed||'').trim().slice(0,1000),approved=req.body.approved==='on'?1:0,active=req.body.active==='on'?1:0;
    try{if(feed)approvedUrl(feed,source.hosts.split(','));if((active||approved)&&(!feed||note.length<20||!approved))throw Error();if(active)parseFeed(await fetchFeed(feed,source.hosts.split(',')),source.hosts.split(','));await db.prepare('UPDATE automation_sources SET feed=?,permission_note=?,approved=?,active=?,last_error=? WHERE id=?').run(feed,note,approved,active,'',source.id);}catch{await db.prepare('UPDATE automation_sources SET active=0,approved=0,feed=?,permission_note=?,last_error=? WHERE id=?').run(feed,note,'Não ativada: confirme feed HTTPS válido e registre as condições de reutilização.',source.id);}res.redirect('/admin/automacao');
  });
  app.post('/admin/automacao/executar',requireUser,editor,checkCsrf,async(req,res)=>{const result=await runAutomation(db);req.session.flash=result.message;res.redirect('/admin/automacao');});
  app.post('/admin/automacao/itens/:id/criar-materia',requireUser,editor,checkCsrf,async(req,res)=>{
    const result=await transaction(db,async()=>{
      if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(6363)').get();
      const item=await db.prepare('SELECT i.*,s.name AS source_name FROM automation_items i JOIN automation_sources s ON s.id=i.source_id WHERE i.id=?'+(db.dialect==='postgres'?' FOR UPDATE OF i':'')).get(req.params.id);
      if(!item)return {status:404};
      if(item.article_id)return {id:item.article_id};
      if(!['review','failed','queued'].includes(item.state))return {status:409};
      const stamp=new Date().toISOString(),slug=(slugify(item.title).slice(0,100)||'materia')+'-'+randomUUID();
      const feedback='Preparação manual a partir de item RSS. Confira a fonte, os direitos de uso e complemente a apuração antes de publicar. '+(item.note||'');
      const saved=await db.prepare('INSERT INTO articles(slug,title,summary,body,category,byline,cover,cover_alt,credit,sources,status,author_id,feedback,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(slug,item.title,item.summary.slice(0,500),'','cidades','Giro63 - Redação','/images/og-giro63.png','Arte ilustrativa com a marca Giro63','Arte ilustrativa Giro63',item.source_name+' — '+item.url,'draft',res.locals.user.id,feedback,stamp,stamp);
      await db.prepare("UPDATE automation_items SET article_id=?,state='review',updated_at=? WHERE id=?").run(saved.lastInsertRowid,stamp,item.id);
      return {id:saved.lastInsertRowid};
    });
    if(result.status)return res.status(result.status).render('error',{title:'Item indisponível',message:result.status===404?'Item não encontrado.':'Este item está em processamento ou foi encerrado. Atualize a fila antes de continuar.'});
    req.session.flash='Rascunho aberto para edição manual. Complete o conteúdo e confira a editoria antes de publicar.';
    res.redirect('/admin/noticias/'+result.id);
  });
  app.post('/admin/automacao/itens/:id/descartar',requireUser,editor,checkCsrf,async(req,res)=>{await db.prepare("UPDATE automation_items SET state='discarded',note='Descartado pela redação.' WHERE id=? AND state<>'published'").run(req.params.id);res.redirect('/admin/automacao');});
  app.post('/internal/automation/run',async(req,res)=>{
    const expected=Buffer.from(process.env.AUTOMATION_SECRET||''),supplied=Buffer.from(String(req.get('authorization')||'').replace(/^Bearer /,''));const staticAuth=expected.length>=32&&expected.length===supplied.length&&timingSafeEqual(expected,supplied);if(!staticAuth&&!await authorizeWorkflow(db,supplied.toString()))return res.sendStatus(401);res.set('Cache-Control','no-store').json(await runAutomation(db));
  });
}
