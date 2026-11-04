import { randomBytes } from 'node:crypto';
import { safeUrl } from './security.js';
import { transaction } from './postgres.js';

export const positions={top:'Após os destaques da inicial',middle:'Entre seções e listagens',sidebar:'Lateral das matérias'};
export const campaignStates={running:'Em veiculação',scheduled:'Agendada',paused:'Pausada',ended:'Encerrada',archived:'Arquivada'};
const zone='America/Sao_Paulo';
function parts(date){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date)).map(p=>[p.type,p.value]));}
export function localDateTime(date){if(!date)return '';const p=parts(date);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
export function localDay(date=Date.now()){return localDateTime(date).slice(0,10);}
export function parseLocalDateTime(value){
  if(!value)return null;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Informe uma data e hora válidas.');
  const target=Date.parse(value+'Z');if(!Number.isFinite(target))throw Error('Data inválida.');
  let guess=target;
  for(let i=0;i<3;i++)guess+=target-Date.parse(localDateTime(guess)+'Z');
  if(localDateTime(guess)!==value)throw Error('Data ou horário inválido em São Paulo.');
  return new Date(guess).toISOString();
}
export function campaignState(ad,now=Date.now()){
  if(ad.archived)return 'archived';
  if(ad.ends_at&&Date.parse(ad.ends_at)<=now)return 'ended';
  if(!ad.active)return 'paused';
  if(ad.starts_at&&Date.parse(ad.starts_at)>now)return 'scheduled';
  return 'running';
}
export async function selectAd(db,position,now=Date.now()){
  if(!positions[position])return null;
  return transaction(db,async()=>{
    if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').get('giro63-ad-'+position);
    const eligible=(await db.prepare('SELECT * FROM ads WHERE position=? AND active=1 AND archived=0 ORDER BY id').all(position)).filter(ad=>campaignState(ad,now)==='running');
    if(!eligible.length)return null;
    const last=(await db.prepare('SELECT last_id FROM ad_rotation WHERE position=?').get(position))?.last_id||0;
    const ad=eligible.find(ad=>ad.id>last)||eligible[0];
    (await db.prepare('INSERT INTO ad_rotation(position,last_id) VALUES(?,?) ON CONFLICT(position) DO UPDATE SET last_id=excluded.last_id').run(position,ad.id));
    const token=randomBytes(32).toString('hex');
    (await db.prepare('DELETE FROM ad_deliveries WHERE expires_at<=?').run(now));
    (await db.prepare('INSERT INTO ad_deliveries(token,ad_id,expires_at) VALUES(?,?,?)').run(token,ad.id,now+3600000));
    return {...ad,deliveryToken:token};
  });
}
export async function recordAdEvent(db,token,kind,now=Date.now()){
  if(!['impression','click'].includes(kind)||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
  return transaction(db,async()=>{
    if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').get('giro63-delivery-'+token);
    const delivery=(await db.prepare('SELECT d.*,a.link FROM ad_deliveries d JOIN ads a ON a.id=d.ad_id WHERE token=? AND expires_at>?').get(token,now));
    if(!delivery||(kind==='click'&&!safeUrl(delivery.link)))return null;
    const flag=kind==='impression'?'viewed':'clicked',metric=kind==='impression'?'impressions':'clicks';
    if(!delivery[flag]){
      (await db.prepare(`UPDATE ad_deliveries SET ${flag}=1 WHERE token=?`).run(token));
      (await db.prepare(`INSERT INTO ad_daily(ad_id,day,${metric}) VALUES(?,?,1) ON CONFLICT(ad_id,day) DO UPDATE SET ${metric}=${metric}+1`).run(delivery.ad_id,localDay(now)));
    }
    return delivery;
  });
}
function rangeFrom(query){
  const to=String(query.to||localDay()),from=String(query.from||localDay(Date.now()-29*86400000));
  const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  if(!valid(from)||!valid(to)||from>to||Date.parse(to)-Date.parse(from)>365*86400000)throw Error('Escolha um período válido de até 366 dias.');
  return {from,to};
}
export function mountAdvertising(app,{db,editor,checkCsrf,upload,saveImage,flash}){
  app.use((req,res,next)=>{
    res.locals.adPositions=positions;res.locals.campaignState=campaignState;res.locals.campaignStates=campaignStates;res.locals.localDateTime=localDateTime;
    const chosen=new Map();res.locals.pickAd=position=>chosen.get(position)||null;
    const render=res.render.bind(res);
    res.render=(view,data={},callback)=>{
      const slots=view==='home'?['top','middle']:view==='article'&&!data.preview?['sidebar']:view==='listing'?['middle']:[];
      const prepare=async()=>{if(req.method==='GET'&&!req.path.startsWith('/admin'))for(const position of slots)if(!chosen.has(position))chosen.set(position,await selectAd(db,position));return render(view,data,callback);};
      return prepare().catch(next);
    };
    next();
  });
  app.post('/publicidade/exibicao',async (req,res)=>{
    if(req.get('origin')&&req.get('origin')!==`${req.protocol}://${req.get('host')}`)return res.sendStatus(403);
    res.set('Cache-Control','no-store');return res.sendStatus((await recordAdEvent(db,req.body.token,'impression'))?204:400);
  });
  app.get('/publicidade/clique/:token',async (req,res)=>{res.set('Cache-Control','no-store');const delivery=req.method==='GET'?(await recordAdEvent(db,req.params.token,'click')):null;if(!delivery)return res.status(410).render('error',{title:'Link expirado',message:'Atualize a página do portal para abrir este anúncio.'});res.redirect(302,safeUrl(delivery.link));});
  const find=async (req,res)=>{const item=(await db.prepare('SELECT * FROM ads WHERE id=?').get(Number(req.params.id)));if(!item)res.status(404).render('error',{title:'Campanha não encontrada',message:'Volte à lista de publicidade.'});return item;};
  const blank=()=>({id:null,name:'',advertiser:'',image:'',alt:'',link:'',position:'top',active:0,archived:0,starts_at:null,ends_at:null});
  const form=(res,item,error='')=>res.render('ad-edit',{title:item.id?'Editar campanha':'Nova campanha',item,error});
  app.get('/admin/publicidade',editor,async (req,res)=>{
    const all=(await db.prepare('SELECT * FROM ads ORDER BY id DESC').all()),q=String(req.query.q||'').trim().slice(0,100),status=String(req.query.status||''),position=String(req.query.position||'');
    const items=all.filter(a=>(!q||(a.name+' '+a.advertiser).toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR')))&&(!status||campaignState(a)===status)&&(!position||a.position===position));
    const counts=Object.fromEntries(Object.keys(campaignStates).map(state=>[state,all.filter(a=>campaignState(a)===state).length]));
    const metrics=(await db.prepare('SELECT COALESCE(SUM(impressions),0) AS impressions,COALESCE(SUM(clicks),0) AS clicks FROM ad_daily').get());
    res.render('ads',{title:'Publicidade',items,counts,metrics,q,status,position});
  });
  app.get('/admin/publicidade/nova',editor,(req,res)=>form(res,blank()));
  app.get('/admin/publicidade/:id/resultados',editor,async (req,res)=>{
    const item=(await find(req,res));if(!item)return;
    let range,error='';try{range=rangeFrom(req.query);}catch(e){error=e.message;range=rangeFrom({});res.status(400);}
    const rows=(await db.prepare('SELECT * FROM ad_daily WHERE ad_id=? AND day BETWEEN ? AND ? ORDER BY day').all(item.id,range.from,range.to));
    const totals=rows.reduce((acc,r)=>({impressions:acc.impressions+r.impressions,clicks:acc.clicks+r.clicks}),{impressions:0,clicks:0});
    const days=[];for(let d=Date.parse(range.from+'T12:00:00Z');d<=Date.parse(range.to+'T12:00:00Z');d+=86400000){const day=new Date(d).toISOString().slice(0,10);days.push(rows.find(r=>r.day===day)||{day,impressions:0,clicks:0});}
    res.render('ad-results',{title:'Resultados da campanha',item,range,error,totals,days});
  });
  app.get('/admin/publicidade/:id/preview',editor,async (req,res)=>{const item=(await find(req,res));if(item)res.render('ad-preview',{title:'Prévia da campanha',item});});
  app.get('/admin/publicidade/:id',editor,async (req,res)=>{const item=(await find(req,res));if(item)form(res,item);});
  const campaignUpload=(req,res,next)=>upload(req,res,async error=>{if(!error)return next();const old=req.params.id?(await db.prepare('SELECT * FROM ads WHERE id=?').get(Number(req.params.id))):null;res.status(400);form(res,{...blank(),...old,...Object.fromEntries(Object.entries(req.body||{}).filter(([k])=>['name','advertiser','alt','link','position'].includes(k)))},'Envie apenas uma imagem de até 8 MB. Selecione o arquivo novamente.');});
  async function save(req,res,next){
    const old=req.params.id?(await find(req,res)):null;if(req.params.id&&!old)return;
    const item={...blank(),...old,name:String(req.body.name||'').trim().slice(0,150),advertiser:String(req.body.advertiser||'').trim().slice(0,150),alt:String(req.body.alt||'').trim().slice(0,250),link:safeUrl(req.body.link),position:String(req.body.position||''),active:old?(req.body.active==='on'?1:0):0};
    let newImage=null;
    try{
      item.starts_at=parseLocalDateTime(String(req.body.starts_at||''));item.ends_at=parseLocalDateTime(String(req.body.ends_at||''));
      if(!item.name||!item.alt||!positions[item.position]||(req.body.link&&!item.link))throw Error('Preencha nome, descrição acessível e espaço; use um endereço HTTP ou HTTPS válido.');
      if(item.starts_at&&item.ends_at&&item.ends_at<=item.starts_at)throw Error('O término deve ser posterior ao início.');
      if(!old&&!req.file)throw Error('Selecione uma imagem para a campanha.');
      if(old?.archived)item.active=0;
      newImage=await saveImage(req.file);if(newImage)item.image=newImage;
      const values=[item.name,item.advertiser,item.image,item.alt,item.link,item.position,item.active,item.starts_at,item.ends_at];
      if(old)(await db.prepare('UPDATE ads SET name=?,advertiser=?,image=?,alt=?,link=?,position=?,active=?,starts_at=?,ends_at=? WHERE id=?').run(...values,old.id));
      else item.id=Number((await db.prepare('INSERT INTO ads(name,advertiser,image,alt,link,position,active,starts_at,ends_at) VALUES(?,?,?,?,?,?,?,?,?)').run(...values)).lastInsertRowid);
      flash(req,old?'Campanha atualizada.':'Campanha cadastrada e pausada. Confira a prévia e ative quando estiver pronta.');res.redirect('/admin/publicidade/'+item.id);
    }catch(error){res.status(400);if(/JPG|Input|format|pixels|unsupported|corrupt|image/i.test(error.message))error=new Error('Imagem inválida. Envie JPG, PNG ou WebP estático, até 8 MB e 25 megapixels.');
      if(newImage)item.image=old?.image||'';
      form(res,{...item,starts_input:String(req.body.starts_at||''),ends_input:String(req.body.ends_at||'')},error.message+' Se enviou um arquivo, selecione-o novamente antes de salvar.');}
  }
  app.post('/admin/publicidade',editor,campaignUpload,checkCsrf,save);
  app.post('/admin/publicidade/:id',editor,campaignUpload,checkCsrf,save);
  app.post('/admin/publicidade/:id/alternar',editor,checkCsrf,async (req,res)=>{const item=(await find(req,res));if(!item)return;if(item.archived){flash(req,'Restaure a campanha antes de ativá-la.');return res.redirect('/admin/publicidade');}(await db.prepare('UPDATE ads SET active=1-active WHERE id=?').run(item.id));flash(req,item.active?'Campanha pausada.':'Campanha ativada. O período programado será respeitado.');res.redirect('/admin/publicidade');});
  app.post('/admin/publicidade/:id/arquivar',editor,checkCsrf,async (req,res)=>{const item=(await find(req,res));if(!item)return;(await db.prepare('UPDATE ads SET archived=1-archived,active=0 WHERE id=?').run(item.id));flash(req,item.archived?'Campanha restaurada e pausada.':'Campanha arquivada. Os resultados foram preservados.');res.redirect('/admin/publicidade');});
}
