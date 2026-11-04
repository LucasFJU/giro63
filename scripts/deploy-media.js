import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {openPostgres} from '../src/postgres.js';
import {migrateDeploymentMedia} from '../src/deployment-media.js';

const {DATABASE_URL,SUPABASE_URL,SUPABASE_SECRET_KEY}=process.env;
if(!DATABASE_URL||!SUPABASE_SECRET_KEY)throw Error('Configure DATABASE_URL e SUPABASE_SECRET_KEY para este ambiente.');
if(SUPABASE_URL!=='https://tmmsfyubaqnptmstshym.supabase.co')throw Error('SUPABASE_URL deve apontar para o projeto Giro63.');
const db=openPostgres(DATABASE_URL),client=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
try{
  const manifest=JSON.parse(await readFile(new URL('../migration-assets/manifest.json',import.meta.url),'utf8'));
  const result=await migrateDeploymentMedia({db,storage:client.storage.from(process.env.SUPABASE_STORAGE_BUCKET||'giro63-media'),manifest,readAsset:name=>readFile(new URL('../migration-assets/'+name,import.meta.url))});
  console.log(`Mídias legadas: ${result.transferred} transferidas; ${result.unchanged} já atualizadas ou preservadas.`);
}catch(error){
  // Never include a connection string or key in build logs.
  const category=error.code==='28P01'?'Senha de banco recusada.':error.code==='ENOTFOUND'?'Endereço do banco não encontrado.':/certificate|self.signed|ssl/i.test(error.message)?'Confira o TLS da conexão PostgreSQL.':error.message.startsWith('Não foi possível transferir')?error.message:'Confira a conexão PostgreSQL e as credenciais do Storage.';
  console.error('Migração de mídia interrompida. '+category);process.exitCode=1;
}finally{await db.close();}
