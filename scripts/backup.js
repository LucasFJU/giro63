import { backup } from 'node:sqlite';
import { mkdir, cp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from '../src/server.js';
import { openDatabase } from '../src/db.js';
const db=openDatabase(process.env.GIRO63_DATA_DIR||path.join(root,'data'));
const destination=path.join(root,'backups',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(destination,{recursive:true});
try{
  await backup(db,path.join(destination,'giro63.sqlite'));
  const copied=db.prepare('SELECT value FROM settings WHERE key=?').get('name');
  try{await cp(path.join(root,'public','uploads'),path.join(destination,'uploads'),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(path.join(destination,'LEIA-ME.txt'),`Backup de ${copied.value}.\nInclui banco e uploads. Consulte README.md para restaurar. Sessões serão invalidadas na restauração.\n`);
  console.log(`Backup concluído: ${destination}`);
}finally{db.close();}
