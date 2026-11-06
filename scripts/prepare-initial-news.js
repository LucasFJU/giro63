// One-off, explicitly enabled preparation of the user-authorized launch batch.
// Never publishes; the editor must review every prepared article separately.
if(process.env.PREPARE_INITIAL_NEWS==='1'){
 const {openPostgres,transaction}=await import('../src/postgres.js');
 const {fetchFeed,parseFeed}=await import('../src/feed-reader.js');
 const {ingest,event}=await import('../src/automation.js');
 const {generateNews}=await import('../src/gemini-editor.js');
 const {assignTags}=await import('../src/tags.js');
 const {slugify}=await import('../src/db.js');
 const {dayInSaoPaulo}=await import('../src/reader-experience.js');
 const {randomUUID}=await import('node:crypto');
 const db=openPostgres(process.env.DATABASE_URL),owner=randomUUID();
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 try{
  const settings=Object.fromEntries((await db.prepare('SELECT key,value FROM settings').all()).map(x=>[x.key,x.value]));
  if(settings.automation_paused!=='1'||settings.automation_publish!=='0')throw Error('Pause collection and publication before preparing launch batch.');
  const source=await db.prepare("SELECT * FROM automation_sources WHERE id='agencia-brasil' AND approved=1 AND active=1").get();if(!source)throw Error('Source not approved.');
  const lease=await db.prepare('INSERT INTO automation_lock(id,owner,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE automation_lock.expires_at<?').run('runner',owner,Date.now()+1200000,Date.now());if(!lease.changes)throw Error('Another run is active.');
  const hosts=source.hosts.split(',');
  for(const section of ['economia','educacao','cultura','esportes']){
   const entries=parseFeed(await fetchFeed('https://agenciabrasil.ebc.com.br/rss/'+section+'/feed.xml',hosts),hosts);await ingest(db,source,entries);
   for(const entry of entries)await db.prepare("UPDATE automation_items SET summary=? WHERE url=? AND state='failed' AND article_id IS NULL").run(entry.summary,entry.url);
  }
  const categories=(await db.prepare('SELECT slug FROM editorial_categories').all()).map(x=>x.slug);
  const candidates=await db.prepare("SELECT * FROM automation_items WHERE source_id=? AND state IN ('queued','failed') AND article_id IS NULL AND attempts<2 AND original_at>=? ORDER BY original_at DESC").all(source.id,new Date(Date.now()-48*3600000).toISOString());
  for(const item of candidates){
   const total=await db.prepare('SELECT COUNT(*) AS n FROM automation_items WHERE article_id IS NOT NULL').get();if(total.n>=20)break;
   if(!/\/(economia|educacao|cultura|esportes)\/noticia\//.test(item.url)||/Reuters|France.Presse|Associated Press|Agência Lusa/i.test(item.summary))continue;
   const attempts=await db.prepare("SELECT COUNT(*) AS n FROM automation_events WHERE message LIKE 'Lote inicial: tentativa %'").get();if(attempts.n>=24)break;
   const day=dayInSaoPaulo();
   await transaction(db,async()=>{await event(db,'Lote inicial: tentativa '+item.id);await db.prepare('INSERT INTO automation_daily(day) VALUES(?) ON CONFLICT DO NOTHING').run(day);await db.prepare('UPDATE automation_daily SET calls=calls+1 WHERE day=?').run(day);await db.prepare("UPDATE automation_items SET attempts=attempts+1,state='processing',updated_at=? WHERE id=?").run(new Date().toISOString(),item.id);});
   try{
    const {result,usage}=await generateNews(item,categories);
    await transaction(db,async()=>{
     const stamp=new Date().toISOString(),body=result.paragraphs.map(p=>'<p>'+escape(p)+'</p>').join('')+'<p>Conteúdo preparado com auxílio de inteligência artificial, a partir de informações da Agência Brasil. <a href="'+escape(item.url)+'">Leia a publicação original</a>.</p>';
     const saved=await db.prepare('INSERT INTO articles(slug,title,summary,body,category,city,byline,cover,cover_alt,credit,sources,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(slugify(result.title).slice(0,100)+'-'+item.id.slice(0,8),result.title,result.summary,body,result.category,result.city,'Giro63 - Redação','/images/og-giro63.png','Arte ilustrativa com a marca Giro63','Arte ilustrativa Giro63',source.name+' — '+item.url,'review',stamp,stamp);
     await assignTags(db,saved.lastInsertRowid,result.tags);
     await db.prepare("UPDATE automation_items SET article_id=?,state='review',note=?,updated_at=? WHERE id=?").run(saved.lastInsertRowid,['Lote inicial: revisão individual pendente.',...result.alerts,result.sensitive?'Tema sensível: revisão obrigatória.':''].filter(Boolean).join(' · '),stamp,item.id);
     await db.prepare('UPDATE automation_daily SET input_tokens=input_tokens+?,output_tokens=output_tokens+? WHERE day=?').run(usage.input,usage.output,day);
    });console.log('Preparado para revisão: '+item.id);
   }catch(error){await db.prepare("UPDATE automation_items SET state='review',note=?,updated_at=? WHERE id=?").run('Lote inicial: geração falhou; '+(/Gemini|JSON|Campos|Texto/.test(error.message)?error.message:'resposta não validada'),new Date().toISOString(),item.id);console.log('Falha controlada: '+item.id);if(/HTTP 429/.test(error.message))break;}
  }
  await event(db,'Lote inicial preparado em revisão. Exceção autorizada de chamadas; quotas normais de automação preservadas.');
 }finally{await db.prepare('DELETE FROM automation_lock WHERE id=? AND owner=?').run('runner',owner);await db.close();}
}
