import sharp from 'sharp';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync,statSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';

// Release source file handles after conversion, including on Windows.
sharp.cache({files:0});

export function editorialMedia({publicDir,uploadDir}){
  const output=path.join(uploadDir,'editorial-variants');mkdirSync(output,{recursive:true});
  function source(url){
    if(typeof url!=='string')return null;
    const base=url.startsWith('/uploads/')?uploadDir:url.startsWith('/images/')?path.join(publicDir,'images'):null;
    if(!base)return null;
    const relative=url.replace(/^\/(uploads|images)\//,'');
    const absolute=path.resolve(base,relative);if(!absolute.startsWith(path.resolve(base)+path.sep)||!existsSync(absolute)||!statSync(absolute).isFile())return null;
    const key=createHash('sha256').update(url+':'+statSync(absolute).mtimeMs).digest('hex').slice(0,24);
    return {absolute,key,url};
  }
  function get(url){
    const item=source(url)||source('/images/cerrado.jpg');if(!item)return {src:'/images/cerrado.jpg',srcset:''};
    const widths=[160,320,640,960,1600].filter(w=>existsSync(path.join(output,item.key+'-'+w+'.webp')));
    const metadata=path.join(output,item.key+'.json');let dimensions={};try{if(existsSync(metadata))dimensions=JSON.parse(readFileSync(metadata,'utf8'));}catch{}
    return {src:item.url,srcset:widths.map(w=>'/uploads/editorial-variants/'+item.key+'-'+w+'.webp '+w+'w').join(', '),...dimensions};
  }
  async function generate(url){
    const item=source(url);if(!item)return;
    const meta=await sharp(item.absolute,{limitInputPixels:25e6}).metadata();if(!['jpeg','png','webp'].includes(meta.format))return;
    for(const width of [160,320,640,960,1600]){
      const destination=path.join(output,item.key+'-'+width+'.webp');if(existsSync(destination)||width>(meta.autoOrient?.width||meta.width))continue;
      await sharp(item.absolute,{limitInputPixels:25e6}).rotate().resize({width,withoutEnlargement:true}).webp({quality:80}).toFile(destination);
    }
    writeFileSync(path.join(output,item.key+'.json'),JSON.stringify({width:meta.autoOrient?.width||meta.width,height:meta.autoOrient?.height||meta.height}));
  }
  return {get,generate};
}
