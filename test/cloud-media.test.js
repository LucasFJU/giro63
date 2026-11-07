import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {upgradeResponsiveCrops} from '../src/responsive-crops.js';
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

test('recortes novos têm srcset apenas para arquivos realmente enviados',async()=>{
 const uploaded=[],storage={getPublicUrl:name=>({data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/giro63-media/'+name}}),upload:async(name,buffer)=>{uploaded.push({name,buffer});return {error:null};},remove:async()=>({error:null})};
 const media=cloudMedia({url:'https://example.supabase.co',key:'test',storage}),buffer=await sharp({create:{width:640,height:388,channels:3,background:'#123456'}}).webp().toBuffer(),url=await media.saveVariant(buffer),image=media.get(url);
 assert.equal(image.width,640);assert.match(image.srcset,/160w/);assert.match(image.srcset,/640w/);assert.doesNotMatch(image.srcset,/960w/);
 for(const entry of image.srcset.split(', ')){const [asset,width]=entry.split(' '),saved=uploaded.find(u=>asset.endsWith(u.name));assert.ok(saved);assert.equal((await sharp(saved.buffer).metadata()).width,parseInt(width));}
 assert.equal(media.get('https://example.supabase.co/storage/v1/object/public/giro63-media/crops/old.webp').srcset,'');
});

test('atualização dos recortes é idempotente e não substitui edição concorrente',async()=>{
 const origin='https://example.supabase.co',prefix=origin+'/storage/v1/object/public/giro63-media/crops/',old=prefix+'abc.webp',next=prefix+'new-640x388.webp';
 const rows=[{id:1,photo_cover:old,photo_thumb:old,cover:'original.jpg',photo_share:'share.jpg'}];let saves=0;
 const db={prepare:sql=>({all:async()=>rows.map(r=>({...r})),run:async(value,id,expected)=>{const field=/SET (\w+)=/.exec(sql)[1],r=rows.find(r=>r.id===id);if(r[field]!==expected)return {changes:0};r[field]=value;return {changes:1};}})};
 const media={publicOrigin:origin,saveVariant:async()=>{saves++;return next;}};
 assert.equal(await upgradeResponsiveCrops({db,media,read:async()=>Buffer.from('crop')}),2);assert.equal(saves,1);assert.equal(await upgradeResponsiveCrops({db,media,read:async()=>{throw Error('Não deve ler novamente');}}),0);assert.equal(rows[0].cover,'original.jpg');assert.equal(rows[0].photo_share,'share.jpg');
 rows[0].photo_thumb=old;assert.equal(await upgradeResponsiveCrops({db,media,read:async()=>{rows[0].photo_thumb='edicao-nova.webp';return Buffer.from('crop');}}),0);assert.equal(rows[0].photo_thumb,'edicao-nova.webp');
});
