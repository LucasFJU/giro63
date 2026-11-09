import {randomUUID} from 'node:crypto';
import {transaction} from './postgres.js';
import {sourceVersion,photoVersion,captionFor,articleLink,digest,eligibility,socialImageReady} from './instagram-content.js';
import {renderInstagramArt} from './instagram-art.js';
import {unsealToken} from './instagram-meta.js';
export async function socialEvent(db,postId,message){await db.prepare('INSERT INTO instagram_events(id,post_id,created_at,message) VALUES(?,?,?,?)').run(randomUUID(),postId,new Date().toISOString(),message.slice(0,1000));}
export async function socialArticle(db,id){return db.prepare('SELECT a.*,COALESCE(i.review_pending,0) AS review_pending,i.blockers FROM articles a LEFT JOIN automation_items i ON i.article_id=a.id WHERE a.id=?').get(id);}
export async function socialSettings(db){return Object.fromEntries((await db.prepare("SELECT key,value FROM settings WHERE key IN ('instagram_mode','instagram_activated_at','instagram_test_verified','public_url')").all()).map(x=>[x.key,x.value]));}
export async function syncInstagramArticle(db,id,{becamePublished=false,userId=null,inTransaction=false}={}){
 const action=async()=>{
  if(db.dialect==='postgres')await db.prepare('SELECT pg_advisory_xact_lock(6363)').get();
  const a=await socialArticle(db,id),old=await db.prepare('SELECT * FROM instagram_posts WHERE article_id=?').get(id);if(!a)return null;
  if(a.archived_at||a.deleted_at||!['published','review'].includes(a.status)){if(old){await db.prepare('UPDATE instagram_posts SET cancelled=CASE WHEN cancelled=1 THEN 1 ELSE 2 END,test_requested=0 WHERE id=?').run(old.id);await db.prepare("UPDATE instagram_deliveries SET state='cancelled' WHERE post_id=? AND state NOT IN ('published','publishing','uncertain')").run(old.id);}return old;}
  const settings=await socialSettings(db),stamp=new Date().toISOString(),version=sourceVersion(a),candidate=becamePublished&&settings.instagram_mode==='auto'&&!!settings.instagram_activated_at&&Date.parse(a.published_at)>=Date.parse(settings.instagram_activated_at)?1:0;
  const safeCaption=tags=>{try{return {caption:captionFor(a,articleLink(a,settings.public_url||'https://giro63.vercel.app'),tags),error:''};}catch{return {caption:'',error:'Legenda longa ou URL pública ausente. Ajuste o material social no painel.'};}};
  if(old){
   const sent=await db.prepare("SELECT target FROM instagram_deliveries WHERE post_id=? AND state IN ('published','publishing','uncertain')").all(old.id);
   if(Number(old.cancelled)===2&&!sent.length){await db.prepare('UPDATE instagram_posts SET cancelled=0 WHERE id=?').run(old.id);await db.prepare("UPDATE instagram_deliveries SET state='prepared' WHERE post_id=? AND state='cancelled'").run(old.id);}
   if(old.source_version!==version){if(sent.length){await db.prepare('UPDATE instagram_posts SET change_notice=?,cancelled=1 WHERE id=?').run('A matéria foi alterada após envio ou tentativa incerta. Confira o Instagram; não haverá republicação automática.',old.id);await db.prepare("UPDATE instagram_deliveries SET state='cancelled' WHERE post_id=? AND state NOT IN ('published','publishing','uncertain')").run(old.id);return old;}
    await db.prepare("UPDATE instagram_posts SET source_version=?,headline=?,standfirst=?,caption=?,feed_path='',fallback_path='',story_path='',error='',change_notice='',updated_at=? WHERE id=?").run(version,a.title,a.summary,safeCaption([]).caption,stamp,old.id);
    await db.prepare("UPDATE instagram_deliveries SET state='prepared',container_id='',attempts=0,error='',next_attempt_at=0 WHERE post_id=?").run(old.id);
   }
   if(candidate)await db.prepare('UPDATE instagram_posts SET auto_candidate=1 WHERE id=?').run(old.id);
   return db.prepare('SELECT * FROM instagram_posts WHERE id=?').get(old.id);
  }
  const tags=await db.prepare('SELECT t.name FROM tags t JOIN article_tags a ON a.tag_slug=t.slug WHERE a.article_id=? ORDER BY t.name').all(id),postId=randomUUID();
  await db.prepare('INSERT INTO instagram_posts(id,article_id,source_version,headline,standfirst,caption,auto_candidate,prepared_by,updated_at,error,art_template) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(postId,id,version,a.title,a.summary,safeCaption(tags).caption,candidate,userId,stamp,safeCaption(tags).error,'navy');
  for(const target of ['feed','story'])await db.prepare('INSERT INTO instagram_deliveries(post_id,target,ratio,updated_at) VALUES(?,?,?,?)').run(postId,target,target==='feed'?'3:4':'9:16',stamp);
  await socialEvent(db,postId,'Preparação criada; não equivale a autorização de envio.');return db.prepare('SELECT * FROM instagram_posts WHERE id=?').get(postId);
 };return inTransaction?action():transaction(db,action);
}
export const instagramArtAssetVersion=post=>digest(JSON.stringify(['art-v5-clean-footer',post.art_template,post.source_version,post.headline,post.standfirst,post.photo_x,post.photo_y]));
export async function prepareInstagramArt(db,post,storage,readImage){
 const a=await socialArticle(db,post.article_id);if(!a||!a.cover)throw Error('Escolha uma imagem de capa para preparar as artes. A autorização para envio é conferida separadamente.');
 if(a.archived_at||a.deleted_at||!['review','published'].includes(a.status))throw Error('Esta matéria não está disponível para preparação.');
 if(post.source_version!==sourceVersion(a))throw Error('A matéria mudou. Atualize a preparação.');
 const category=(await db.prepare('SELECT name FROM editorial_categories WHERE slug=?').get(a.category))?.name||a.category;
 const settings=await socialSettings(db),site=new URL(settings.public_url||'https://giro63.vercel.app').hostname;
 const image=await readImage(a.cover),files={},assetVersion=instagramArtAssetVersion(post);
 for(const format of ['feed','fallback','story']){const bytes=await renderInstagramArt({image,headline:post.headline,standfirst:post.standfirst,category,x:post.photo_x,y:post.photo_y,format,site,template:post.art_template});files[format]=await storage.save(post.id+'/'+assetVersion+'-'+format+'.jpg',bytes);}
 const latest=await db.prepare('SELECT * FROM instagram_posts WHERE id=?').get(post.id);if(latest.updated_at!==post.updated_at||latest.source_version!==post.source_version)throw Error('A preparação mudou durante a geração. Gere novamente.');
 await db.prepare("UPDATE instagram_posts SET feed_path=?,fallback_path=?,story_path=?,prepared_at=?,generated_template=art_template,error='' WHERE id=? AND source_version=?").run(files.feed,files.fallback,files.story,new Date().toISOString(),post.id,post.source_version);return files;
}
export async function runInstagram(db,{storage,readImage,meta,secret,allowPublish=process.env.VERCEL_ENV==='production',now=Date.now()}={}){
 const deadline=Date.now()+45000,owner=randomUUID(),lease=await db.prepare('INSERT INTO automation_lock(id,owner,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE automation_lock.expires_at<?').run('instagram-runner',owner,now+180000,now);if(!lease.changes)return {message:'Uma execução do Instagram está em andamento.'};
 try{
  const settings=await socialSettings(db);if(settings.instagram_mode==='paused')return {message:'Instagram pausado.'};
  const posts=await db.prepare("SELECT p.* FROM instagram_posts p WHERE p.cancelled=0 AND EXISTS(SELECT 1 FROM instagram_deliveries d WHERE d.post_id=p.id AND d.state NOT IN ('published','cancelled')) ORDER BY CASE WHEN p.auto_candidate=1 OR p.test_requested=1 THEN 0 ELSE 1 END,p.updated_at LIMIT 50").all();let prepared=0,sent=0;
  let connection=await db.prepare("SELECT * FROM instagram_connection WHERE id='main'").get();
  if(connection&&Number(connection.expires_at)>now&&Number(connection.expires_at)<now+7*86400000&&Date.parse(connection.updated_at)<now-86400000&&allowPublish){try{const refreshed=await meta.refresh(unsealToken(connection.token_cipher,secret));if(refreshed.access_token&&refreshed.expires_in){const {sealToken}=await import('./instagram-meta.js');await db.prepare("UPDATE instagram_connection SET token_cipher=?,expires_at=?,updated_at=? WHERE id='main'").run(sealToken(refreshed.access_token,secret),now+Number(refreshed.expires_in)*1000,new Date(now).toISOString());connection=await db.prepare("SELECT * FROM instagram_connection WHERE id='main'").get();}}catch{await socialEvent(db,null,'Não foi possível renovar a conexão. Reconecte se o prazo expirar.');}}
  if(connection){try{unsealToken(connection.token_cipher,secret);}catch{connection=null;await socialEvent(db,null,'A proteção das credenciais mudou. Reconecte a conta do Instagram.');}}
  for(let post of posts){
   const a=await socialArticle(db,post.article_id);if(!a)continue;
   if(a.archived_at||a.deleted_at||a.status==='draft'){await syncInstagramArticle(db,a.id);continue;}
   if(post.source_version!==sourceVersion(a)){await syncInstagramArticle(db,a.id);continue;}
   if(Date.now()>deadline-15000)break;
   if(!post.feed_path){try{await prepareInstagramArt(db,post,storage,readImage);prepared++;post=await db.prepare('SELECT * FROM instagram_posts WHERE id=?').get(post.id);}catch(error){await db.prepare('UPDATE instagram_posts SET error=?,updated_at=? WHERE id=?').run(error.message.slice(0,500),new Date().toISOString(),post.id);}break;}
   const blocked=eligibility(a,post,settings.instagram_mode,connection,now);
   if(blocked){await db.prepare("UPDATE instagram_deliveries SET state='waiting',error=? WHERE post_id=? AND state NOT IN ('published','cancelled','publishing','uncertain')").run(blocked,post.id);await db.prepare('UPDATE instagram_posts SET updated_at=? WHERE id=?').run(new Date().toISOString(),post.id);continue;}
   const deliveries=await db.prepare("SELECT * FROM instagram_deliveries WHERE post_id=? AND state NOT IN ('published','cancelled') ORDER BY target").all(post.id);
   for(const d of deliveries){
    if(blocked){if(!['publishing','uncertain'].includes(d.state))await db.prepare("UPDATE instagram_deliveries SET state='waiting',error=? WHERE post_id=? AND target=?").run(blocked,post.id,d.target);continue;}
    if(Date.now()>deadline-15000)break;
    if(!allowPublish)continue;if(d.next_attempt_at>now||d.attempts>=4&&d.state!=='uncertain')continue;
    const token=unsealToken(connection.token_cipher,secret);
    if(['publishing','uncertain'].includes(d.state)){
     if(d.container_id){try{const status=await meta.status(d.container_id,token);if(status.status_code==='PUBLISHED'){await db.prepare("UPDATE instagram_deliveries SET state='published',error='',updated_at=? WHERE post_id=? AND target=?").run(new Date(now).toISOString(),post.id,d.target);await socialEvent(db,post.id,d.target+': publicação confirmada pela Meta após resposta incerta.');continue;}}catch{}}
     await db.prepare("UPDATE instagram_deliveries SET state='uncertain',error='Envio com resposta incerta. Confira o Instagram antes de qualquer novo envio.',next_attempt_at=? WHERE post_id=? AND target=?").run(now+3600000,post.id,d.target);continue;
    }
    let publishing=false;
    try{
     let id=d.container_id;
     if(!id){const file=d.target==='story'?post.story_path:d.ratio==='4:5'?post.fallback_path:post.feed_path;const url=await storage.signedUrl(file);const current=await socialArticle(db,a.id),latest=await db.prepare('SELECT * FROM instagram_posts WHERE id=?').get(post.id);if(eligibility(current,latest,(await socialSettings(db)).instagram_mode,connection,now)||JSON.stringify([latest.art_template,latest.caption,latest.headline,latest.standfirst,latest.photo_x,latest.photo_y])!==JSON.stringify([post.art_template,post.caption,post.headline,post.standfirst,post.photo_x,post.photo_y]))continue;
      await db.prepare("UPDATE instagram_deliveries SET state='creating',attempts=attempts+1,updated_at=? WHERE post_id=? AND target=?").run(new Date(now).toISOString(),post.id,d.target);
      const created=await meta.create({accountId:connection.account_id,token,url,caption:post.caption,target:d.target,alt:a.cover_alt});if(!/^\d+$/.test(String(created.id)))throw Error('Resposta inválida da Meta.');id=String(created.id);
      await db.prepare("UPDATE instagram_deliveries SET container_id=?,state='ready' WHERE post_id=? AND target=?").run(id,post.id,d.target);
     }
     if(Date.now()>deadline-15000)break;
     const status=await meta.status(id,token);if(status.status_code==='PUBLISHED'){await db.prepare("UPDATE instagram_deliveries SET state='published',error='' WHERE post_id=? AND target=?").run(post.id,d.target);continue;}
     if(status.status_code!=='FINISHED'){if(['ERROR','EXPIRED'].includes(status.status_code)){await db.prepare("UPDATE instagram_deliveries SET state='error',attempts=attempts+1,error='A Meta não processou a arte. Tente novamente no painel.',next_attempt_at=? WHERE post_id=? AND target=?").run(now+3600000,post.id,d.target);}continue;}
     const current=await socialArticle(db,a.id),latest=await db.prepare('SELECT * FROM instagram_posts WHERE id=?').get(post.id);if(eligibility(current,latest,(await socialSettings(db)).instagram_mode,connection,now)||JSON.stringify([latest.art_template,latest.caption,latest.headline,latest.standfirst,latest.photo_x,latest.photo_y])!==JSON.stringify([post.art_template,post.caption,post.headline,post.standfirst,post.photo_x,post.photo_y]))continue;
     if(Date.now()>deadline-15000)break;
     await db.prepare("UPDATE instagram_deliveries SET attempts=attempts+1,state='publishing',updated_at=? WHERE post_id=? AND target=?").run(new Date(now).toISOString(),post.id,d.target);publishing=true;
     const result=await meta.publish(connection.account_id,id,token);if(!/^\d+$/.test(String(result.id)))throw Error('Resposta de publicação não confirmada.');
     await db.prepare("UPDATE instagram_deliveries SET state='published',media_id=?,error='',updated_at=? WHERE post_id=? AND target=?").run(String(result.id),new Date(now).toISOString(),post.id,d.target);await socialEvent(db,post.id,d.target+': publicado. ID '+result.id);sent++;
    }catch(error){
     if(error.aspect&&d.target==='feed'&&d.ratio==='3:4'&&!publishing){await db.prepare("UPDATE instagram_deliveries SET ratio='4:5',container_id='',state='prepared',error='Adaptação 4:5 preparada para a API.',next_attempt_at=0 WHERE post_id=? AND target=?").run(post.id,d.target);await socialEvent(db,post.id,'A Meta recusou 3:4; próxima tentativa usará arte própria 4:5.');}
     else{const uncertain=publishing&&(error.uncertain||!error.status);await db.prepare('UPDATE instagram_deliveries SET state=?,error=?,next_attempt_at=?,updated_at=? WHERE post_id=? AND target=?').run(uncertain?'uncertain':'error',uncertain?'Resposta incerta. A publicação será conferida antes de reenviar.':error.code===190?'Conexão expirada. Reconecte o Instagram.':'Falha ao processar na Meta. Confira a conexão e os limites da conta.',now+Math.min(3600000,60000*2**d.attempts),new Date(now).toISOString(),post.id,d.target);}
    }
   }
   break;
  }
  return {message:'Fila do Instagram conferida.',prepared,sent};
 }finally{await db.prepare('DELETE FROM automation_lock WHERE id=? AND owner=?').run('instagram-runner',owner);}
}
