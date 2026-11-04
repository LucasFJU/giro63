import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const [family,weights] of [['merriweather',[400,700,900]],['inter',[400,600,700,800]]]){
  for(const weight of weights){const filename=`${family}-latin-${weight}-normal.woff2`;await copyFile(path.join(root,'node_modules/@fontsource',family,'files',filename),path.join(root,'public/fonts',filename));}
  await copyFile(path.join(root,'node_modules/@fontsource',family,'LICENSE'),path.join(root,'public/fonts',family+'-LICENSE.txt'));
}
// Logos oficiais em public/images são preservadas sem alterações.
console.log('Fontes preparadas. Logos oficiais preservadas.');
