// Upgrade legacy display crops only; preserve originals and sharing images.
export async function upgradeResponsiveCrops({db,media,read}){
  const prefix=media.publicOrigin+'/storage/v1/object/public/'+(process.env.SUPABASE_STORAGE_BUCKET||'giro63-media')+'/crops/';
  const rows=await db.prepare('SELECT id,photo_cover,photo_thumb FROM articles').all(),converted=new Map();let updated=0;
  for(const row of rows)for(const field of ['photo_cover','photo_thumb']){
    const old=row[field];if(typeof old!=='string'||!old.startsWith(prefix)||!/^\w+\.webp$/.test(old.slice(prefix.length)))continue;
    if(!converted.has(old))converted.set(old,await media.saveVariant(await read(old.slice(prefix.length))));
    const result=await db.prepare('UPDATE articles SET '+field+'=? WHERE id=? AND '+field+'=?').run(converted.get(old),row.id,old);updated+=result.changes;
  }
  return updated;
}
