import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import sanitizeHtml from 'sanitize-html';
export const plain=value=>sanitizeHtml(String(value||''),{allowedTags:[],allowedAttributes:{}}).replace(/\s+/g,' ').trim();
export function approvedUrl(value,hosts){
  const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||isIP(u.hostname)||!hosts.includes(u.hostname.toLowerCase()))throw Error('Endereço fora dos domínios aprovados.');u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);return u;
}
export function publicAddress(address){
  if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19,51].includes(b)||a===203&&b===0);}
  // Pin to public IPv4. No mapped IPv6, private, metadata or loopback targets.
  return false;
}
export async function fetchApprovedBuffer(url,hosts,{maxBytes=1024*1024,accept='text/html,application/xml,text/xml'}={},redirects=0){
  const u=approvedUrl(url,hosts),addresses=await Promise.race([lookup(u.hostname,{all:true}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Consulta DNS excedeu o prazo.')),8000);timer.unref();})]);const address=addresses.find(a=>a.family===4&&publicAddress(a.address));if(!address||addresses.some(a=>a.family===4&&!publicAddress(a.address)))throw Error('Destino de rede não permitido.');
  const result=await new Promise((resolve,reject)=>{
    const request=https.get(u,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'Giro63 RSS/1.0','Accept':accept},lookup:(_host,options,cb)=>cb(null,options.all?[address]:address.address,address.family)},res=>{
      if([301,302,303,307,308].includes(res.statusCode)){res.resume();return resolve({redirect:res.headers.location});}
      if(res.statusCode!==200){res.resume();return reject(Error('Feed indisponível (HTTP '+res.statusCode+').'));}
      let length=0;const chunks=[];res.on('data',chunk=>{length+=chunk.length;if(length>maxBytes){request.destroy(Error('Arquivo excede o limite permitido.'));return;}chunks.push(chunk);});res.on('end',()=>resolve({bytes:Buffer.concat(chunks)}));res.on('error',reject);
    });request.setTimeout(8000,()=>request.destroy(Error('Tempo de consulta excedido.')));request.on('error',reject);
  });
  if(result.redirect){if(redirects>=2)throw Error('Redirecionamentos em excesso.');return fetchApprovedBuffer(new URL(result.redirect,u).href,hosts,{maxBytes,accept},redirects+1);}return result.bytes;
}
export async function fetchFeed(url,hosts){return (await fetchApprovedBuffer(url,hosts,{accept:'application/rss+xml,application/atom+xml,application/xml,text/xml'})).toString('utf8');}
export function parseFeed(xml,hosts,now=Date.now()){
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw Error('XML inválido ou não permitido.');
  const parsed=new XMLParser({ignoreAttributes:false,processEntities:true}).parse(xml),raw=parsed.rss?.channel?.item??parsed.feed?.entry;if(!raw)throw Error('O endereço não contém um feed RSS ou Atom.');
  return (Array.isArray(raw)?raw:[raw]).slice(0,50).flatMap(entry=>{
    try{
      const links=Array.isArray(entry.link)?entry.link:[entry.link];const link=links.find(x=>typeof x==='string'||x?.['@_rel']==='alternate'||!x?.['@_rel']);
      const url=approvedUrl(typeof link==='string'?link:link?.['@_href'],hosts).href;
      const originalAt=new Date(entry.pubDate||entry.published||entry.updated).toISOString(),age=now-Date.parse(originalAt);
      const received=String(entry.description??entry.summary?.['#text']??entry.summary??'').replace(/<h3\b[^>]*>\s*Notícias relacionadas:\s*<\/h3>\s*<ul\b[^>]*>[\s\S]*?<\/ul>/gi,'');
      const title=plain(entry.title?.['#text']??entry.title).slice(0,180),summary=plain(received.replace(/<\/(?:p|li|h[1-6])>/gi,'$& ')).slice(0,6000);
      if(age<0||age>48*3600000||!title)return [];
      return [{uid:String(entry.guid?.['#text']??entry.guid??entry.id??url).slice(0,1000),url,title,summary,originalAt}];
    }catch{return [];}
  });
}
