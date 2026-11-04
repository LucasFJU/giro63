import { copyFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { root } from '../src/server.js';
await mkdir(path.join(root,'public','fonts'),{recursive:true});
for(const [family,weights,styles] of [['source-sans-3',[400,600,700],['normal']],['source-serif-4',[400,600],['normal','italic']]]){
  for(const weight of weights)for(const style of styles){
    if(weight===600&&style==='italic')continue;
    const file=`${family}-latin-${weight}-${style}.woff2`;
    await copyFile(path.join(root,'node_modules','@fontsource',family,'files',file),path.join(root,'public','fonts',file));
  }
  await copyFile(path.join(root,'node_modules','@fontsource',family,'LICENSE'),path.join(root,'public','fonts',family+'-LICENSE.txt'));
}
const photos={cerrado:'photo-1500530855697-b586d89ba3ee',cidade:'photo-1449824913935-59a10b8d2000',campo:'photo-1500382017468-9049fed747ef',cultura:'photo-1513364776144-60967b0f800f',saude:'photo-1576091160399-112ba8d25d1d'};
for(const [name,id]of Object.entries(photos)){
  const file=path.join(root,'public','images',name+'.jpg');try{await access(file);continue;}catch{}
  try{const response=await fetch(`https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=85`);if(!response.ok)throw Error(`HTTP ${response.status}`);await writeFile(file,Buffer.from(await response.arrayBuffer()));console.log(`Imagem local: ${name}`);}catch(e){console.error(`Não foi possível baixar ${name}: ${e.message}`);process.exitCode=1;}
}
console.log('Fontes locais preparadas.');
