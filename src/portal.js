import { randomBytes } from 'node:crypto';
import { dayInSaoPaulo } from './reader-experience.js';
import { slugify } from './db.js';

export const portalDefaults={public_url:'',indexing:'0',legal_owner:'',privacy_email:'',privacy_reviewed:'0',terms_reviewed:'0',privacy_updated:'',terms_updated:'',
  privacy_text:`Quem responde pelo portal
Responsável: [preencher nas configurações]. Contato de privacidade: [preencher nas configurações]. Esta página é uma base em revisão.

Dados e finalidades
O Giro63 utiliza uma sessão para autenticação, proteção de formulários e funcionamento do portal. Contas da redação contêm nome, e-mail, perfil e senha protegida. A sessão expira após oito horas. O portal mantém registros editoriais e de campanhas no banco local.

Estatísticas opcionais
Somente após aceitar estatísticas, registramos visualizações públicas agregadas por página e dia, no horário de São Paulo. Não guardamos IP, identidade, termos pesquisados ou parâmetros completos de URL nesses indicadores. Não medimos visitantes únicos. Os totais são mantidos por 12 meses. Um identificador aleatório por carregamento expira em cinco minutos e evita duplicidades. A preferência de cookies vale por seis meses e pode ser alterada no rodapé; recusar interrompe novas medições, sem apagar totais já agregados.

Ranking e publicidade
As estatísticas opcionais são distintas dos contadores locais existentes: Mais lidas conta acessos por matéria, com intervalo de 30 minutos por sessão, e exibe a janela de sete dias. A publicidade utiliza identificadores temporários para medir exibições e cliques, sem IP nesses registros. Esses mecanismos não enviam dados a uma ferramenta externa de Analytics. A sessão pode conter o controle temporário de leituras; totais diários de matérias e campanhas ficam no SQLite e nos backups. Uma política de retenção desses históricos e backups deve ser definida pelo responsável antes da publicação.

Compartilhamento e serviços
As fontes e imagens do portal são servidas localmente. Ao abrir WhatsApp, redes sociais ou endereços dos anunciantes, você acessa serviços sujeitos às próprias políticas. O portal não instala Google Analytics nesta versão. A hospedagem futura e seus registros técnicos devem ser descritos antes do lançamento.

Seus direitos e contato
Solicitações de acesso, correção e eliminação de dados pessoais podem ser encaminhadas ao contato de privacidade informado nesta página. O responsável deverá avaliar a solicitação e as obrigações de conservação aplicáveis. As finalidades, bases legais, prazos dos registros editoriais e fornecedores de hospedagem precisam de revisão antes da publicação.`,
  terms_text:`Sobre o Giro63
Portal de notícias do Tocantins. Responsável e canal de contato constam nesta página e na Política de Privacidade. Esta versão é uma base em revisão.

Conteúdo editorial
Matérias são identificadas por autoria, data e fontes quando disponíveis. Conteúdo demonstrativo é sinalizado e não constitui notícia apurada. Solicitações de correção e direito de resposta devem ser encaminhadas ao contato da redação; a equipe avaliará cada solicitação conforme a Política Editorial.

Uso e direitos autorais
Textos, marcas e imagens estão sujeitos aos direitos de seus titulares e às licenças indicadas. Compartilhe o endereço original da matéria. Reprodução de conteúdo deve observar autorização, atribuição, licenças e os limites legais aplicáveis; uma licença de uma imagem não se estende automaticamente a todo o portal.

Publicidade e links
Anúncios são identificados como Publicidade. A contratação de produtos e serviços anunciados ocorre com seus fornecedores. Links externos levam a páginas com regras e políticas próprias. Conteúdo comercial deve permanecer distinguível da cobertura editorial.

Uso responsável e disponibilidade
Não utilize o portal para atividades ilícitas, tentativas de acesso indevido ou interrupção do serviço. O portal pode passar por manutenção e correções. Estes termos não afastam direitos previstos na legislação aplicável.

Privacidade e atualizações
O tratamento de dados é descrito na Política de Privacidade. Alterações destes termos deverão ter data e versão atualizadas. Dados do responsável, canais de atendimento e revisão jurídica/editorial devem ser concluídos antes do lançamento.`};

