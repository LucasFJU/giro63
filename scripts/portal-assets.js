import sharp from 'sharp';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),publicDir=path.join(root,'public');
await mkdir(path.join(publicDir,'icons'),{recursive:true});
const logo=await sharp(path.join(publicDir,'images','giro63-logo-branca.png')).trim().resize({width:780,height:230,fit:'inside'}).toBuffer();
const copy=Buffer.from('<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#102A43"/><rect x="0" y="0" width="1200" height="18" fill="#ED521A"/><text x="600" y="440" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#ffffff">O Tocantins em movimento</text><text x="600" y="495" text-anchor="middle" font-family="sans-serif" font-size="23" fill="#c8d8e4">Notícias · Pessoas · Cidades</text></svg>');
await sharp(copy).composite([{input:logo,gravity:'north',top:150,left:210}]).png().toFile(path.join(publicDir,'images','og-giro63.png'));
for(const [name,size] of [['favicon-16',16],['favicon-32',32],['apple-touch-icon',180],['android-192',192],['android-512',512]]){
 const mark=await sharp(path.join(publicDir,'images','giro63-simbolo-oficial.png')).trim().resize(Math.round(size*.82),Math.round(size*.82),{fit:'inside'}).toBuffer();
 await sharp({create:{width:size,height:size,channels:4,background:'#f5f1e8'}}).composite([{input:mark,gravity:'centre'}]).png().toFile(path.join(publicDir,'icons',name+'.png'));
}
const png=await sharp(path.join(publicDir,'icons','favicon-32.png')).toBuffer();const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=32;header[7]=32;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);await writeFile(path.join(publicDir,'favicon.ico'),Buffer.concat([header,png]));
await writeFile(path.join(publicDir,'site.webmanifest'),JSON.stringify({name:'Giro63 — O Tocantins em movimento',short_name:'Giro63',lang:'pt-BR',start_url:'/',display:'browser',background_color:'#fbfaf7',theme_color:'#ED521A',icons:[{src:'/icons/android-192.png',sizes:'192x192',type:'image/png'},{src:'/icons/android-512.png',sizes:'512x512',type:'image/png'}]},null,2));
console.log('Open Graph, favicons e manifesto gerados localmente.');
