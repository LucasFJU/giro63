import {replaceStandardFooter} from './publication-policy.js';
import {transaction} from './postgres.js';
export async function migrateAutomationFooters(db,{backup}){
 const items=await db.prepare('SELECT a.id,a.body,i.url,s.name FROM articles a JOIN automation_items i ON i.article_id=a.id JOIN automation_sources s ON s.id=i.source_id').all();
 const updates=[],review=[];
 for(const item of items){const result=replaceStandardFooter(item.body,item.name,item.url);if(result.changed)updates.push({...item,next:result.body});else if(result.needsReview)review.push(item.id);}
 if(updates.length){if(!backup)throw Error('Backup obrigatório antes de atualizar créditos.');await backup(updates);}
 let changed=0;await transaction(db,async()=>{for(const item of updates){const r=await db.prepare('UPDATE articles SET body=? WHERE id=? AND body=?').run(item.next,item.id,item.body);changed+=r.changes;}});
 return {changed,review};
}
