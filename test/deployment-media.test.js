import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrateDeploymentMedia} from '../src/deployment-media.js';

test('migração de arte é condicional, recupera duplicação e preserva mudanças da redação',async()=>{
  const filename='a'.repeat(40)+'.webp',item={table:'ads',column:'image',id:1,oldUrl:'/uploads/'+filename,filename};
  let image=item.oldUrl,uploads=0,updates=0,fail=false;
  const db={prepare:sql=>({get:async()=>({image}),run:async(url,id,expected)=>{assert.match(sql,/WHERE id=\? AND image=\?/);if(image!==expected)return {changes:0};image=url;updates++;return {changes:1};}})};
  const storage={upload:async()=>{uploads++;return {error:fail?{statusCode:'403'}:{statusCode:'409'}};},getPublicUrl:name=>({data:{publicUrl:'https://storage.example/'+name}})};
  const options={db,storage,manifest:[item],readAsset:async()=>Buffer.from('arte')};
  assert.equal((await migrateDeploymentMedia(options)).transferred,1);assert.equal(updates,1);
  assert.equal((await migrateDeploymentMedia(options)).unchanged,1);assert.equal(uploads,1);
  image='https://storage.example/nova-arte.webp';assert.equal((await migrateDeploymentMedia(options)).unchanged,1);assert.equal(uploads,1);
  image=item.oldUrl;fail=true;await assert.rejects(migrateDeploymentMedia(options),/transferir/);assert.equal(image,item.oldUrl);
  await assert.rejects(migrateDeploymentMedia({...options,manifest:[{...item,filename:'../arquivo'}]}),/Manifesto/);
});
