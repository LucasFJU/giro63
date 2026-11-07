import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {openPostgres} from '../src/postgres.js';
import {cloudMedia} from '../src/cloud-media.js';
import {upgradeResponsiveCrops} from '../src/responsive-crops.js';
import {migrateDeploymentMedia} from '../src/deployment-media.js';

const {DATABASE_URL,SUPABASE_URL,SUPABASE_SECRET_KEY}=process.env;
if(!DATABASE_URL||!SUPABASE_SECRET_KEY)throw Error('Configure DATABASE_URL e SUPABASE_SECRET_KEY para este ambiente.');
if(SUPABASE_URL!=='https://tmmsfyubaqnptmstshym.supabase.co')throw Error('SUPABASE_URL deve apontar para o projeto Giro63.');
const db=openPostgres(DATABASE_URL),client=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
try{
  let connection;
  try{connection=new URL(DATABASE_URL);}catch{throw Object.assign(Error('URL de conexão inválida.'),{code:'INVALID_DATABASE_URL'});}
  if(!['postgres:','postgresql:'].includes(connection.protocol)||!connection.password)throw Object.assign(Error('Informe a conexão PostgreSQL completa com senha.'),{code:'INVALID_DATABASE_URL'});
  const manifest=JSON.parse(await readFile(new URL('../migration-assets/manifest.json',import.meta.url),'utf8'));
  const result=await migrateDeploymentMedia({db,storage:client.storage.from(process.env.SUPABASE_STORAGE_BUCKET||'giro63-media'),manifest,readAsset:name=>readFile(new URL('../migration-assets/'+name,import.meta.url))});
  const media=cloudMedia(),storage=client.storage.from(process.env.SUPABASE_STORAGE_BUCKET||'giro63-media');
  const upgraded=await upgradeResponsiveCrops({db,media,read:async name=>{const {data,error}=await storage.download('crops/'+name);if(error)throw Error('Falha na leitura do recorte.');return Buffer.from(await data.arrayBuffer());}});
  console.log('Recortes com versões responsivas: '+upgraded);
  console.log(`Mídias legadas: ${result.transferred} transferidas; ${result.unchanged} já atualizadas ou preservadas.`);
}catch(error){
  // Never include a connection string or key in build logs.
  const category=error.code==='28P01'?'Senha de banco recusada.':error.code==='ENOTFOUND'?'Endereço do banco não encontrado.':/certificate|self.signed|ssl/i.test(error.message)?'Confira o TLS da conexão PostgreSQL.':error.message.startsWith('Não foi possível transferir')?error.message:'Confira a conexão PostgreSQL e as credenciais do Storage.';
  const code=/^[A-Z0-9_]+$/.test(error.code||'')?error.code:/^[A-Za-z]+Error$/.test(error.name||'')?error.name:'UNKNOWN';
  console.error('Migração de mídia interrompida ['+code+']. '+category);process.exitCode=1;
}finally{await db.close();}
