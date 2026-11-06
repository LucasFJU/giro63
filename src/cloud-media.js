import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import {readFileSync} from 'node:fs';
let bundledMedia={};
try{bundledMedia=JSON.parse(readFileSync(new URL('../public/images/responsive/manifest.json',import.meta.url),'utf8'));}catch{}

export function cloudMedia({url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY,bucket=process.env.SUPABASE_STORAGE_BUCKET||'giro63-media',storage:providedStorage}={}){
  if(!url||!key)throw Error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY no servidor.');
  const storage=providedStorage||createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from(bucket);
  const publicUrl=name=>storage.getPublicUrl(name).data.publicUrl;
  return {
    publicOrigin:new URL(url).origin,
    get(source){
      if(bundledMedia[source])return bundledMedia[source];
      if(!source?.startsWith(publicUrl('editorial/')))return {src:source||'/images/cerrado.jpg',srcset:''};
      const prefix=source.replace(/\.webp$/,'');
      const dimensions=source.match(/-(\d+)x(\d+)\.webp$/),width=Number(dimensions?.[1]),height=Number(dimensions?.[2]);
      return {src:source,srcset:[160,320,640,960,1600].filter(w=>!width||w<=width).map(w=>`${prefix}-${w}.webp ${w}w`).join(', '),...(width?{width,height}:{})};
    },
    async save(file){
      if(!file)return null;
      const image=sharp(file.buffer,{limitInputPixels:25e6}),meta=await image.metadata();
      if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw Error('Use JPG, PNG ou WebP estático.');
      const original=await image.clone().rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
      const prefix='editorial/'+randomBytes(20).toString('hex')+'-'+original.info.width+'x'+original.info.height;const uploaded=[];
      try{
        for(const width of [0,...[160,320,640,960,1600].filter(w=>w<=original.info.width)]){
          const name=prefix+(width?'-'+width:'')+'.webp';
          const buffer=width?await sharp(original.data).resize({width,withoutEnlargement:true}).webp({quality:80}).toBuffer():original.data;
          const {error}=await storage.upload(name,buffer,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
          if(error)throw Error('Não foi possível armazenar a imagem. Tente novamente.');uploaded.push(name);
        }
        return publicUrl(prefix+'.webp');
      }catch(error){if(uploaded.length)await storage.remove(uploaded);throw error;}
    },
    async saveVariant(buffer){
      const name='crops/'+randomBytes(20).toString('hex')+'.webp';const {error}=await storage.upload(name,buffer,{contentType:'image/webp',cacheControl:'31536000',upsert:false});if(error)throw Error('Não foi possível armazenar os recortes da imagem.');return publicUrl(name);
    },
    async generate(){}
  };
}
