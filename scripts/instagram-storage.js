import {createClient} from '@supabase/supabase-js';
import {SOCIAL_BUCKET} from '../src/instagram-storage.js';
if(process.env.SUPABASE_URL!=='https://tmmsfyubaqnptmstshym.supabase.co'||!process.env.SUPABASE_SECRET_KEY)throw Error('Configure o Storage do Giro63 no ambiente.');
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:buckets,error:listError}=await client.storage.listBuckets();if(listError)throw Error('Não foi possível conferir o bucket privado das artes.');
const existing=buckets.find(b=>b.name===SOCIAL_BUCKET);if(existing?.public)throw Error('O bucket das artes deve ser privado. Confira sua configuração.');
if(!existing){const {error}=await client.storage.createBucket(SOCIAL_BUCKET,{public:false,fileSizeLimit:8388608,allowedMimeTypes:['image/jpeg']});if(error)throw Error('Não foi possível criar o armazenamento privado das artes.');}
console.log('Artes sociais: armazenamento privado verificado.');
