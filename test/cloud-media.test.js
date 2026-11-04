import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {cloudMedia} from '../src/cloud-media.js';

test('Storage: valida imagem, cria variantes existentes e limpa envio incompleto',async()=>{
  const uploaded=[],removed=[];let fail=false;
  const storage={getPublicUrl:name=>({data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/giro63-media/'+name}}),upload:async(name,buffer)=>{if(fail&&uploaded.length)return {error:{message:'Falha simulada'}};uploaded.push({name,buffer});return {error:null};},remove:async names=>{removed.push(...names);return {error:null};}};
  const media=cloudMedia({url:'https://example.supabase.co',key:'test-server-only',storage});
  const file={buffer:await sharp({create:{width:400,height:200,channels:3,background:'#102a43'}}).png().toBuffer()};
  const url=await media.save(file),image=media.get(url);assert.equal(uploaded.length,3);assert.equal(image.width,400);assert.equal(image.height,200);assert.match(image.srcset,/160w/);assert.match(image.srcset,/320w/);assert.doesNotMatch(image.srcset,/640w/);
  for(const variant of uploaded)assert.equal((await sharp(variant.buffer).metadata()).format,'webp');
  assert.equal(media.get('/images/cerrado.jpg').src,'/images/cerrado.jpg');
  await assert.rejects(media.save({buffer:Buffer.from('arquivo inválido')}));
  uploaded.length=0;fail=true;await assert.rejects(media.save(file),/armazenar/);assert.equal(removed.length,1);
});
