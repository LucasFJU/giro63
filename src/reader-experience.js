import { cities, slugify } from './db.js';

export function dayInSaoPaulo(now=Date.now()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function popularArticles(db,now=Date.now()){
  const today=dayInSaoPaulo(now),start=new Date(Date.parse(today+'T12:00:00Z')-6*86400000).toISOString().slice(0,10);
  return db.prepare("SELECT a.*,SUM(r.views) AS reads FROM articles a JOIN article_daily_reads r ON a.id=r.article_id WHERE a.status='published' AND r.day BETWEEN ? AND ? GROUP BY a.id HAVING SUM(r.views)>0 ORDER BY reads DESC,a.published_at DESC,a.id DESC LIMIT 5").all(start,today);
}
export function recordArticleRead(db,{method,session,user,article},now=Date.now()){
  if(method!=='GET'||user||article.status!=='published')return false;
  const recent=Object.fromEntries(Object.entries(session.articleReadAt||{}).filter(([,time])=>Number.isFinite(time)&&now-time<1800000));
  const key=String(article.id);
  if(Object.hasOwn(recent,key)){session.articleReadAt=recent;return false;}
  db.prepare('INSERT INTO article_daily_reads(article_id,day,views) VALUES(?,?,1) ON CONFLICT(article_id,day) DO UPDATE SET views=views+1').run(article.id,dayInSaoPaulo(now));
  recent[key]=now;session.articleReadAt=recent;return true;
}
export function publicCities(db){
  const map=new Map(cities.map(city=>[slugify(city),city]));
  for(const {city} of db.prepare("SELECT DISTINCT city FROM articles WHERE status='published' AND TRIM(city)<>'' ORDER BY city").all()){const name=city.trim();if(!map.has(slugify(name)))map.set(slugify(name),name);}
  return [...map.values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
export function homepageSections(all){
  const hero=all.find(a=>a.featured===1)||all[0];const selected=new Set(hero?[hero.id]:[]);
  const sidebarStories=[...all.filter(a=>a.featured>1).sort((a,b)=>a.featured-b.featured),...all].filter(a=>{if(selected.has(a.id))return false;selected.add(a.id);return true;}).slice(0,4);
  const used=new Set([hero?.id,...sidebarStories.map(a=>a.id)]);
  const latest=all.filter(a=>!used.has(a.id)).slice(0,8);latest.forEach(a=>used.add(a.id));
  const culture=all.filter(a=>a.category==='cultura-e-turismo'&&!used.has(a.id)).slice(0,4);culture.forEach(a=>used.add(a.id));
  const digests=['politica','economia-e-agro'].map(key=>{const stories=all.filter(a=>a.category===key&&!used.has(a.id)).slice(0,3);stories.forEach(a=>used.add(a.id));return {key,stories};}).filter(section=>section.stories.length);
  return {all,hero,sidebarStories,latest,culture,digests};
}
export function readingMinutes(body){return Math.max(1,Math.ceil(String(body||'').replace(/<[^>]*>/g,' ').trim().split(/\s+/).filter(Boolean).length/200));}
export function shortPublication(value,now=Date.now()){
  if(!value)return '';
  return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',...(dayInSaoPaulo(value)===dayInSaoPaulo(now)?{hour:'2-digit',minute:'2-digit'}:{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}).format(new Date(value));
}
