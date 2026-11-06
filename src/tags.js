import {slugify} from './db.js';
import {transaction} from './postgres.js';
export const normalizeTag=value=>String(value||'').trim().replace(/\s+/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export function tagNames(value){
  const entries=Array.isArray(value)?value:String(value||'').split(',');const seen=new Set();
  return entries.map(v=>String(v).trim().replace(/\s+/g,' ')).filter(name=>{const key=normalizeTag(name);if(!key||name.length>50||!slugify(name)||!/^[\p{L}\p{N} \-]+$/u.test(name)||['noticias','giro63','g1','agencia brasil','agencia tocantins','ebc','tv brasil','radio nacional','reuters','afp'].includes(key)||seen.has(key))return false;seen.add(key);return true;}).slice(0,5);
}
export async function assignTags(db,id,names){
  for(const name of tagNames(names)){
    const normalized=normalizeTag(name),slug=slugify(name);
    await db.prepare('INSERT INTO tags(slug,name,normalized) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(slug,name,normalized);
    const tag=await db.prepare('SELECT slug FROM tags WHERE normalized=?').get(normalized);
    if(tag)await db.prepare('INSERT INTO article_tags(article_id,tag_slug) VALUES(?,?) ON CONFLICT DO NOTHING').run(id,tag.slug);
  }
}
export async function replaceTags(db,id,names){await transaction(db,async()=>{await db.prepare('DELETE FROM article_tags WHERE article_id=?').run(id);await assignTags(db,id,names);});}
export async function tagsFor(db,id){return db.prepare('SELECT t.* FROM tags t JOIN article_tags a ON a.tag_slug=t.slug WHERE a.article_id=? ORDER BY t.name').all(id);}
export function mountTags(app,{db,requireUser,editor,checkCsrf,listing}){
  app.get('/tag/:slug',async(req,res,next)=>{const tag=await db.prepare('SELECT * FROM tags WHERE slug=?').get(req.params.slug);if(!tag)return next();return listing(req,res,{heading:tag.name,where:'id IN (SELECT article_id FROM article_tags WHERE tag_slug=?)',params:[tag.slug],intro:'Notícias sobre '+tag.name+'.'});});
  app.get('/admin/tags',requireUser,editor,async(req,res)=>res.render('tags',{title:'Tags',error:'',tags:await db.prepare('SELECT * FROM tags ORDER BY name').all()}));
  app.post('/admin/tags',requireUser,editor,checkCsrf,async(req,res)=>{
    const action=String(req.body.action||''),name=tagNames([req.body.name])[0],slug=String(req.body.slug||''),target=String(req.body.target||'');
    try{await transaction(db,async()=>{
      if(action==='merge'){
        if(slug===target||!await db.prepare('SELECT slug FROM tags WHERE slug=?').get(target))throw Error('Escolha uma tag de destino diferente.');
        const links=await db.prepare('SELECT article_id FROM article_tags WHERE tag_slug=?').all(slug);
        for(const link of links)await db.prepare('INSERT INTO article_tags(article_id,tag_slug) VALUES(?,?) ON CONFLICT DO NOTHING').run(link.article_id,target);
        await db.prepare('DELETE FROM article_tags WHERE tag_slug=?').run(slug);await db.prepare('DELETE FROM tags WHERE slug=?').run(slug);
      }else if(action==='delete'){
        await db.prepare('DELETE FROM article_tags WHERE tag_slug=?').run(slug);await db.prepare('DELETE FROM tags WHERE slug=?').run(slug);
      }else{
        if(!name)throw Error('Informe uma tag válida com até 50 caracteres.');
        if(action==='rename')await db.prepare('UPDATE tags SET name=?,normalized=? WHERE slug=?').run(name,normalizeTag(name),slug);
        else await db.prepare('INSERT INTO tags(slug,name,normalized) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(slugify(name),name,normalizeTag(name));
      }
    });res.redirect('/admin/tags');}catch{res.status(400).render('tags',{title:'Tags',error:'Confira o nome e o destino. Tags equivalentes devem ser unificadas.',tags:await db.prepare('SELECT * FROM tags ORDER BY name').all()});}
  });
}