export function legalReady(settings,key){return settings[key+'_reviewed']==='1'&&!!settings.legal_owner.trim()&&/^\S+@\S+\.\S+$/.test(settings.privacy_email)&&settings[key+'_text'].trim().length>=100;}
export function originFor(settings){return settings.public_url||`http://localhost:${process.env.PORT||3000}`;}
export function validPublicUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:'';}catch{return '';}}
const xml=value=>String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const cookie=req=>String(req.headers.cookie||'').split(';').map(v=>v.trim()).includes('giro63.statistics=accepted');
const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;

export function mountPortal(app,{db,requireUser,editor,checkCsrf,flash}){
  const insert=db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');for(const [k,v] of Object.entries(portalDefaults))insert.run(k,v);
  db.exec('CREATE TABLE IF NOT EXISTS audience_daily(day TEXT NOT NULL,path TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,path))');
  const tokens=new Map();let lastCleanup='';
  const cleanup=(now=Date.now())=>{
    for(const [key,token] of tokens)if(token.expires<=now)tokens.delete(key);
    const today=dayInSaoPaulo(now);if(today!==lastCleanup){const limit=new Date(today+'T12:00:00Z');limit.setUTCFullYear(limit.getUTCFullYear()-1);db.prepare('DELETE FROM audience_daily WHERE day<?').run(limit.toISOString().slice(0,10));lastCleanup=today;}
  };
  cleanup();
  app.use((req,res,next)=>{
    const render=res.render.bind(res);
    res.render=(view,data={},callback)=>{
      const values={...res.locals,...data},s=values.settings,base=originFor(s),fieldErrors={...(data.fieldErrors||{})};
      if(values.error){
        const add=name=>{fieldErrors[name]=values.error;};
        if(view==='edit'){
          const a=values.article;
          if(!a.title)add('title');if(!a.summary)add('summary');if(!a.body.replace(/<[^>]*>/g,'').trim())add('body-editor');if(!values.categories.some(c=>c[0]===a.category))add('category');
          if(/imagem|arquivo|8 MB|megapixel/i.test(values.error))add('image');if(/crédito/i.test(values.error)&&!a.credit)add('credit');if(/fontes/i.test(values.error)&&!a.sources)add('sources');
        }
        if(view==='login'){add('email');add('password');}
        if(view==='ad-edit'){const a=values.item;if(!a.name)add('name');if(!a.alt)add('alt');if(!['top','middle','sidebar'].includes(a.position))add('position');if(/endereço|HTTP/i.test(values.error))add('link');if(/término|início|data/i.test(values.error)){add('starts_at');add('ends_at');}if(/imagem|arquivo|MB|megapixel/i.test(values.error))add('image');}
        if(view==='settings'){if(!String(req.body.name||'').trim())add('name');if(req.body.email&&!/^\S+@\S+\.\S+$/.test(req.body.email))add('email');if(req.body.instagram)add('instagram');}
        if(view==='team'){for(const name of ['name','email','password','role'])add(name);}
        if(view==='categories')add('name');
      }
      let title=values.title,description=values.description,canonical=req.path;
      if(view==='home'){title='Notícias do Tocantins';description='Acompanhe notícias, cidades, política, economia e cultura do Tocantins no Giro63.';}
      if(view==='listing'){description=`${values.heading}: acompanhe as notícias, reportagens e informações do Giro63 sobre o Tocantins.`;if(values.page>1){title+=` — Página ${values.page}`;description+=` Página ${values.page}.`;canonical+='?page='+values.page;}}
      if(view==='institutional')description={sobre:'Conheça o Giro63, portal dedicado às notícias e histórias do Tocantins.',expediente:'Conheça os responsáveis e o expediente editorial do Giro63.',contato:'Fale com a redação do Giro63: sugestões de pauta, correções e atendimento.',anuncie:'Conheça os espaços de publicidade do Giro63 e fale com a equipe comercial.','politica-editorial':'Conheça os compromissos de apuração, transparência e correção do Giro63.'}[req.params.slug]||description;
      if(view==='legal')description=values.legalKey==='privacy'?'Como o Giro63 utiliza dados, cookies, estatísticas e canais de privacidade.':'Regras de uso, direitos autorais, publicidade e conteúdo editorial do Giro63.';
      const noindex=s.indexing!=='1'||!s.public_url||req.path.startsWith('/admin')||req.path==='/busca'||res.statusCode>=400||!!values.article?.demo||(view==='legal'&&!legalReady(s,values.legalKey));
      if(noindex)res.set('X-Robots-Tag','noindex, nofollow');
      const image=values.article?.cover&&values.editorialImage?values.editorialImage(values.article.cover).src:'/images/og-giro63.png';
      const metadata={url:base+canonical,image:base+image,type:view==='article'?'article':'website'};
      let token='';const measurable=req.method==='GET'&&!values.user&&res.statusCode===200&&['home','listing','article','institutional','legal'].includes(view)&&req.path!=='/busca';
      if(measurable){cleanup();if(tokens.size>=10000)tokens.delete(tokens.keys().next().value);token=randomBytes(24).toString('hex');tokens.set(token,{path:req.path,expires:Date.now()+300000});res.set('Cache-Control','private, no-store');}
      return render(view,{...data,title,description,metadata,noindex,audienceToken:token,fieldErrors},callback);
    };
    res.locals.audienceToken='';res.locals.noindex=true;next();
  });
  app.get('/robots.txt',(req,res)=>{const s=res.locals.settings;res.type('text/plain').send(s.indexing==='1'&&s.public_url?`User-agent: *\nDisallow: /admin\nDisallow: /busca\nSitemap: ${s.public_url}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n');});
  app.get('/sitemap.xml',(req,res)=>{
    const s=res.locals.settings;if(!s.public_url)return res.status(503).set('Retry-After','3600').type('text/plain').send('Configure a URL pública antes de gerar o sitemap.');
    if(s.indexing!=='1')return res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    const entries=['/','/ultimas',...['sobre','expediente','politica-editorial','contato','anuncie'].map(p=>'/pagina/'+p)];
    if(legalReady(s,'privacy'))entries.push('/pagina/privacidade');if(legalReady(s,'terms'))entries.push('/pagina/termos-de-uso');
    const articles=db.prepare("SELECT slug,category,city FROM articles WHERE status='published' AND demo=0 ORDER BY published_at DESC").all();
    for(const a of articles){entries.push('/noticia/'+a.slug,'/editoria/'+a.category);if(a.city.trim())entries.push('/cidade/'+slugify(a.city));}
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...new Set(entries)].map(p=>'<url><loc>'+xml(s.public_url+p)+'</loc></url>').join('')+'</urlset>');
  });
  for(const [slug,key,title] of [['privacidade','privacy','Política de privacidade'],['termos-de-uso','terms','Termos de uso']])app.get('/pagina/'+slug,(req,res)=>res.render('legal',{title,legalKey:key,ready:legalReady(res.locals.settings,key)}));
  app.post('/preferencias-cookies',checkCsrf,(req,res)=>{
    if(!['accepted','rejected'].includes(req.body.choice))return res.sendStatus(400);
    const expires=new Date();expires.setMonth(expires.getMonth()+6);
    res.cookie('giro63.statistics',req.body.choice,{expires,sameSite:'lax',httpOnly:true,secure:req.secure,path:'/'});res.set('Cache-Control','no-store').sendStatus(204);
  });
  app.get('/preferencias-cookies',(req,res)=>res.set('Cache-Control','no-store').json({choice:cookie(req)?'accepted':String(req.headers.cookie||'').split(';').some(v=>v.trim()==='giro63.statistics=rejected')?'rejected':null}));
  app.post('/audiencia/visualizacao',checkCsrf,(req,res)=>{
    cleanup();res.set('Cache-Control','no-store');const token=tokens.get(String(req.body.token||''));
    if(res.locals.user||!cookie(req)||!token)return res.sendStatus(403);
    tokens.delete(req.body.token);db.prepare('INSERT INTO audience_daily(day,path,views) VALUES(?,?,1) ON CONFLICT(day,path) DO UPDATE SET views=views+1').run(dayInSaoPaulo(),token.path);res.sendStatus(204);
  });
  app.get('/admin/audiencia',requireUser,editor,(req,res)=>{
    cleanup();const today=dayInSaoPaulo(),defaultFrom=new Date(Date.parse(today+'T12:00:00Z')-29*86400000).toISOString().slice(0,10);
    let from=String(req.query.from||defaultFrom),to=String(req.query.to||today),error='';
    if(!validDay(from)||!validDay(to)||from>to||Date.parse(to)-Date.parse(from)>365*86400000){error='Escolha datas válidas e um período de até 366 dias.';from=defaultFrom;to=today;res.status(400);}
    const rows=db.prepare('SELECT day,SUM(views) views FROM audience_daily WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day').all(from,to);
    const pages=db.prepare('SELECT path,SUM(views) views FROM audience_daily WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY views DESC,path LIMIT 100').all(from,to);
    const days=[];for(let date=Date.parse(from+'T12:00:00Z');date<=Date.parse(to+'T12:00:00Z');date+=86400000){const day=new Date(date).toISOString().slice(0,10);days.push(rows.find(r=>r.day===day)||{day,views:0});}
    res.render('audience',{title:'Audiência',from,to,error,days,pages,total:rows.reduce((sum,r)=>sum+r.views,0)});
  });
  app.get('/admin/portal',requireUser,editor,(req,res)=>res.render('portal-settings',{title:'Busca e privacidade',error:'',fieldErrors:{}}));
  app.post('/admin/portal',requireUser,editor,checkCsrf,(req,res)=>{
    const old=res.locals.settings,settings={...old};for(const k of ['public_url','legal_owner','privacy_email','privacy_text','terms_text'])settings[k]=String(req.body[k]||'').trim().slice(0,k.endsWith('_text')?20000:250);
    settings.indexing=req.body.indexing==='on'?'1':'0';settings.privacy_reviewed=req.body.privacy_reviewed==='on'?'1':'0';settings.terms_reviewed=req.body.terms_reviewed==='on'?'1':'0';const fieldErrors={};
    if(settings.public_url&&!validPublicUrl(settings.public_url))fieldErrors.public_url='Use a origem completa, como https://seu-dominio.com.br, sem caminhos ou credenciais.';
    else if(settings.public_url)settings.public_url=validPublicUrl(settings.public_url);
    if(settings.indexing==='1'&&!settings.public_url)fieldErrors.public_url='Configure a URL pública para permitir indexação.';
    if(settings.privacy_email&&!/^\S+@\S+\.\S+$/.test(settings.privacy_email))fieldErrors.privacy_email='Informe um e-mail válido.';
    for(const key of ['privacy','terms'])if(settings[key+'_reviewed']==='1'&&!legalReady(settings,key)){fieldErrors[key+'_reviewed']='Preencha responsável, contato de privacidade e texto com pelo menos 100 caracteres antes de marcar como revisado.';}
    if(Object.keys(fieldErrors).length)return res.status(400).render('portal-settings',{title:'Revise as configurações',settings,error:'Revise os campos indicados. Nenhuma alteração foi salva.',fieldErrors});
    const update=db.prepare('UPDATE settings SET value=? WHERE key=?');db.exec('BEGIN');try{for(const k of Object.keys(portalDefaults)){if(k.endsWith('_updated'))continue;update.run(settings[k],k);}for(const key of ['privacy','terms'])if(settings[key+'_text']!==old[key+'_text']||settings[key+'_reviewed']!==old[key+'_reviewed']||settings.legal_owner!==old.legal_owner||settings.privacy_email!==old.privacy_email)update.run(new Date().toISOString(),key+'_updated');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    flash(req,'Busca e privacidade atualizadas.');res.redirect('/admin/portal');
  });
}
