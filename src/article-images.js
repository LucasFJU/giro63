import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {fetchApprovedBuffer,approvedUrl,plain} from './feed-reader.js';
export const imageHosts=['agenciabrasil.ebc.com.br','imagens.ebc.com.br'];
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
 const metas=[...html.matchAll(/<meta\b[^>]*>/gi)].map(x=>attributes(x[0]));
 const image=metas.find(x=>x.property==='og:image')?.content;if(!image)return null;
 let url;try{url=approvedUrl(new URL(image,page).href,imageHosts).href;}catch{return null;}
 if(/logo|ebc\.(png|gif)|loading|placeholder/i.test(url))return null;
 const description=plain(metas.find(x=>x.property==='og:image:alt'||x.name==='twitter:image:alt')?.content||'');
 const alt=description.replace(/\s*Foto:.*$/i,'').slice(0,250);
 const credit=plain(/<(figcaption|div)\b[^>]*class=["'][^"']*credito-foto[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i.exec(html)?.[2]||'').replace(/^©\s*/, '');
 const own=/Agência Brasil(?:\/Arquivo)?\s*$/i.test(credit),photographer=own?credit.replace(/\s*\/?\s*Agência Brasil(?:\/Arquivo)?\s*$/i,'').slice(0,250):'';
 return {image_url:url,source_page:page,source:own?'Agência Brasil':credit||'Agência Brasil — crédito a conferir',photographer,caption:description.replace(/\s*Foto:.*$/i,'').slice(0,500),alt,license:''};
}
export async function discoverImage(page,{read=async url=>(await fetchApprovedBuffer(url,['agenciabrasil.ebc.com.br'],{maxBytes:1024*1024})).toString('utf8')}={}){
 approvedUrl(page,['agenciabrasil.ebc.com.br']);return imageFromPage(await read(page),page);
}
export async function addImageSuggestion(db,articleId,value){
 if(!value)return;approvedUrl(value.image_url,imageHosts);approvedUrl(value.source_page,['agenciabrasil.ebc.com.br']);
 await db.prepare('INSERT INTO article_image_suggestions(id,article_id,image_url,source_page,source,photographer,caption,alt,license,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').run(randomUUID(),articleId,value.image_url,value.source_page,value.source||'',value.photographer||'',value.caption||'',value.alt||'',value.license||'',new Date().toISOString());
}
export async function readSuggestedImage(value){
 approvedUrl(value.image_url,imageHosts);
 try{const bytes=await fetchApprovedBuffer(value.image_url,imageHosts,{maxBytes:4*1024*1024,accept:'image/jpeg,image/png,image/webp'});
 const meta=await sharp(bytes,{limitInputPixels:25e6}).metadata();if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw Error();return bytes;}catch{throw Error('Não foi possível validar ou baixar a sugestão. Confira se a fonte oferece JPG, PNG ou WebP estático de até 4 MB e 25 megapixels. A capa anterior foi preservada.');}
}
export function checkImageApproval(body,photo,alt){
 if(body.image_rights_confirmed!=='on'||body.image_context_confirmed!=='on'||!photo.photo_photographer||!photo.photo_source||!photo.photo_source_url||!photo.photo_license||!alt)throw Error('Para aprovar a sugestão, preencha fotógrafo, fonte, licença e descrição acessível e confirme os direitos e a relação com a notícia.');
}
