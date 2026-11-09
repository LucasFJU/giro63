import {randomBytes,createHash} from 'node:crypto';
import {transaction} from './postgres.js';
import {initializeInstagram} from './instagram-schema.js';
import {instagramStorage} from './instagram-storage.js';
import {metaClient,sealToken} from './instagram-meta.js';
import {syncInstagramArticle,prepareInstagramArt,runInstagram,socialArticle,socialSettings,socialEvent} from './instagram-jobs.js';
import {articleLink,photoVersion,sourceVersion,socialImageReady,eligibility} from './instagram-content.js';
import {authorizeWorkflow} from './workflow-auth.js';
export const socialLabels={prepared:'Preparado',waiting:'Aguardando liberação',creating:'Preparando envio',ready:'Na fila',publishing:'Enviando',published:'Publicado',error:'Erro',uncertain:'Conferir no Instagram',cancelled:'Cancelado'};
export async function mountInstagram(app,{db,requireUser,editor,checkCsrf,dataDir,readImage,secret,background=false,waitUntil,storage:providedStorage,meta:providedMeta}){
 await initializeInstagram(db);
 const storage=providedStorage||instagramStorage({directory:dataDir+'/instagram'}),meta=providedMeta||metaClient();
 const processQueue=()=>runInstagram(db,{storage,readImage,meta,secret});
 app.locals.kickInstagram=()=>{if(background){const task=processQueue().catch(()=>{});waitUntil(task);}};
 const callback=async()=>{const settings=await socialSettings(db);const url=new URL(settings.public_url);if(url.protocol!=='https:')throw Error('Configure a URL pública HTTPS antes da conexão.');return url.origin+'/integracoes/instagram/callback';};
 async function article(req,res){const id=Number(req.params.id);if(!Number.isSafeInteger(id))return null;const a=await socialArticle(db,id);if(!a||a.archived_at||a.deleted_at||!['review','published'].includes(a.status)){res.status(409).render('error',{title:'Matéria indisponível',message:'Prepare Instagram apenas para matérias em revisão ou publicadas.'});return null;}if(res.locals.user.role!=='editor'&&a.author_id!==res.locals.user.id){res.sendStatus(403);return null;}return a;}
 const editorPage=async(req,res,error='')=>{
  const a=await article(req,res);if(!a)return;
  const post=await db.prepare('SELECT * FROM instagram_posts WHERE article_id=?').get(a.id),settings=await socialSettings(db),connection=await db.prepare("SELECT username,account_type,expires_at FROM instagram_connection WHERE id='main'").get();
  res.render('instagram-edit',{title:'Instagram da matéria',article:a,post:req.method==='POST'&&req.path.endsWith('/salvar')&&post?{...post,...Object.fromEntries(['caption','headline','standfirst','rights_note','art_template','photo_x','photo_y'].filter(k=>typeof req.body[k]==='string').map(k=>[k,req.body[k]]))}:post,error,link:articleLink(a,settings.public_url||'https://giro63.vercel.app'),deliveries:post?await db.prepare('SELECT * FROM instagram_deliveries WHERE post_id=? ORDER BY target').all(post.id):[],socialLabels,blocked:post?eligibility(a,post,settings.instagram_mode,connection):'',stale:post&&post.source_version!==sourceVersion(a),rightsValid:post&&post.rights_version===photoVersion(a),events:post?await db.prepare('SELECT created_at,message FROM instagram_events WHERE post_id=? ORDER BY created_at DESC LIMIT 10').all(post.id):[]});
 };
 app.get('/admin/instagram',requireUser,editor,async(req,res)=>{
  const settings=await socialSettings(db),connection=await db.prepare("SELECT username,account_type,expires_at,updated_at FROM instagram_connection WHERE id='main'").get();
  const q=String(req.query.q||'').trim().slice(0,100),page=Math.min(100000,Math.max(1,Math.floor(Number(req.query.page)||1))),where="a.status IN ('published','review') AND a.archived_at='' AND a.deleted_at='' AND LOWER(a.title) LIKE ?",params=['%'+q.toLocaleLowerCase('pt-BR')+'%'];
  const total=Number((await db.prepare('SELECT count(*) n FROM articles a WHERE '+where).get(...params)).n),artArticles=await db.prepare('SELECT a.id,a.title,a.status,a.cover,a.updated_at,p.feed_path,p.error FROM articles a LEFT JOIN instagram_posts p ON p.article_id=a.id WHERE '+where+' ORDER BY a.updated_at DESC,a.id DESC LIMIT 20 OFFSET ?').all(...params,(page-1)*20);
  res.render('instagram',{title:'Estúdio de artes',q,page,pages:Math.ceil(total/20),total,artArticles,error:'',socialSettings:settings,connection,callbackUrl:await callback().catch(()=>''),configured:!!(process.env.INSTAGRAM_APP_ID&&process.env.INSTAGRAM_APP_SECRET),socialLabels,items:await db.prepare('SELECT p.id,p.article_id,p.error,p.change_notice,p.cancelled,a.title,d.target,d.state,d.media_id,d.error AS delivery_error FROM instagram_posts p JOIN articles a ON a.id=p.article_id JOIN instagram_deliveries d ON d.post_id=p.id ORDER BY p.updated_at DESC LIMIT 40').all()});
 });
 app.post('/admin/instagram/config',requireUser,editor,checkCsrf,async(req,res)=>{
  const mode=String(req.body.mode);if(!['prepare','paused','auto'].includes(mode))return res.sendStatus(400);
  if(mode==='auto'){
   const connection=await db.prepare("SELECT * FROM instagram_connection WHERE id='main'").get(),test=await db.prepare("SELECT p.id FROM instagram_posts p WHERE p.test_requested=1 AND (SELECT count(*) FROM instagram_deliveries d WHERE d.post_id=p.id AND d.state='published')=2").get();
   if(!connection||Number(connection.expires_at)<=Date.now()||!test||req.body.test_verified!=='on'){req.session.flash='Antes de ativar, conecte a conta, publique um teste nos dois destinos e confirme que conferiu o perfil.';return res.redirect('/admin/instagram');}
  }
  await transaction(db,async()=>{await db.prepare("UPDATE settings SET value=? WHERE key='instagram_mode'").run(mode);if(mode==='auto'){await db.prepare("UPDATE settings SET value=? WHERE key='instagram_activated_at' AND value=''").run(new Date().toISOString());await db.prepare("UPDATE settings SET value='1' WHERE key='instagram_test_verified'").run();}});
  req.session.flash=mode==='auto'?'Envio automático ativado para novas publicações elegíveis.':mode==='paused'?'Fila do Instagram pausada.':'Modo de preparação ativo. Nenhuma publicação automática será enviada.';res.redirect('/admin/instagram');
 });
 app.post('/admin/instagram/conectar',requireUser,editor,checkCsrf,async(req,res)=>{
  if(!process.env.INSTAGRAM_APP_ID||!process.env.INSTAGRAM_APP_SECRET){req.session.flash='Configure o aplicativo Meta na Vercel antes de conectar.';return res.redirect('/admin/instagram');}
  const state=randomBytes(32).toString('hex');await db.prepare('DELETE FROM instagram_oauth WHERE expires_at<?').run(Date.now());await db.prepare('INSERT INTO instagram_oauth(id,user_id,expires_at) VALUES(?,?,?)').run(createHash('sha256').update(state).digest('hex'),res.locals.user.id,Date.now()+600000);
  const url=new URL('https://www.instagram.com/oauth/authorize');url.search=new URLSearchParams({client_id:process.env.INSTAGRAM_APP_ID,redirect_uri:await callback(),response_type:'code',scope:'instagram_business_basic,instagram_business_content_publish',state,enable_fb_login:'0'}).toString();res.redirect(url.href);
 });
 // SameSite=Strict does not send the panel session on the cross-site callback.
 // One-use state is bound to the editor who initiated the connection in the DB.
 app.get('/integracoes/instagram/callback',async(req,res)=>{
  res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow'});const state=String(req.query.state||'');if(!/^[a-f0-9]{64}$/.test(state))return res.sendStatus(400);
  const valid=await transaction(db,async()=>{const id=createHash('sha256').update(state).digest('hex'),row=await db.prepare("SELECT o.* FROM instagram_oauth o JOIN users u ON u.id=o.user_id WHERE o.id=? AND o.expires_at>? AND u.active=1 AND u.role='editor'").get(id,Date.now());if(!row)return null;const removed=await db.prepare('DELETE FROM instagram_oauth WHERE id=?').run(id);return removed.changes?row:null;});if(!valid)return res.sendStatus(400);
  try{
   if(req.query.error||!req.query.code)throw Error();const result=await meta.exchange(String(req.query.code),await callback()),profile=await meta.profile(result.access_token),accountId=String(profile.user_id||profile.id||'');
   if(String(profile.username).toLowerCase()!=='port.algiro63'||profile.account_type!=='BUSINESS'||!/^\d+$/.test(accountId))throw Error();
   await db.prepare("INSERT INTO instagram_connection(id,account_id,username,account_type,token_cipher,expires_at,updated_at) VALUES('main',?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET account_id=excluded.account_id,username=excluded.username,account_type=excluded.account_type,token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,updated_at=excluded.updated_at").run(accountId,'port.algiro63','BUSINESS',sealToken(result.access_token,secret),Date.now()+Number(result.expires_in)*1000,new Date().toISOString());
   await db.prepare("UPDATE settings SET value='prepare' WHERE key='instagram_mode'").run();await db.prepare("UPDATE settings SET value='https://www.instagram.com/port.algiro63/' WHERE key='instagram' AND value=''").run();await socialEvent(db,null,'Conexão empresarial @port.algiro63 autorizada pelo editor '+valid.user_id+'. Modo de preparação preservado.');
   res.render('instagram-connected',{title:'Instagram conectado'});
  }catch{res.status(400).render('error',{title:'Conexão não concluída',message:'A conta precisa ser @port.algiro63, do tipo Empresa, com as permissões do aplicativo liberadas. Confira a configuração Meta e tente novamente no painel. Nenhuma credencial foi exibida.'});}
 });
 app.post('/admin/instagram/desconectar',requireUser,editor,checkCsrf,async(req,res)=>{await transaction(db,async()=>{await db.prepare("DELETE FROM instagram_connection WHERE id='main'").run();await db.prepare("UPDATE settings SET value='paused' WHERE key='instagram_mode'").run();});req.session.flash='Conexão removida do Giro63. Revogue também o acesso do aplicativo nas configurações do Instagram, se desejar.';res.redirect('/admin/instagram');});
 app.post('/admin/instagram/executar',requireUser,editor,checkCsrf,async(req,res)=>{const result=await processQueue();req.session.flash=result.message;res.redirect('/admin/instagram');});
 app.get('/admin/noticias/:id/instagram',requireUser,(req,res)=>editorPage(req,res));
 app.post('/admin/noticias/:id/instagram/preparar',requireUser,checkCsrf,async(req,res)=>{
  const a=await article(req,res);if(!a)return;try{let post=await syncInstagramArticle(db,a.id,{userId:res.locals.user.id});if(post.change_notice)throw Error('O material já foi enviado, cancelado ou exige conferência do histórico. Não haverá nova publicação automática.');await prepareInstagramArt(db,post,storage,readImage);res.redirect('/admin/noticias/'+a.id+'/instagram');}catch(error){res.status(400);await editorPage(req,res,error.message);}
 });
 app.post('/admin/noticias/:id/instagram/salvar',requireUser,checkCsrf,async(req,res)=>{
  const a=await article(req,res);if(!a)return;const post=await db.prepare('SELECT * FROM instagram_posts WHERE article_id=?').get(a.id);if(!post)return res.sendStatus(404);
  const template=String(req.body.art_template||(post.art_template==='light'?'light':'navy'));if(!['navy','light'].includes(template)){res.status(400);return editorPage(req,res,'Escolha um modelo válido.');}
  const caption=String(req.body.caption||'').trim(),headline=String(req.body.headline||'').trim(),standfirst=String(req.body.standfirst||'').trim(),x=Number(req.body.photo_x),y=Number(req.body.photo_y),note=String(req.body.rights_note||'').trim().slice(0,2000);
  if(!caption||caption.length>2200||!headline||headline.length>180||!standfirst||standfirst.length>500||!Number.isInteger(x)||x<0||x>100||!Number.isInteger(y)||y<0||y>100){res.status(400);return editorPage(req,res,'Confira os textos, o limite de 2.200 caracteres e o enquadramento.');}
  if(req.body.social_rights==='on'&&(res.locals.user.role!=='editor'||note.length<20||!socialImageReady(a))){res.status(400);return editorPage(req,res,'A autorização social exige editor, foto elegível e uma referência de pelo menos 20 caracteres.');}
  try{await transaction(db,async()=>{
   if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(6363)').get();
   const sent=await db.prepare("SELECT target FROM instagram_deliveries WHERE post_id=? AND state IN ('published','publishing','uncertain')").get(post.id);if(sent)throw Error('Há publicação enviada ou incerta. Confira o histórico; não é possível substituir esse material.');
   if(post.source_version!==sourceVersion(a))throw Error('Atualize a preparação a partir da matéria antes de editar.');
   await db.prepare("UPDATE instagram_posts SET art_template=?,caption=?,headline=?,standfirst=?,photo_x=?,photo_y=?,feed_path='',fallback_path='',story_path='',rights_version=?,rights_note=?,approved_by=?,approved_at=?,prepared_by=?,updated_at=?,error='' WHERE id=?").run(template,caption,headline,standfirst,x,y,req.body.social_rights==='on'?photoVersion(a):post.rights_version,req.body.social_rights==='on'?note:post.rights_note,req.body.social_rights==='on'?res.locals.user.id:post.approved_by,req.body.social_rights==='on'?new Date().toISOString():post.approved_at,res.locals.user.id,new Date().toISOString(),post.id);
   await db.prepare("UPDATE instagram_deliveries SET state='prepared',container_id='',error='',attempts=0,next_attempt_at=0 WHERE post_id=?").run(post.id);
   await socialEvent(db,post.id,'Material social editado por '+res.locals.user.id+(req.body.social_rights==='on'?' · autorização social registrada.':'.'));
  });const updated=await db.prepare('SELECT * FROM instagram_posts WHERE id=?').get(post.id);await prepareInstagramArt(db,updated,storage,readImage);app.locals.kickInstagram();res.redirect('/admin/noticias/'+a.id+'/instagram');}catch(error){res.status(400);await editorPage(req,res,error.message);}
 });
 app.get('/admin/noticias/:id/instagram/arte/:format',requireUser,async(req,res)=>{const a=await article(req,res);if(!a)return;const post=await db.prepare('SELECT * FROM instagram_posts WHERE article_id=?').get(a.id),field={feed:'feed_path',fallback:'fallback_path',story:'story_path'}[req.params.format];if(!post||!field||!post[field])return res.sendStatus(404);try{const bytes=await storage.read(post[field]);res.type('image/jpeg');if(req.query.download==='1')res.attachment('giro63-'+a.id+'-'+req.params.format+'.jpg');res.send(bytes);}catch{res.sendStatus(404);}});
 app.post('/admin/noticias/:id/instagram/:action',requireUser,editor,checkCsrf,async(req,res)=>{
  const a=await article(req,res);if(!a)return;const post=await db.prepare('SELECT * FROM instagram_posts WHERE article_id=?').get(a.id);if(!post)return res.sendStatus(404);
  if(req.params.action==='cancelar'){await db.prepare('UPDATE instagram_posts SET cancelled=1,test_requested=0 WHERE id=?').run(post.id);await db.prepare("UPDATE instagram_deliveries SET state='cancelled' WHERE post_id=? AND state NOT IN ('published','publishing','uncertain')").run(post.id);await socialEvent(db,post.id,'Envio cancelado pelo editor '+res.locals.user.id);}
  else if(req.params.action==='teste'){
   const settings=await socialSettings(db),connection=await db.prepare("SELECT * FROM instagram_connection WHERE id='main'").get(),reason=eligibility(a,{...post,test_requested:1,cancelled:0},settings.instagram_mode,connection);
   if(reason||!post.feed_path){req.session.flash=reason||'Prepare as artes antes do teste.';return res.redirect('/admin/noticias/'+a.id+'/instagram');}
   await transaction(db,async()=>{await db.prepare('UPDATE instagram_posts SET test_requested=1,cancelled=0 WHERE id=?').run(post.id);await db.prepare("UPDATE instagram_deliveries SET state='prepared',error='',attempts=0,next_attempt_at=0 WHERE post_id=? AND state='cancelled'").run(post.id);});await socialEvent(db,post.id,'Teste real solicitado pelo editor '+res.locals.user.id);app.locals.kickInstagram();
  }else if(req.params.action==='tentar'){
   await db.prepare("UPDATE instagram_deliveries SET state='prepared',container_id='',attempts=0,next_attempt_at=0,error='' WHERE post_id=? AND state='error'").run(post.id);app.locals.kickInstagram();
  }else return res.sendStatus(404);
  res.redirect('/admin/noticias/'+a.id+'/instagram');
 });
 app.post('/internal/instagram/run',async(req,res)=>{const token=String(req.get('authorization')||'').replace(/^Bearer /,'');if(!await authorizeWorkflow(db,token,{workflow:'instagram-publishing.yml',audience:'giro63-instagram'}))return res.sendStatus(401);res.set('Cache-Control','no-store').json(await processQueue());});
 return {storage,process:processQueue};
}
