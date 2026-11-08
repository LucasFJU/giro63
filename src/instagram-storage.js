import {createClient} from '@supabase/supabase-js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
export const SOCIAL_BUCKET='giro63-social';
export function instagramStorage({directory,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY,cloud=!!process.env.DATABASE_URL}={}){
 const client=cloud?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null,storage=client?.storage.from(SOCIAL_BUCKET);
 const checked=name=>{if(!/^[a-f0-9-]+\/[a-f0-9]+-(feed|fallback|story)\.jpg$/.test(name))throw Error('Arquivo social inválido.');return name;};
 return {
  async save(name,bytes){checked(name);if(cloud){const {error}=await storage.upload(name,bytes,{contentType:'image/jpeg',upsert:false});if(error&&error.statusCode!=='409'&&error.statusCode!==409)throw Error('Não foi possível armazenar a arte privada.');}else{await mkdir(path.dirname(path.join(directory,name)),{recursive:true});await writeFile(path.join(directory,name),bytes);}return name;},
  async read(name){checked(name);if(!cloud)return readFile(path.join(directory,name));const {data,error}=await storage.download(name);if(error)throw Error('Arte indisponível.');return Buffer.from(await data.arrayBuffer());},
  async signedUrl(name){checked(name);if(!cloud)throw Error('Envio ao Instagram requer armazenamento HTTPS na nuvem.');const {data,error}=await storage.createSignedUrl(name,86400);if(error)throw Error('Não foi possível disponibilizar a arte à Meta.');return data.signedUrl;}
 };
}
