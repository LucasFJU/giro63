// Run only after configuring the server credentials in a local ignored env file.
import {createClient} from '@supabase/supabase-js';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {openPostgres} from '../src/postgres.js';
const {DATABASE_URL,SUPABASE_URL,SUPABASE_SECRET_KEY}=process.env;
if(!DATABASE_URL||!SUPABASE_URL||!SUPABASE_SECRET_KEY)throw Error('Configure DATABASE_URL, SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente.');
const client=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),bucket=client.storage.from(process.env.SUPABASE_STORAGE_BUCKET||'giro63-media');
const local=new DatabaseSync(path.resolve(process.env.GIRO63_DATA_DIR||'data','giro63.sqlite'),{readOnly:true}),remote=openPostgres(DATABASE_URL);
let migrated=0;
try{
  for(const [table,column] of [['articles','cover'],['ads','image']]){
    for(const row of local.prepare(`SELECT id,${column} AS image FROM ${table}`).all()){
      if(!row.image.startsWith('/uploads/'))continue;
      const base=path.resolve('public/uploads'),file=path.resolve('public',row.image.slice(1));
      if(!file.startsWith(base+path.sep))throw Error('Caminho de imagem inválido.');
      const extension=path.extname(file).toLowerCase(),mime={'.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'}[extension];
      if(!mime)throw Error('Formato de mídia não permitido.');
      const name='legacy/'+path.basename(file),buffer=await readFile(file);
      const {error}=await bucket.upload(name,buffer,{contentType:mime,upsert:false,cacheControl:'31536000'});
      if(error&&String(error.statusCode)!=='409')throw Error('Falha ao transferir mídia. Confira a conexão e tente novamente.');
      const url=bucket.getPublicUrl(name).data.publicUrl;
      await remote.prepare(`UPDATE ${table} SET ${column}=? WHERE id=? AND ${column}=?`).run(url,row.id,row.image);migrated++;
    }
  }
  console.log(`Mídias conferidas e transferidas: ${migrated}. Os arquivos locais foram preservados.`);
}finally{local.close();await remote.close();}
