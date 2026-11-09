import {createHash} from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
const clean=v=>sanitizeHtml(String(v||''),{allowedTags:[],allowedAttributes:{}}).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
export const digest=v=>createHash('sha256').update(v).digest('hex');
export const photoVersion=a=>digest(JSON.stringify([a.cover,a.credit,a.cover_alt,a.photo_photographer,a.photo_source,a.photo_source_url,a.photo_license]));
export const sourceVersion=a=>digest(JSON.stringify([a.title,a.summary,a.body,a.category,a.city,a.cover,a.credit,a.sources,a.photo_license,a.photo_source_url]));
export function articleLink(a,publicUrl){const u=new URL(publicUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Configure a URL pública do portal.');return u.origin+'/noticia/'+encodeURIComponent(a.slug);}
export function captionFor(a,url,tags=[]){
 const summary=clean(a.summary),credit=a.credit?'Imagem: '+clean(a.credit).replace(/[.]+$/,'')+'.':'',source=a.sources?'Fonte: '+clean(a.sources).replace(/https?:\/\/\S+/gi,'').replace(/[\s—–|:-]+$/g,''):'';
 const hashtags=tags.slice(0,3).map(t=>clean(t.name||t).replace(/[^\p{L}\p{N}]/gu,'')).filter(Boolean).map(t=>'#'+t).join(' ');
 // Extractive preparation: never paraphrase allegations, numbers or names.
 const lead=summary||clean(a.body.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]||'');
 const caption=[clean(a.title),lead,source,credit,hashtags,'Link da matéria na íntegra nos stories.'].filter(Boolean).join('\n\n');
 if(caption.length>2200)throw Error('A legenda ultrapassa 2.200 caracteres. Ajuste o resumo ou os créditos antes de preparar.');return caption;
}
export function socialImageReady(a){return !!a.cover&&!/\/(og-giro63\.png|cerrado\.jpg)(?:$|\?)/.test(a.cover)&&['credit','cover_alt','photo_photographer','photo_source','photo_source_url','photo_license'].every(k=>String(a[k]||'').trim());}
export function eligibility(a,post,mode,connection,now=Date.now()){
 if(mode==='paused')return 'Fila do Instagram pausada.';
 if(a.archived_at||a.deleted_at)return 'Matéria arquivada ou na lixeira.';
 if(a.demo)return 'Conteúdo demonstrativo não é enviado ao Instagram.';
 if(a.status!=='published')return 'Aguardando publicação da matéria no site.';
 if(a.blockers){try{if(JSON.parse(a.blockers).some(c=>c!=='IMAGE_PENDING'))return 'Conclua os bloqueios editoriais da matéria antes de enviar.';}catch{return 'Confira a classificação editorial da matéria.';}}
 if(Number(a.review_pending))return 'Aguardando conclusão da conferência editorial.';
 if(!socialImageReady(a))return 'Imagem, crédito ou licença pendentes.';
 if(post.source_version!==sourceVersion(a))return 'A matéria mudou. Atualize a preparação.';
 if(post.rights_version!==photoVersion(a)||!post.approved_by)return 'Autorize o uso desta fotografia nas redes sociais.';
 if(post.cancelled)return 'Envio cancelado pela redação.';
 if(!connection||Number(connection.expires_at)<=now)return 'Conecte novamente a conta empresarial do Instagram.';
 if(mode!=='auto'&&!post.test_requested)return 'Modo de preparação: envio automático desativado.';
 if(!post.auto_candidate&&!post.test_requested)return 'Matéria anterior à ativação. Envio somente como teste explícito do editor.';
 return '';
}
