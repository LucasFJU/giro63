import { mountPortal } from './portal.js';
import { openPostgres, transaction } from './postgres.js';
import { cloudMedia } from './cloud-media.js';
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
export async function createApp({dataDir=process.env.GIRO63_DATA_DIR||path.join(root,'data'),uploadDir=path.join(root,'public','uploads'),seed=true,database=null}={}) {
  const cloud=!!process.env.DATABASE_URL;
  const uploadLimitMb=cloud?4:8;
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:uploadLimitMb*1024*1024,files:1,fields:25,fieldSize:250000}}).single('image');
  if(process.env.VERCEL&&!cloud)throw Error('DATABASE_URL obrigatória na Vercel.');
  if(!cloud)mkdirSync(uploadDir,{recursive:true});
  const db=database||(cloud?openPostgres(process.env.DATABASE_URL):openDatabase(dataDir)); if(seed&&!cloud)seedDemo(db);
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
    res.locals.metadata=null;res.locals.ads=[];
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
    const pageLink=n=>{const params=new URLSearchParams();if(q)params.set('q',q);if(req.path==='/busca'){if(categoryFilter)params.set('editoria',categoryFilter);if(cityFilter)params.set('cidade',cityFilter);}params.set('page',String(n));return req.path+'?'+params.toString();};
    res.render('listing',{title:heading,heading,intro,articles,page,pages:Math.ceil(total/pageSize),total,q,categoryFilter,cityFilter,pageLink,base:req.path});
  }
  app.get('/ultimas',async (req,res)=>(await listing(req,res,{heading:'Últimas notícias',intro:'Acompanhe o Tocantins, uma história de cada vez.'})));
  app.get('/editoria/:slug',async (req,res,next)=>{const cat=res.locals.categories.find(c=>c[0]===req.params.slug);if(!cat)return next();(await listing(req,res,{heading:cat[1],where:'category=?',params:[cat[0]],intro:'Contexto e informação sobre o que faz parte da sua vida.'}));});
  app.get('/cidade/:slug',async (req,res,next)=>{const city=res.locals.cities.find(c=>slugify(c)===req.params.slug);if(!city)return next();(await listing(req,res,{heading:city,where:'normalize_search(city)=normalize_search(?)',params:[city],intro:'As histórias que aproximam a sua cidade.'}));});
  app.get('/busca',async (req,res)=>{
    const q=String(req.query.q||'').trim().slice(0,100),category=String(req.query.editoria||'').slice(0,100),city=String(req.query.cidade||'').slice(0,150),conditions=[],params=[];
    if(q){const escaped=q.replace(/[!%_]/g,'!$&');conditions.push("(normalize_search(title) LIKE normalize_search(?) ESCAPE '!' OR normalize_search(summary) LIKE normalize_search(?) ESCAPE '!' OR normalize_search(city) LIKE normalize_search(?) ESCAPE '!')");params.push(...Array(3).fill('%'+escaped+'%'));}
    if(category){conditions.push('category=?');params.push(category);}
    if(city){const place=res.locals.cities.find(c=>slugify(c)===city);if(place){conditions.push('normalize_search(city)=normalize_search(?)');params.push(place);}else conditions.push('0=1');}
    (await listing(req,res,{heading:q?'Resultados para “'+q+'”':'Buscar no Giro63',where:conditions.length?conditions.join(' AND '):'0=1',params,intro:'Encontre notícias por assunto, editoria ou cidade.'}));
  });
  app.get('/noticia/:slug',async (req,res,next)=>{
    const article=(await db.prepare("SELECT a.*,u.name AS author_name FROM articles a LEFT JOIN users u ON u.id=a.author_id WHERE a.slug=? AND a.status='published'").get(req.params.slug));if(!article)return next();
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
    const user=res.locals.user;const articles=(await db.prepare(`SELECT a.*,u.name AS author_name FROM articles a LEFT JOIN users u ON u.id=a.author_id ${user.role==='author'?'WHERE author_id=?':''} ORDER BY updated_at DESC,id DESC`).all(...(user.role==='author'?[user.id]:[])));
    res.render('dashboard',{title:req.path==='/admin'?'Visão geral':'Matérias',articles});
  });
  const blankArticle=()=>({id:null,title:'',summary:'',body:'',category:'cidades',city:'',byline:'',cover:'',cover_alt:'',credit:'',sources:'',status:'draft',featured:0,urgent:0,demo:0,feedback:''});
  const findEditable=async (req,res)=>{
    const a=(await db.prepare('SELECT * FROM articles WHERE id=?').get(Number(req.params.id)));
    if(!a){res.status(404).render('error',{title:'Matéria não encontrada',message:'Confira o endereço e volte ao painel.'});return null;}
    if(res.locals.user.role!=='editor'&&(a.author_id!==res.locals.user.id||a.status==='published')){res.status(403).render('error',{title:'Acesso restrito',message:'Autores podem editar apenas suas próprias matérias ainda não publicadas.'});return null;}return a;
  };
  app.get('/admin/noticias/nova',(req,res)=>res.render('edit',{title:'Nova matéria',article:blankArticle(),error:''}));
  app.get('/admin/noticias/:id',async (req,res)=>{const article=(await findEditable(req,res));if(article)res.render('edit',{title:'Editar matéria',article,error:''});});
  app.get('/admin/noticias/:id/preview',async (req,res)=>{const article=(await findEditable(req,res));if(article)res.render('article',{title:`Prévia: ${article.title}`,article,related:[],preview:true});});
  async function saveImage(file) {
    if(cloud)return media.save(file);
    if(!file)return null;
    const meta=await sharp(file.buffer,{limitInputPixels:25e6}).metadata();
    if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw new Error('Use uma imagem JPG, PNG ou WebP estática.');
    const filename=randomBytes(20).toString('hex')+'.webp';
    await sharp(file.buffer,{limitInputPixels:25e6}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toFile(path.join(uploadDir,filename));
    return '/uploads/'+filename;
  }
  const articleUpload=(req,res,next)=>{upload(req,res,async err=>{if(!err)return next();const old=req.params.id?(await findEditable(req,res)):null;if(req.params.id&&!old)return;const fields=Object.fromEntries(Object.entries(req.body||{}).filter(([key])=>['title','summary','body','category','city','cover_alt','credit','sources','byline','feedback'].includes(key)));if(fields.body)fields.body=cleanBody(fields.body);res.status(400).render('edit',{title:'Revise a imagem',article:{...blankArticle(),...old,...fields},error:'Envie uma imagem de até 8 MB. Confira os campos e selecione o arquivo novamente.'});});};
  async function saveArticle(req,res,next) {
    const old=req.params.id?(await findEditable(req,res)):null;if(req.params.id&&!old)return;
    const isEditor=res.locals.user.role==='editor';
    const desired=req.body.action||'draft';
    const allowed=isEditor?['draft','review','published']:['draft','review'];
    if(!allowed.includes(desired))return res.status(403).render('error',{title:'Ação não permitida',message:'Apenas editores podem publicar matérias.'});
    const a={...blankArticle(),...old,title:String(req.body.title||'').trim().slice(0,180),summary:String(req.body.summary||'').trim().slice(0,500),body:cleanBody(req.body.body),category:String(req.body.category||''),city:String(req.body.city||'').trim().slice(0,100),cover_alt:String(req.body.cover_alt??old?.cover_alt??'').trim().slice(0,250),credit:String(req.body.credit||'').trim().slice(0,250),sources:String(req.body.sources||'').trim().slice(0,3000),byline:isEditor?String(req.body.byline||'').trim().slice(0,100):res.locals.user.name,demo:req.body.demo==='on'?1:0,status:desired,featured:isEditor?Math.max(0,Math.min(4,Number.parseInt(req.body.featured)||0)):(old?.featured||0),urgent:isEditor&&req.body.urgent==='on'?1:(isEditor?0:(old?.urgent||0)),feedback:isEditor?String(req.body.feedback||'').slice(0,2000):(old?.feedback||'')};
    if(!a.title||!a.summary||!a.body.replace(/<[^>]*>/g,'').trim()||!res.locals.categories.some(c=>c[0]===a.category))return res.status(400).render('edit',{title:'Revise a matéria',article:a,error:'Preencha título, resumo, conteúdo e uma editoria válida.'});
    try {
      if(req.file&&!a.credit)return res.status(400).render('edit',{title:'Crédito obrigatório',article:a,error:'Informe o crédito da imagem antes de enviar.'});
      const image=await saveImage(req.file);if(image)a.cover=image;
      if(!a.cover)a.cover='/images/cerrado.jpg';
      if(desired==='published'&&!a.demo&&(!a.sources||!a.credit))return res.status(400).render('edit',{title:'Revise a publicação',article:a,error:'Matérias reais precisam de fontes e crédito da imagem para publicação. Reenvie a imagem se ela ainda não estava salva.'});
      await media.generate(a.cover);
      const now=new Date().toISOString();
      let slug=old?.slug||slugify(a.title)||'materia';
      if(!old){let n=1;const base=slug;while((await db.prepare('SELECT id FROM articles WHERE slug=?').get(slug)))slug=base+'-'+(++n);}
      await transaction(db,async()=>{
        if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(6363)').get();
        if(a.featured>0&&desired==='published')(await db.prepare('UPDATE articles SET featured=0 WHERE featured=? AND id<>?').run(a.featured,old?.id||0));
        const values=[a.title,a.summary,a.body,a.category,a.city,a.byline,a.cover,a.cover_alt,a.credit,a.sources,a.status,a.featured,a.urgent,a.demo,a.feedback,now,desired==='published'?(old?.published_at||now):old?.published_at||null];
        if(old)(await db.prepare('UPDATE articles SET title=?,summary=?,body=?,category=?,city=?,byline=?,cover=?,cover_alt=?,credit=?,sources=?,status=?,featured=?,urgent=?,demo=?,feedback=?,updated_at=?,published_at=? WHERE id=?').run(...values,old.id));
        else (await db.prepare('INSERT INTO articles(title,summary,body,category,city,byline,cover,cover_alt,credit,sources,status,featured,urgent,demo,feedback,updated_at,published_at,slug,author_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...values,slug,res.locals.user.id,now));
      });
      const savedId=old?.id||(await db.prepare('SELECT id FROM articles WHERE slug=?').get(slug)).id;
      flash(req,desired==='published'?'Matéria publicada no portal.':desired==='review'?'Matéria enviada para revisão.':'Rascunho salvo.');res.redirect(desired==='draft'?'/admin/noticias/'+savedId:'/admin/materias');
    }catch(e){if(/image|Input|format|JPG|pixels|unsupported|corrupt/i.test(e.message))return res.status(400).render('edit',{title:'Verifique a imagem',article:a,error:'Imagem inválida. Use JPG, PNG ou WebP estático de até 8 MB e 25 megapixels.'});next(e);}
  }
  app.post('/admin/noticias',articleUpload,checkCsrf,saveArticle);
  app.post('/admin/noticias/:id',articleUpload,checkCsrf,saveArticle);
  const categoryPage=async (res,error='')=>res.render('categories',{title:'Categorias',error,items:(await db.prepare('SELECT c.*,(SELECT COUNT(*) FROM articles a WHERE a.category=c.slug) AS total FROM editorial_categories c ORDER BY position,name').all())});
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
