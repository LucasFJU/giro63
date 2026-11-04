// One-time, conditional migration of the legacy advertising images.
// No general upload endpoint or migration credential is exposed by the app.
export async function migrateDeploymentMedia({db,storage,manifest,readAsset}){
  let transferred=0,unchanged=0;
  for(const item of manifest){
    if(![['ads','image'],['articles','cover']].some(([table,column])=>item.table===table&&item.column===column)||!Number.isSafeInteger(item.id)||item.id<=0||!/^[a-f0-9]{40}\.webp$/.test(item.filename)||item.oldUrl!=='/uploads/'+item.filename)throw Error('Manifesto de mídia inválido.');
    const row=await db.prepare(`SELECT ${item.column} AS image FROM ${item.table} WHERE id=?`).get(item.id);
    if(!row||row.image!==item.oldUrl){unchanged++;continue;}
    const name='legacy/'+item.filename,buffer=await readAsset(item.filename);
    const {error}=await storage.upload(name,buffer,{contentType:'image/webp',upsert:false,cacheControl:'31536000'});
    if(error&&String(error.statusCode)!=='409')throw Error('Não foi possível transferir a arte para o Supabase Storage.');
    const url=storage.getPublicUrl(name).data.publicUrl;
    const result=await db.prepare(`UPDATE ${item.table} SET ${item.column}=? WHERE id=? AND ${item.column}=?`).run(url,item.id,item.oldUrl);
    if(result.changes)transferred++;else unchanged++;
  }
  return {transferred,unchanged};
}
