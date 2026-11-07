import {directoryData} from './admin-directory.js';
import {contentHash,parseCodes,issueLabels,pendingCodes,factIssues,imageEligible,publicationError} from './publication-policy.js';
import {initializeEditorial} from './editorial-schema.js';
import {mountTags,tagsFor,assignTags} from './tags.js';
import {mountAutomation,reservePublication,event} from './automation.js';
import { mountPortal } from './portal.js';
import { openPostgres, transaction } from './postgres.js';
import { cloudMedia } from './cloud-media.js';
import {photoValues,photoFields,cropImage,discoverImage,addImageSuggestion,readSuggestedImage,checkImageApproval} from './article-images.js';
import express from 'express';
import { popularArticles,recordArticleRead,publicCities,homepageSections,readingMinutes,shortPublication } from './reader-experience.js';
import { editorialMedia } from './editorial-media.js';
import { mountAdvertising } from './advertising.js';
import session from 'express-session';
import helmet from 'helmet';
import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes,createHmac } from 'node:crypto';
import { openDatabase, seedDemo, cities, slugify, hashPassword, verifyPassword } from './db.js';
import { SQLiteSessionStore, csrf, checkCsrf, cleanBody, safeUrl } from './security.js';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const labels = {draft:'Rascunho',review:'Em revisão',published:'Publicado'};
export async function createApp({dataDir=process.env.GIRO63_DATA_DIR||path.join(root,'data'),uploadDir=path.join(root,'public','uploads'),seed=false,database=null,suggestedImageReader=readSuggestedImage,discoverArticleImage=discoverImage}={}) {
  const cloud=!!process.env.DATABASE_URL;
  const uploadLimitMb=cloud?4:8;
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:uploadLimitMb*1024*1024,files:1,fields:80,fieldSize:250000}}).single('image');
  if(process.env.VERCEL&&!cloud)throw Error('DATABASE_URL obrigatória na Vercel.');
  if(!cloud)mkdirSync(uploadDir,{recursive:true});
  const db=database||(cloud?openPostgres(process.env.DATABASE_URL):openDatabase(dataDir)); if(seed&&!cloud)seedDemo(db);
  await initializeEditorial(db);
  const secretFile=path.join(dataDir,'.session-secret');
  if(!cloud&&!existsSync(secretFile))writeFileSync(secretFile,randomBytes(48).toString('hex'),{mode:0o600});
  if(cloud&&String(process.env.SESSION_SECRET||'').length<48)throw Error('SESSION_SECRET precisa de pelo menos 48 caracteres.');
  const app=express(); app.locals.db=db;
  const media=cloud?cloudMedia():editorialMedia({publicDir:path.join(root,'public'),uploadDir});
  if(cloud)app.set('trust proxy',1);
  app.set('view engine','ejs'); app.set('views',path.join(root,'views')); app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'data:','blob:',...(cloud?[media.publicOrigin]:[])],fontSrc:["'self'"],formAction:["'self'"],upgradeInsecureRequests:cloud?[]:null}},strictTransportSecurity:cloud?undefined:false}));
  app.use('/uploads',express.static(uploadDir,{dotfiles:'deny',setHeaders:res=>res.setHeader('X-Content-Type-Options','nosniff')}));
  app.use(express.static(path.join(root,'public'),{dotfiles:'deny'}));
  app.use(express.urlencoded({extended:false,limit:'300kb'}));
  app.use(session({name:'giro63.sid',secret:cloud?process.env.SESSION_SECRET:readFileSync(secretFile,'utf8'),store:new SQLiteSessionStore(db),resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'strict',secure:cloud,maxAge:8*3600000}}));
  app.use(async (req,res,next)=>{
    res.locals.uploadLimitMb=uploadLimitMb;
    res.locals.settings=Object.fromEntries((await db.prepare('SELECT * FROM settings').all()).map(r=>[r.key,r.value]));
    const categoryRows=(await db.prepare('SELECT * FROM editorial_categories ORDER BY position,name').all());
    res.locals.categories=categoryRows.map(c=>[c.slug,c.name]);res.locals.navCategories=categoryRows.filter(c=>c.show_menu).map(c=>[c.slug,c.name]);res.locals.cities=(await publicCities(db));res.locals.slugify=slugify;res.locals.labels=labels;
    res.locals.categoryName=key=>res.locals.categories.find(c=>c[0]===key)?.[1]||key;
    res.locals.formatDate=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value)):'';
    res.locals.today=new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeZone:'America/Sao_Paulo'}).format(new Date());
    res.locals.user=req.session.userId?(await db.prepare('SELECT id,name,email,role FROM users WHERE id=? AND active=1').get(req.session.userId)):null;
    res.locals.path=req.path;res.locals.flash=req.session.flash||'';delete req.session.flash;
    res.locals.title='Notícias do Tocantins';res.locals.description='Giro63: notícias, cidades, cultura e perspectivas do Tocantins.';
    res.locals.articleTags=[];res.locals.imageSuggestions=[];res.locals.allTags=await db.prepare('SELECT * FROM tags ORDER BY name').all();res.locals.tagFilter=String(req.query.tag||'');res.locals.metadata=null;res.locals.ads=[];
    res.locals.editorialImage=media.get;res.locals.readingMinutes=readingMinutes;res.locals.shortPublication=shortPublication;res.locals.mostRead=(await popularArticles(db));
    next();
  });
  app.use(csrf);
  app.use('/admin',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const requireUser=(req,res,next)=>res.locals.user?next():res.redirect('/admin/login');
  const editor=(req,res,next)=>res.locals.user?.role==='editor'?next():res.status(403).render('error',{title:'Acesso restrito',message:'Esta ação está disponível apenas para editores.'});
  const flash=(req,message)=>req.session.flash=message;
  (await mountPortal(app,{db,requireUser,editor,checkCsrf,flash}));
  app.use('/admin/publicidade',requireUser);
  (await mountAdvertising(app,{db,editor,checkCsrf,upload,saveImage,flash}));
  const publicArticles=async ()=>(await db.prepare("SELECT * FROM articles WHERE status='published' ORDER BY published_at DESC,id DESC").all());
  app.get('/',async (req,res)=>res.render('home',homepageSections((await publicArticles()))));
  async function listing(req,res,{heading,where='1=1',params=[],intro=''}) {
    let page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page)||1));const pageSize=12;
    const total=(await db.prepare(`SELECT count(*) AS n FROM articles WHERE status='published' AND (${where})`).get(...params)).n;
    page=Math.min(page,Math.max(1,Math.ceil(total/pageSize)));
    const articles=(await db.prepare(`SELECT * FROM articles WHERE status='published' AND (${where}) ORDER BY published_at DESC,id DESC LIMIT ? OFFSET ?`).all(...params,pageSize,(page-1)*pageSize));
    const q=String(req.query.q||'').slice(0,100),categoryFilter=String(req.query.editoria||'').slice(0,100),cityFilter=String(req.query.cidade||'').slice(0,150);
    const pageLink=n=>{const params=new URLSearchParams();if(q)params.set('q',q);if(req.path==='/busca'){if(categoryFilter)params.set('editoria',categoryFilter);if(cityFilter)params.set('cidade',cityFilter);}if(req.query.tag)params.set('tag',String(req.query.tag));params.set('page',String(n));return req.path+'?'+params.toString();};
    res.render('listing',{title:heading,heading,intro,articles,page,pages:Math.ceil(total/pageSize),total,q,categoryFilter,cityFilter,pageLink,base:req.path});
  }
  mountTags(app,{db,requireUser,editor,checkCsrf,listing});
  mountAutomation(app,{db,requireUser,editor,checkCsrf});
  app.get('/ultimas',async (req,res)=>(await listing(req,res,{heading:'Últimas notícias',intro:'Acompanhe o Tocantins, uma história de cada vez.'})));
  app.get('/editoria/:slug',async (req,res,next)=>{const cat=res.locals.categories.find(c=>c[0]===req.params.slug);if(!cat)return next();(await listing(req,res,{heading:cat[1],where:'category=?',params:[cat[0]],intro:'Contexto e informação sobre o que faz parte da sua vida.'}));});
  app.get('/cidade/:slug',async (req,res,next)=>{const city=res.locals.cities.find(c=>slugify(c)===req.params.slug);if(!city)return next();(await listing(req,res,{heading:city,where:'normalize_search(city)=normalize_search(?)',params:[city],intro:'As histórias que aproximam a sua cidade.'}));});
  app.get('/busca',async (req,res)=>{
    const q=String(req.query.q||'').trim().slice(0,100),category=String(req.query.editoria||'').slice(0,100),city=String(req.query.cidade||'').slice(0,150),conditions=[],params=[];
    if(q){const escaped=q.replace(/[!%_]/g,'!$&');conditions.push("(normalize_search(title) LIKE normalize_search(?) ESCAPE '!' OR normalize_search(summary) LIKE normalize_search(?) ESCAPE '!' OR normalize_search(city) LIKE normalize_search(?) ESCAPE '!')");params.push(...Array(3).fill('%'+escaped+'%'));}
    if(category){conditions.push('category=?');params.push(category);}
    if(city){const place=res.locals.cities.find(c=>slugify(c)===city);if(place){conditions.push('normalize_search(city)=normalize_search(?)');params.push(place);}else conditions.push('0=1');}
    if(req.query.tag){conditions.push('id IN (SELECT article_id FROM article_tags WHERE tag_slug=?)');params.push(String(req.query.tag));}
    (await listing(req,res,{heading:q?'Resultados para “'+q+'”':'Buscar no Giro63',where:conditions.length?conditions.join(' AND '):'0=1',params,intro:'Encontre notícias por assunto, editoria ou cidade.'}));
  });
  app.get('/noticia/:slug',async (req,res,next)=>{
    const article=(await db.prepare("SELECT a.*,u.name AS author_name FROM articles a LEFT JOIN users u ON u.id=a.author_id WHERE a.slug=? AND a.status='published'").get(req.params.slug));if(!article)return next();
    res.locals.articleTags=await tagsFor(db,article.id);
    (await recordArticleRead(db,{method:req.method,session:req.session,sessionId:req.sessionID,user:res.locals.user,article}));res.locals.mostRead=(await popularArticles(db));
    const related=(await db.prepare("SELECT * FROM articles WHERE status='published' AND id<>? ORDER BY (category=?) DESC,published_at DESC LIMIT 4").all(article.id,article.category));
    const url=`http://localhost:${process.env.PORT||3000}/noticia/${article.slug}`;
    res.render('article',{title:article.title,description:article.summary,article,related,preview:false,metadata:{url,image:`http://localhost:${process.env.PORT||3000}${article.cover}`,type:'article'}});
  });
  const institutional={'sobre':['Sobre o Giro63','about'],'expediente':['Expediente','staff'],'politica-editorial':['Política editorial','editorial'],'contato':['Fale com a redação','contact'],'anuncie':['Sua marca no Giro63','advertise']};
  app.get('/pagina/:slug',(req,res,next)=>{const entry=institutional[req.params.slug];if(!entry)return next();res.render('institutional',{title:entry[0],heading:entry[0],kind:entry[1]});});
  app.get('/admin/login',async (req,res)=>res.locals.user?res.redirect('/admin'):res.render('login',{title:'Entrar na redação',error:'',needsSetup:!(await db.prepare("SELECT id FROM users WHERE role='editor' AND active=1").get())}));
  if(db.dialect!=='postgres')await db.exec('CREATE TABLE IF NOT EXISTS login_attempts(key_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,expires_at BIGINT NOT NULL)');
  const loginSecret=cloud?process.env.SESSION_SECRET:readFileSync(secretFile,'utf8');
  app.post('/admin/login',checkCsrf,async (req,res,next)=>{
    const key=createHmac('sha256',loginSecret).update(req.ip||'unknown').digest('hex'),now=Date.now();
    const admitted=await transaction(db,async()=>{
      if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').get(key);
      await db.prepare('DELETE FROM login_attempts WHERE expires_at<=?').run(now);
      const state=await db.prepare('SELECT * FROM login_attempts WHERE key_hash=?').get(key);
      if((state?.attempts||0)>=10)return false;
      await db.prepare('INSERT INTO login_attempts(key_hash,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=login_attempts.attempts+1').run(key,now+15*60000);return true;
    });
    if(!admitted)return res.status(429).render('login',{title:'Aguarde para tentar novamente',error:'Muitas tentativas. Aguarde 15 minutos.',needsSetup:false});
    const user=(await db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1').get(String(req.body.email||'').trim()));
    if(!verifyPassword(String(req.body.password||''),user?.password||'invalid'))return res.status(401).render('login',{title:'Entrar na redação',error:'E-mail ou senha incorretos.',needsSetup:false});
    await db.prepare('DELETE FROM login_attempts WHERE key_hash=?').run(key);req.session.regenerate(err=>{if(err)return next(err);req.session.userId=user.id;req.session.save(err=>err?next(err):res.redirect('/admin'));});
  });
  app.post('/admin/logout',requireUser,checkCsrf,(req,res,next)=>req.session.destroy(err=>err?next(err):res.clearCookie('giro63.sid').redirect('/admin/login')));
  app.use('/admin',requireUser);
  app.get(['/admin','/admin/materias'],async (req,res)=>{
    const user=res.locals.user,overview=req.path==='/admin',q=String(req.query.q||'').trim().slice(0,100),status=['draft','review','published','checking','archived','trash'].includes(req.query.status)?req.query.status:'',category=String(req.query.category||'').slice(0,100);
    const base=user.role==='author'?'a.author_id=?':'1=1',baseParams=user.role==='author'?[user.id]:[];
    const checking="EXISTS(SELECT 1 FROM automation_items i WHERE i.article_id=a.id AND i.review_pending=1)";
    const stats=await db.prepare(`SELECT count(*) AS total,SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS draft,SUM(CASE WHEN status='review' THEN 1 ELSE 0 END) AS review,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published FROM articles a WHERE ${base} AND a.archived_at='' AND a.deleted_at=''`).get(...baseParams);
    const conditions=[base,status==='trash'?"a.deleted_at<>''":status==='archived'?"a.archived_at<>'' AND a.deleted_at=''":"a.archived_at='' AND a.deleted_at=''"],params=[...baseParams];
    if(!overview){if(q){conditions.push("normalize_search(a.title||' '||COALESCE(u.name,a.byline,'')||' '||a.city) LIKE normalize_search(?) ESCAPE '!'");params.push('%'+q.replace(/[!%_]/g,'!$&')+'%');}if(status==='checking')conditions.push("a.status='published' AND "+checking);else if(status&&!['archived','trash'].includes(status)){conditions.push('a.status=?');params.push(status);}if(category){conditions.push('a.category=?');params.push(category);}}
    const join='FROM articles a LEFT JOIN users u ON u.id=a.author_id WHERE '+conditions.join(' AND '),total=Number((await db.prepare('SELECT count(*) AS n '+join).get(...params)).n),page=Math.min(Math.max(1,parseInt(req.query.page)||1),Math.max(1,Math.ceil(total/20)));
    const articles=await db.prepare('SELECT a.*,u.name AS author_name,CASE WHEN '+checking+' THEN 1 ELSE 0 END AS review_pending '+join+' ORDER BY a.updated_at DESC,a.id DESC LIMIT ? OFFSET ?').all(...params,overview?10:20,overview?0:(page-1)*20);
    const pageLink=n=>'/admin/materias?'+new URLSearchParams({q,status,category,page:String(n)});
    res.render('dashboard',{title:overview?'Visão geral':'Matérias',articles,stats,q,status,category,page,total,pages:Math.ceil(total/20),pageLink});
  });
  app.post('/admin/materias/:id/:operation',checkCsrf,async(req,res)=>{
    const id=Number(req.params.id),operation=req.params.operation;if(!Number.isSafeInteger(id)||!['arquivar','excluir','restaurar'].includes(operation))return res.sendStatus(404);
    const result=await transaction(db,async()=>{
      if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(6363)').get();
      const item=await db.prepare('SELECT * FROM articles WHERE id=?').get(id);if(!item)return 404;
      if(res.locals.user.role!=='editor'&&(item.author_id!==res.locals.user.id||item.status==='published'))return 403;
      const stamp=new Date().toISOString();
      if(operation==='restaurar')await db.prepare("UPDATE articles SET archived_at='',deleted_at='',status='draft',featured=0,updated_at=? WHERE id=?").run(stamp,id);
      else if(operation==='excluir')await db.prepare("UPDATE articles SET deleted_at=?,status='draft',featured=0,updated_at=? WHERE id=?").run(stamp,stamp,id);
      else if(!item.deleted_at)await db.prepare("UPDATE articles SET archived_at=?,status='draft',featured=0,updated_at=? WHERE id=?").run(stamp,stamp,id);
      await db.prepare("UPDATE automation_items SET state='review' WHERE article_id=? AND state='published'").run(id);
      return 302;
    });if(result!==302)return res.sendStatus(result);
    flash(req,operation==='excluir'?'Matéria enviada para a lixeira. Pode ser restaurada.':operation==='arquivar'?'Matéria arquivada e retirada do site.':'Matéria restaurada como rascunho.');res.redirect('/admin/materias'+(operation==='excluir'?'?status=trash':operation==='arquivar'?'?status=archived':''));
  });
  const blankArticle=()=>({id:null,title:'',summary:'',body:'',category:'cidades',city:'',byline:'',cover:'',cover_alt:'',credit:'',sources:'',status:'draft',featured:0,urgent:0,demo:0,feedback:''});
  const findEditable=async (req,res)=>{
    const id=Number(req.params.id);
    const a=Number.isSafeInteger(id)&&id>0?await db.prepare('SELECT * FROM articles WHERE id=?').get(id):null;
    if(!a){res.status(404).render('error',{title:'Matéria não encontrada',message:'Confira o endereço e volte ao painel.'});return null;}
    if(a.archived_at||a.deleted_at){res.status(409).render('error',{title:'Matéria guardada',message:'Restaure a matéria na lista de Arquivadas ou na Lixeira antes de editar.'});return null;}
    if(res.locals.user.role!=='editor'&&(a.author_id!==res.locals.user.id||a.status==='published')){res.status(403).render('error',{title:'Acesso restrito',message:'Autores podem editar apenas suas próprias matérias ainda não publicadas.'});return null;}res.locals.sourceItem=await db.prepare('SELECT i.*,s.name AS source_name FROM automation_items i JOIN automation_sources s ON s.id=i.source_id WHERE i.article_id=?').get(a.id);a.tags=(await tagsFor(db,a.id)).map(t=>t.name).join(', ');res.locals.articleTags=await tagsFor(db,a.id);res.locals.imageSuggestions=await db.prepare("SELECT * FROM article_image_suggestions WHERE article_id=? AND status='pending' ORDER BY created_at DESC").all(a.id);return a;
  };
  app.get('/admin/noticias/nova',(req,res)=>res.render('edit',{title:'Nova matéria',article:blankArticle(),error:''}));
  app.get('/admin/noticias/:id',async (req,res)=>{const article=(await findEditable(req,res));if(article)res.render('edit',{title:'Editar matéria',article,error:''});});
  app.get('/admin/noticias/:id/preview',async (req,res)=>{const article=(await findEditable(req,res));if(article)res.render('article',{title:`Prévia: ${article.title}`,article,related:[],preview:true});});
  app.post('/admin/noticias/:id/imagem/sugerir',editor,checkCsrf,async(req,res)=>{
    const article=await findEditable(req,res);if(!article)return;
    const origin=await db.prepare('SELECT i.url FROM automation_items i JOIN automation_sources s ON s.id=i.source_id WHERE i.article_id=? AND s.approved=1').get(article.id);
    try{if(!origin)throw Error();const candidate=await discoverArticleImage(origin.url);await addImageSuggestion(db,article.id,candidate);flash(req,candidate?'Imagem sugerida. Confira direitos, contexto e dados antes de aprovar.':'A fonte não forneceu uma imagem elegível. A capa atual foi preservada.');}catch{flash(req,'Não foi possível obter uma sugestão da fonte aprovada. A capa atual foi preservada.');}res.redirect('/admin/noticias/'+article.id+'#photo-management');
  });
  app.get('/admin/noticias/:id/imagem/:suggestion',async(req,res)=>{
    const article=await findEditable(req,res);if(!article)return;
    const candidate=await db.prepare("SELECT * FROM article_image_suggestions WHERE id=? AND article_id=? AND status='pending'").get(req.params.suggestion,article.id);if(!candidate)return res.sendStatus(404);
    try{const buffer=await suggestedImageReader(candidate);res.set('Cache-Control','private, no-store').type('webp').send(await sharp(buffer).rotate().resize({width:720,withoutEnlargement:true}).webp().toBuffer());}catch{res.sendStatus(502);}
  });
  app.post('/admin/noticias/:id/imagem/:suggestion/rejeitar',editor,checkCsrf,async(req,res)=>{const article=await findEditable(req,res);if(!article)return;await db.prepare("UPDATE article_image_suggestions SET status='rejected',reviewed_by=?,reviewed_at=? WHERE id=? AND article_id=? AND status='pending'").run(res.locals.user.id,new Date().toISOString(),req.params.suggestion,article.id);flash(req,'Sugestão descartada. A capa atual foi preservada.');res.redirect('/admin/noticias/'+article.id+'#photo-management');});
  async function saveImage(file) {
    if(cloud)return media.save(file);
    if(!file)return null;
    const meta=await sharp(file.buffer,{limitInputPixels:25e6}).metadata();
    if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw new Error('Use uma imagem JPG, PNG ou WebP estática.');
    const filename=randomBytes(20).toString('hex')+'.webp';
    await sharp(file.buffer,{limitInputPixels:25e6}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toFile(path.join(uploadDir,filename));
    return '/uploads/'+filename;
  }
  async function imageBuffer(source){
    if(cloud&&source.startsWith(media.publicOrigin+'/storage/v1/object/public/'+(process.env.SUPABASE_STORAGE_BUCKET||'giro63-media')+'/editorial/')){
      const response=await fetch(source,{redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Não foi possível ler a imagem atual.');const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>8*1024*1024)throw Error('Imagem excede o limite.');chunks.push(chunk);}return Buffer.concat(chunks);
    }
    const base=source.startsWith('/images/')?path.join(root,'public','images'):source.startsWith('/uploads/')?uploadDir:null;if(!base)throw Error('Imagem atual fora do armazenamento aprovado.');const file=path.resolve(base,source.replace(/^\/(images|uploads)\//,''));if(!file.startsWith(path.resolve(base)+path.sep))throw Error('Imagem inválida.');return readFileSync(file);
  }
  async function saveCrop(buffer){if(cloud)return media.saveVariant(buffer);const directory=path.join(uploadDir,'crops');mkdirSync(directory,{recursive:true});const name=randomBytes(20).toString('hex')+'.webp';writeFileSync(path.join(directory,name),buffer);const url='/uploads/crops/'+name;await media.generate(url);return url;}
  const articleUpload=(req,res,next)=>{upload(req,res,async err=>{if(!err)return next();const old=req.params.id?(await findEditable(req,res)):null;if(req.params.id&&!old)return;const fields=Object.fromEntries(Object.entries(req.body||{}).filter(([key])=>['title','summary','body','category','tags','city','cover_alt','credit','sources','byline','feedback',...photoFields].includes(key)));if(fields.body)fields.body=cleanBody(fields.body);res.status(400).render('edit',{title:'Revise a imagem',article:{...blankArticle(),...old,...fields},error:'Envie uma imagem de até 8 MB. Confira os campos e selecione o arquivo novamente.'});});};
  async function saveArticle(req,res,next) {
    const old=req.params.id?(await findEditable(req,res)):null;if(req.params.id&&!old)return;
    const isEditor=res.locals.user.role==='editor';
    const requested=req.body.action||'draft',desired=requested==='approve-publish'?'published':requested;
    const allowed=isEditor?['draft','review','published']:['draft','review'];
    if(!allowed.includes(desired))return res.status(403).render('error',{title:'Ação não permitida',message:'Apenas editores podem publicar matérias.'});
    const a={...blankArticle(),...old,tags:String(req.body.tags||'').slice(0,500),title:String(req.body.title||'').trim().slice(0,180),summary:String(req.body.summary||'').trim().slice(0,500),body:cleanBody(req.body.body),category:String(req.body.category||''),city:String(req.body.city||'').trim().slice(0,100),cover_alt:String(req.body.cover_alt??old?.cover_alt??'').trim().slice(0,250),credit:String(req.body.credit||'').trim().slice(0,250),sources:String(req.body.sources||'').trim().slice(0,3000),byline:isEditor?String(req.body.byline||'').trim().slice(0,100):res.locals.user.name,demo:req.body.demo==='on'?1:0,status:desired,featured:isEditor?Math.max(0,Math.min(4,Number.parseInt(req.body.featured)||0)):(old?.featured||0),urgent:isEditor&&req.body.urgent==='on'?1:(isEditor?0:(old?.urgent||0)),feedback:isEditor?String(req.body.feedback||'').slice(0,2000):(old?.feedback||'')};
    let photo;try{photo=photoValues(req.body,old||{});Object.assign(a,photo);}catch(error){Object.assign(a,Object.fromEntries(photoFields.map(key=>[key,String(req.body[key]??old?.[key]??'')])));return res.status(400).render('edit',{title:'Revise a imagem',article:a,error:'Confira o endereço HTTPS da fonte e os valores do recorte (0, 25, 50, 75 ou 100).'});}
    if(!a.title||!a.summary||!a.body.replace(/<[^>]*>/g,'').trim()||!res.locals.categories.some(c=>c[0]===a.category))return res.status(400).render('edit',{title:'Revise a matéria',article:a,error:'Preencha título, resumo, conteúdo e uma editoria válida.'});
    try {
      let selected=null,file=req.file;const approvalBody={...req.body,image_rights_confirmed:req.body.editorial_image_rights||req.body.image_rights_confirmed,image_context_confirmed:req.body.editorial_image_context||req.body.image_context_confirmed};
      if(req.body.image_suggestion){
        if(!isEditor)return res.status(403).render('error',{title:'Aprovação restrita',message:'Apenas editores podem aprovar imagens sugeridas.'});
        if(req.file)throw Error('Escolha uma sugestão ou um novo arquivo, não ambos.');
        selected=await db.prepare("SELECT * FROM article_image_suggestions WHERE id=? AND article_id=? AND status='pending'").get(String(req.body.image_suggestion),old?.id||0);if(!selected)throw Error('Sugestão indisponível. Reabra a matéria.');
        checkImageApproval(approvalBody,photo,a.cover_alt);file={buffer:await suggestedImageReader(selected)};
      }
      if(photo.photo_photographer||photo.photo_source)a.credit=[photo.photo_photographer,photo.photo_source].filter(Boolean).join(' / ');
      if(req.file&&!a.credit)return res.status(400).render('edit',{title:'Crédito obrigatório',article:a,error:'Informe o crédito da imagem antes de enviar.'});
      const image=await saveImage(file);if(image)a.cover=image;
      if(!a.cover)a.cover='/images/cerrado.jpg';
      if(desired==='published'&&!a.demo&&(!a.sources||!a.credit))return res.status(400).render('edit',{title:'Revise a publicação',article:a,error:'Matérias reais precisam de fontes e crédito da imagem para publicação. Reenvie a imagem se ela ainda não estava salva.'});
      await media.generate(a.cover);
      if(file||a.photo_x!==(old?.photo_x??50)||a.photo_y!==(old?.photo_y??50)||!old?.photo_share){
        const bytes=file?.buffer||await imageBuffer(a.cover);
        for(const [key,w,h] of [['photo_cover',1200,675],['photo_thumb',640,388],['photo_share',1200,630]])a[key]=await saveCrop(await cropImage(bytes,w,h,a.photo_x,a.photo_y));
      }
      const now=new Date().toISOString();
      const importedItem=old?await db.prepare('SELECT i.*,s.approved AS source_approved,s.region FROM automation_items i JOIN automation_sources s ON s.id=i.source_id WHERE i.article_id=?').get(old.id):null;
      let approvedCover=importedItem?.approved_cover||'';
      if(importedItem&&['credit','cover_alt','photo_photographer','photo_source','photo_source_url','photo_license'].some(k=>a[k]!==old[k]))approvedCover='';
      if(importedItem&&!isEditor&&(approvalBody.image_rights_confirmed==='on'||approvalBody.image_context_confirmed==='on'))return res.sendStatus(403);
      if(importedItem&&(selected||approvalBody.image_rights_confirmed==='on'||approvalBody.image_context_confirmed==='on')){checkImageApproval(approvalBody,photo,a.cover_alt);approvedCover=a.cover;}
      if(importedItem&&file&&!selected&&approvalBody.image_rights_confirmed!=='on')approvedCover='';
      let blocks=[],pending=[],resolution='';
      if(importedItem){
        blocks=parseCodes(importedItem.blockers).filter(c=>c!=='IMAGE_PENDING');pending=parseCodes(importedItem.review_reasons);
        const editorialText=(a.title+' '+a.summary+' '+a.body.replace(/<p>Conteúdo preparado[\s\S]*?<\/p>/g,'').replace(/<[^>]*>/g,' '));
        if(importedItem.confirmed_hash!==contentHash(a))blocks=[...new Set([...blocks,...factIssues(editorialText,importedItem.title+' '+importedItem.summary)])];
        if(a.city){const normalize=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const hay=' '+normalize(importedItem.title+' '+importedItem.summary).replace(/[^a-z0-9]+/g,' ')+' ',needle=' '+normalize(a.city).replace(/[^a-z0-9]+/g,' ')+' ';if(!hay.includes(needle)){a.city='';pending.push('CITY_ABSENT');}}
        const resolved=[].concat(req.body.resolved_issues||[]).map(String),note=String(req.body.resolution_note||'').trim().slice(0,2000);
        if(isEditor&&resolved.length&&note.length>=20){
          const classified=String(req.body.classify_unknown||'');
          if(blocks.includes('UNKNOWN_ALERT')&&Object.hasOwn(issueLabels,classified)&&classified!=='UNKNOWN_ALERT'&&classified!=='LEGACY_REVIEW'){
            blocks=blocks.filter(c=>c!=='UNKNOWN_ALERT');if(pendingCodes.has(classified))pending.push(classified);else blocks.push(classified);
          }
          const cleared=blocks.filter(c=>c!=='UNKNOWN_ALERT'&&Object.hasOwn(issueLabels,c)&&resolved.includes(c));
          blocks=blocks.filter(c=>!cleared.includes(c));resolution=note+' · códigos conferidos: '+cleared.join(', ')+(classified?' · classificação: '+classified:'');
        }
        if(!importedItem.source_approved)blocks.push('SOURCE_UNAUTHORIZED');
        if(!imageEligible(a,approvedCover))blocks.push('IMAGE_PENDING');
        blocks=[...new Set(blocks)];pending=[...new Set(pending)];
        res.locals.sourceItem={...res.locals.sourceItem,blockers:JSON.stringify(blocks)};
        if(desired==='published'&&blocks.length)throw publicationError('Publicação bloqueada: '+blocks.map(c=>issueLabels[c]||issueLabels.UNKNOWN_ALERT).join('; ')+'. Salve o rascunho ou conclua as conferências indicadas.');
      }
      let slug=old?.slug||slugify(a.title)||'materia';
      if(!old){let n=1;const base=slug;while((await db.prepare('SELECT id FROM articles WHERE slug=?').get(slug)))slug=base+'-'+(++n);}
      await transaction(db,async()=>{
        if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(6363)').get();
        if(a.featured>0&&desired==='published')(await db.prepare('UPDATE articles SET featured=0 WHERE featured=? AND id<>?').run(a.featured,old?.id||0));
        if(importedItem){
          const current=await db.prepare('SELECT * FROM automation_items WHERE id=?'+(db.dialect==='postgres'?' FOR UPDATE':'')).get(importedItem.id);
          const latest=await db.prepare('SELECT updated_at FROM articles WHERE id=?').get(old.id);if(latest.updated_at!==old.updated_at)throw publicationError('A matéria foi alterada por outro editor. Reabra antes de publicar; seu texto está preservado neste formulário.');
          const source=await db.prepare('SELECT approved FROM automation_sources WHERE id=?').get(current.source_id);if(desired==='published'&&!source.approved)throw publicationError('Fonte sem autorização de reutilização.');
          if(desired==='published'&&!Number(current.publication_counted)&&!await reservePublication(db,importedItem.region==='regional'))throw publicationError('Limite diário atingido: até 10 publicações e 3 nacionais. A matéria foi preservada para a próxima publicação.');
          await db.prepare('UPDATE automation_items SET state=?,policy_version=1,blockers=?,review_reasons=?,review_pending=?,approved_cover=?,publication_counted=?,reviewed_by=?,reviewed_at=?,resolution_note=?,confirmed_hash=? WHERE id=?').run(desired==='published'?'published':'review',JSON.stringify(blocks),JSON.stringify(pending),pending.length&&(current.review_pending||old?.status!=='published'||contentHash(old)!==contentHash(a))?1:0,approvedCover,desired==='published'?1:Number(current.publication_counted),resolution?res.locals.user.id:current.reviewed_by,resolution?now:current.reviewed_at,resolution||current.resolution_note,resolution?contentHash(a):current.confirmed_hash,importedItem.id);
          if(resolution)await event(db,'Conferência prévia: '+importedItem.id+' · editor '+res.locals.user.id+' · '+resolution);
          if(desired==='published')await event(db,'Publicação aprovada: '+importedItem.id+' · editor '+res.locals.user.id+(pending.length?' · pendências: '+pending.join(', '):''));
        }
        const values=[a.title,a.summary,a.body,a.category,a.city,a.byline,a.cover,a.cover_alt,a.credit,a.sources,a.status,a.featured,a.urgent,a.demo,a.feedback,now,desired==='published'?(old?.published_at||now):old?.published_at||null];
        if(old)(await db.prepare('UPDATE articles SET title=?,summary=?,body=?,category=?,city=?,byline=?,cover=?,cover_alt=?,credit=?,sources=?,status=?,featured=?,urgent=?,demo=?,feedback=?,updated_at=?,published_at=? WHERE id=?').run(...values,old.id));
        else (await db.prepare('INSERT INTO articles(title,summary,body,category,city,byline,cover,cover_alt,credit,sources,status,featured,urgent,demo,feedback,updated_at,published_at,slug,author_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...values,slug,res.locals.user.id,now));
        const taggedId=old?.id||(await db.prepare('SELECT id FROM articles WHERE slug=?').get(slug)).id;await db.prepare('DELETE FROM article_tags WHERE article_id=?').run(taggedId);await assignTags(db,taggedId,a.tags);
        await db.prepare('UPDATE articles SET photo_photographer=?,photo_source=?,photo_source_url=?,photo_license=?,photo_caption=?,photo_x=?,photo_y=?,photo_cover=?,photo_thumb=?,photo_share=? WHERE id=?').run(a.photo_photographer,a.photo_source,a.photo_source_url,a.photo_license,a.photo_caption,a.photo_x,a.photo_y,a.photo_cover||'',a.photo_thumb||'',a.photo_share||'',taggedId);
        if(selected){const approved=await db.prepare("UPDATE article_image_suggestions SET status='approved',reviewed_by=?,reviewed_at=?,photographer=?,source=?,license=?,caption=?,alt=? WHERE id=? AND status='pending'").run(res.locals.user.id,now,photo.photo_photographer,photo.photo_source,photo.photo_license,photo.photo_caption,a.cover_alt,selected.id);if(!approved.changes)throw Error('Sugestão já revisada por outro editor. Reabra a matéria.');}
      });
      const savedId=old?.id||(await db.prepare('SELECT id FROM articles WHERE slug=?').get(slug)).id;
      flash(req,desired==='published'?'Matéria publicada no portal.':desired==='review'?'Matéria enviada para revisão.':'Rascunho salvo.');res.redirect(desired==='draft'?'/admin/noticias/'+savedId:'/admin/materias');
    }catch(e){if(e.publication)return res.status(400).render('edit',{title:'Revise a publicação',article:{...a,cover:old?.cover||'',photo_cover:old?.photo_cover||'',photo_thumb:old?.photo_thumb||'',photo_share:old?.photo_share||''},error:e.message+' Selecione novamente qualquer arquivo ainda não salvo.'});if(/sugestão|sugestões|aprovar|recortes|armazenar|ler a imagem/i.test(e.message))return res.status(400).render('edit',{title:'Revise a imagem',article:{...a,cover:old?.cover||'',photo_cover:old?.photo_cover||'',photo_thumb:old?.photo_thumb||'',photo_share:old?.photo_share||''},error:e.message});if(/image|Input|format|JPG|pixels|unsupported|corrupt/i.test(e.message))return res.status(400).render('edit',{title:'Verifique a imagem',article:{...a,cover:old?.cover||''},error:'Imagem inválida. Use JPG, PNG ou WebP estático dentro dos limites informados.'});next(e);}
  }
  app.post('/admin/noticias',articleUpload,checkCsrf,saveArticle);
  app.post('/admin/noticias/:id',articleUpload,checkCsrf,saveArticle);
  const categoryPage=async (res,error='')=>res.render('categories',{title:'Categorias',error,...directoryData(await db.prepare('SELECT c.*,(SELECT COUNT(*) FROM articles a WHERE a.category=c.slug) AS total FROM editorial_categories c ORDER BY position,name').all(),res.req.query)});
  app.get('/admin/categorias',editor,async (req,res)=>(await categoryPage(res)));
  app.post('/admin/categorias',editor,checkCsrf,async (req,res)=>{
    const name=String(req.body.name||'').trim().slice(0,80),slug=slugify(name);
    if(!name||!slug||(await db.prepare('SELECT slug FROM editorial_categories WHERE slug=?').get(slug)))return res.status(400),(await categoryPage(res,'Informe um nome único para a categoria.'));
    (await db.prepare('INSERT INTO editorial_categories(slug,name,position,show_menu) VALUES(?,?,?,?)').run(slug,name,(await db.prepare('SELECT COALESCE(MAX(position),0)+1 AS n FROM editorial_categories').get()).n,req.body.show_menu==='on'?1:0));
    flash(req,'Categoria criada. Já pode ser usada nas matérias.');res.redirect('/admin/categorias');
  });
  app.post('/admin/categorias/:slug',editor,checkCsrf,async (req,res)=>{
    const name=String(req.body.name||'').trim().slice(0,80),position=Number.parseInt(req.body.position);
    if(!name||!Number.isInteger(position)||position<0||position>999||!(await db.prepare('SELECT slug FROM editorial_categories WHERE slug=?').get(req.params.slug)))return res.status(400),(await categoryPage(res,'Confira nome e ordem (0 a 999).'));
    (await db.prepare('UPDATE editorial_categories SET name=?,position=?,show_menu=? WHERE slug=?').run(name,position,req.body.show_menu==='on'?1:0,req.params.slug));
    flash(req,'Categoria atualizada. O endereço público foi preservado.');res.redirect('/admin/categorias');
  });
  app.get('/admin/configuracoes',editor,(req,res)=>res.render('settings',{title:'Configurações',error:''}));
  app.post('/admin/configuracoes',editor,checkCsrf,async (req,res)=>{
    const instagram=safeUrl(req.body.instagram);const email=String(req.body.email||'').trim();
    if(!String(req.body.name||'').trim()||(req.body.instagram&&(!instagram||!['instagram.com','www.instagram.com'].includes(new URL(instagram).hostname)))||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return res.status(400).render('settings',{title:'Configurações',error:'Informe o nome do portal, um e-mail válido e um endereço completo do Instagram (https://www.instagram.com/seuperfil/).',settings:{...res.locals.settings,...Object.fromEntries(Object.entries(req.body).filter(([k])=>['name','tagline','email','phone','about','editorial','staff','instagram'].includes(k)))}});
    const update=db.prepare('UPDATE settings SET value=? WHERE key=?');
    for(const key of ['name','tagline','email','phone','about','editorial','staff'])(await update.run(String(req.body[key]||'').trim().slice(0,['about','editorial','staff'].includes(key)?6000:200),key));
    (await update.run(instagram,'instagram'));flash(req,'Configurações atualizadas.');res.redirect('/admin/configuracoes');
  });
  app.get('/admin/equipe',editor,async (req,res)=>res.render('team',{title:'Equipe',members:(await db.prepare('SELECT id,name,email,role,active FROM users ORDER BY id').all()),error:''}));
  app.post('/admin/equipe',editor,checkCsrf,async (req,res)=>{
    const {name,email,password,role}=req.body;
    const error= !String(name||'').trim()||!/^\S+@\S+\.\S+$/.test(email||'')||String(password||'').length<12||String(password||'').length>200||!['author','editor'].includes(role)?'Informe nome, e-mail, perfil e uma senha de 12 a 200 caracteres.':(await db.prepare('SELECT id FROM users WHERE email=?').get(email))?'Este e-mail já está cadastrado.':'';
    if(error)return res.status(400).render('team',{title:'Equipe',members:(await db.prepare('SELECT id,name,email,role,active FROM users').all()),error});
    (await db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name.trim().slice(0,100),email.trim().toLowerCase(),hashPassword(password),role));flash(req,'Pessoa cadastrada.');res.redirect('/admin/equipe');
  });
  app.post('/admin/equipe/:id/alternar',editor,checkCsrf,async (req,res)=>{
    if(Number(req.params.id)===res.locals.user.id){flash(req,'Você não pode desativar sua própria conta.');return res.redirect('/admin/equipe');}
    (await db.prepare('UPDATE users SET active=1-active WHERE id=?').run(Number(req.params.id)));flash(req,'Acesso atualizado.');res.redirect('/admin/equipe');
  });
  app.use((req,res)=>res.status(404).render('error',{title:'Página não encontrada',message:'Esse endereço não está disponível. Continue explorando as histórias do Giro63.'}));
  app.use((err,req,res,next)=>{console.error(err.message);if(res.headersSent)return next(err);res.status(err.status===413?413:500).render('error',{title:'Não foi possível concluir',message:err.status===413?'O conteúdo excedeu o tamanho permitido. Reduza o texto ou a imagem e tente novamente.':'Ocorreu um erro. Tente novamente; se persistir, consulte o terminal local.'});});
  return app;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=(await createApp());const port=Number(process.env.PORT)||3000;
  const server=app.listen(port,'127.0.0.1',()=>console.log(`Giro63 em http://localhost:${port}\nPainel: http://localhost:${port}/admin`));
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`A porta ${port} já está em uso. Defina PORT com outra porta.`:error.message);process.exitCode=1;});
}
