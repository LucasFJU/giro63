import {createHash} from 'node:crypto';
export const issueLabels={SOURCE_UNAUTHORIZED:'Fonte sem autorização de reutilização',INSUFFICIENT_FACTS:'Informação factual insuficiente',DUPLICATE:'Possível duplicidade não resolvida',UNCONFIRMED_NUMBER:'Número não confirmado',UNCONFIRMED_QUOTE:'Citação não confirmada',GENERATION_FAILED:'Falha na geração',INVALID_CONTENT:'Conteúdo inválido',IMAGE_PENDING:'Imagem ou autorização pendente',UNKNOWN_ALERT:'Alerta não classificado',LEGACY_REVIEW:'Conferência prévia da versão antiga',ATTRIBUTION_LOST:'Atribuição ou condição de suspeita removida',SENSITIVE:'Tema sensível',TAGS:'Tags sugeridas',CITY_ABSENT:'Cidade ausente ou não confirmada',SHORT_COMPLETE:'Texto curto: conferir os detalhes disponíveis',SOURCE_UPDATED:'Fonte atualizada após a preparação'};
export const insufficientFacts=text=>String(text||'').replace(/<[^>]*>/g,'').trim().length<40;
export const pendingCodes=new Set(['SENSITIVE','TAGS','CITY_ABSENT','SHORT_COMPLETE','SOURCE_UPDATED']);
export const parseCodes=value=>{try{const list=JSON.parse(value||'[]');return Array.isArray(list)&&list.every(x=>typeof x==='string')?list:['UNKNOWN_ALERT'];}catch{return ['UNKNOWN_ALERT'];}};
export const splitIssues=codes=>({blockers:[...new Set(codes.filter(c=>!pendingCodes.has(c)))],pending:[...new Set(codes.filter(c=>pendingCodes.has(c)))]});
export const contentHash=a=>createHash('sha256').update([a.title,a.summary,a.body,a.city].join('\n')).digest('hex');
export function factIssues(text,source){
 const codes=[],numbers=t=>new Set((t.match(/\d+(?:[.,]\d+)*/g)||[])),known=numbers(source);
 if([...numbers(text)].some(n=>!known.has(n)))codes.push('UNCONFIRMED_NUMBER');
 const normalize=t=>t.normalize('NFC').replace(/\s+/g,' ').trim().toLowerCase();
 const quotes=[...text.matchAll(/["“«]([^"”»]+)["”»]/g)].map(m=>normalize(m[1]));
 if(quotes.some(q=>!normalize(source).includes(q)))codes.push('UNCONFIRMED_QUOTE');
 for(const qualifier of [/suspeit[oa]s?/i,/segundo a pol[ií]cia/i,/alega[cç][aã]o/i,/acusad[oa]s?/i])if(qualifier.test(source)&&!qualifier.test(text))codes.push('ATTRIBUTION_LOST');
 return [...new Set(codes)];
}
export function imageEligible(article,approvedCover){
 return !!approvedCover&&article.cover===approvedCover&&!/\/(?:og-giro63\.png|cerrado\.jpg)(?:$|\?)/.test(article.cover)&&['credit','cover_alt','photo_photographer','photo_source','photo_source_url','photo_license'].every(k=>String(article[k]||'').trim());
}
export function publicationError(message){return Object.assign(new Error(message),{publication:true});}
export function sourceFooter(source,url){const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return '<p>Conteúdo preparado a partir de informações de '+esc(source)+'. <a href="'+esc(url)+'">Leia a publicação original</a>.</p>';}
export function replaceStandardFooter(body,source,url){
 const next=sourceFooter(source,url),base=next.replace('preparado a partir','preparado com auxílio de inteligência artificial, a partir');
 const variants=[base,base.replace('informações de ','informações da '),base.replace('informações de ','informações do ')].flatMap(old=>[old,old.replaceAll('"','\\"')]);
 const matches=variants.flatMap(old=>Array.from({length:body.split(old).length-1},()=>old));
 if(matches.length===1)return {body:body.replace(matches[0],next),changed:true};
 return {body,changed:false,needsReview:/<p\b[^>]*>Conteúdo preparado[^<]*inteligência artificial/i.test(body)};
}
