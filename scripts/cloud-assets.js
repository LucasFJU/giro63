import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('public/images/responsive'),manifest={};await mkdir(output,{recursive:true});
for(const name of ['campo','cerrado','cidade','cultura','saude','palmas','jalapao']){
  const image=sharp(path.resolve('public/images',name+'.jpg')),meta=await image.metadata(),widths=[160,320,640,960,1600].filter(w=>w<=(meta.autoOrient?.width||meta.width));
  for(const width of widths)await image.clone().rotate().resize({width,withoutEnlargement:true}).webp({quality:80}).toFile(path.join(output,name+'-'+width+'.webp'));
  manifest['/images/'+name+'.jpg']={src:'/images/'+name+'.jpg',srcset:widths.map(w=>`/images/responsive/${name}-${w}.webp ${w}w`).join(', '),width:meta.autoOrient?.width||meta.width,height:meta.autoOrient?.height||meta.height};
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest));console.log('Versões responsivas estáticas preparadas.');
