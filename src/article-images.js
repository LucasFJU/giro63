import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {fetchApprovedBuffer,approvedUrl,plain} from './feed-reader.js';
export const imageHosts=['agenciabrasil.ebc.com.br','imagens.ebc.com.br','s2-g1.glbimg.com'];
const pageHosts=['agenciabrasil.ebc.com.br','g1.globo.com'];
function sourceImages(page){const u=approvedUrl(page,pageHosts);if(u.hostname==='g1.globo.com'){if(!u.pathname.startsWith('/to/tocantins/')||!u.pathname.endsWith('.ghtml'))throw Error('Página fora do G1 Tocantins.');return ['s2-g1.glbimg.com'];}return ['agenciabrasil.ebc.com.br','imagens.ebc.com.br'];}
export const photoFields=['photo_photographer','photo_source','photo_source_url','photo_license','photo_caption','photo_x','photo_y'];
export function photoValues(body,old={}){
 const values={};for(const key of photoFields){
  const value=body[key]??old[key]??(key==='photo_x'||key==='photo_y'?50:'');
  if(key==='photo_x'||key==='photo_y'){if(![0,25,50,75,100].includes(Number(value)))throw Error('Escolha uma posição válida para o recorte.');values[key]=Number(value);}
  else values[key]=String(value).trim().slice(0,key==='photo_source_url'?1000:key==='photo_caption'?500:250);
 }
 if(values.photo_source_url){const url=new URL(values.photo_source_url);if(url.protocol!=='https:'||url.username||url.password)throw Error('A fonte da imagem precisa de um endereço HTTPS válido.');values.photo_source_url=url.href;}
 return values;
}
export async function cropImage(buffer,width,height,x=50,y=50){
 const oriented=await sharp(buffer,{limitInputPixels:25e6}).rotate().toBuffer({resolveWithObject:true});
 const scale=Math.max(width/oriented.info.width,height/oriented.info.height),w=Math.ceil(oriented.info.width*scale),h=Math.ceil(oriented.info.height*scale);
 return sharp(oriented.data).resize(w,h).extract({left:Math.round((w-width)*x/100),top:Math.round((h-height)*y/100),width,height}).webp({quality:85}).toBuffer();
}
const decode=value=>String(value||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&');
const attributes=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(x=>[x[1].toLowerCase(),decode(x[3])]));
export function imageFromPage(html,page){
 const hosts=sourceImages(page),g1=new URL(page).hostname==='g1.globo.com';
 const metas=[...html.matchAll(/<meta\b[^>]*>/gi)].map(x=>attributes(x[0]));
 const image=metas.find(x=>x.property==='og:image')?.content;if(!image)return null;
 let url;try{url=approvedUrl(new URL(image,page).href,hosts).href;}catch{return null;}
 if(/logo|ebc\.(png|gif)|loading|placeholder/i.test(url))return null;
 if(g1){
   const key=new URL(url).pathname.split('/internal_photos/')[1];
   const figures=[...html.matchAll(/<figure\b[\s\S]*?<\/figure>/gi)];
   const figure=key?figures.find(f=>[...f[0].matchAll(/<(?:amp-)?img\b[^>]*>/gi)].some(tag=>{const src=attributes(tag[0]).src;try{return approvedUrl(src,hosts).pathname.split('/internal_photos/')[1]===key;}catch{return false;}}))?.[0]:null;
   const imageTag=figure?.match(/<(?:amp-)?img\b[^>]*>/i)?.[0];
   const description=plain(imageTag?attributes(imageTag).alt||'':'');
   const parts=description.split(/\s*[—–-]\s*Foto:\s*|\s+Foto:\s*/i),caption=parts[0]||'';
   return {image_url:url,source_page:page,source:'G1 Tocantins — direitos a conferir',photographer:parts.slice(1).join(' / ').slice(0,250),caption:caption.slice(0,500),alt:caption.slice(0,250),license:''};
 }
 const description=plain(metas.find(x=>x.property==='og:image:alt'||x.name==='twitter:image:alt')?.content||'');
 const alt=description.replace(/\s*Foto:.*$/i,'').slice(0,250);
 const credit=plain(/<(figcaption|div)\b[^>]*class=["'][^"']*credito-foto[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i.exec(html)?.[2]||'').replace(/^©\s*/, '');
 const own=/Agência Brasil(?:\/Arquivo)?\s*$/i.test(credit),photographer=own?credit.replace(/\s*\/?\s*Agência Brasil(?:\/Arquivo)?\s*$/i,'').slice(0,250):'';
 return {image_url:url,source_page:page,source:own?'Agência Brasil':credit||'Agência Brasil — crédito a conferir',photographer,caption:description.replace(/\s*Foto:.*$/i,'').slice(0,500),alt,license:own&&photographer&&!/direitos reservados|republicação[^<]{0,80}proibida/i.test(html)?'Uso jornalístico com crédito — https://www.gov.br/pt-br/servicos/acessar-material-fotojornalistico-gratuitamente':''};
}
export async function discoverImage(page,{read}={}){
 sourceImages(page);
 const html=read?await read(page):(await fetchApprovedBuffer(page,[new URL(page).hostname],{maxBytes:4*1024*1024})).toString('utf8');
 return imageFromPage(html,page);
}
export async function addImageSuggestion(db,articleId,value){
 if(!value)return;approvedUrl(value.image_url,sourceImages(value.source_page));
 await db.prepare('INSERT INTO article_image_suggestions(id,article_id,image_url,source_page,source,photographer,caption,alt,license,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').run(randomUUID(),articleId,value.image_url,value.source_page,value.source||'',value.photographer||'',value.caption||'',value.alt||'',value.license||'',new Date().toISOString());
}
export async function readSuggestedImage(value){
 const hosts=sourceImages(value.source_page);approvedUrl(value.image_url,hosts);
 try{const bytes=await fetchApprovedBuffer(value.image_url,hosts,{maxBytes:4*1024*1024,accept:'image/jpeg,image/png,image/webp'});
 const meta=await sharp(bytes,{limitInputPixels:25e6}).metadata();if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw Error();return bytes;}catch{throw Error('Não foi possível validar ou baixar a sugestão. Confira se a fonte oferece JPG, PNG ou WebP estático de até 4 MB e 25 megapixels. A capa anterior foi preservada.');}
}
export function checkImageApproval(body,photo,alt){
 if(body.image_rights_confirmed!=='on'||body.image_context_confirmed!=='on'||!photo.photo_photographer||!photo.photo_source||!photo.photo_source_url||!photo.photo_license||!alt)throw Error('Para aprovar a sugestão, preencha fotógrafo, fonte, licença e descrição acessível e confirme os direitos e a relação com a notícia.');
}

export function automaticImageEligible(image){return !!image&&new URL(image.source_page).hostname==='agenciabrasil.ebc.com.br'&&image.source==='Agência Brasil'&&!!image.photographer&&!!image.alt&&!!image.caption&&image.license==='Uso jornalístico com crédito — https://www.gov.br/pt-br/servicos/acessar-material-fotojornalistico-gratuitamente';}

// Editorial policy: credited source photos may be used with a separate pending review.
export function creditedImageEligible(image){
 try{sourceImages(image.source_page);approvedUrl(image.image_url,sourceImages(image.source_page));}catch{return false;}
 return !!image.photographer?.trim()&&!!image.caption?.trim()&&!!image.alt?.trim()&&!/direitos reservados|reprodu[cç][aã]o proibida|republica[cç][aã]o proibida/i.test([image.photographer,image.source,image.caption,image.license].join(' '));
}
