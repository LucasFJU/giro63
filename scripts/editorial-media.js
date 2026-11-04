import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { editorialMedia } from '../src/editorial-media.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const db=new DatabaseSync(path.join(process.env.GIRO63_DATA_DIR||path.join(root,'data'),'giro63.sqlite'),{readOnly:true});
const media=editorialMedia({publicDir:path.join(root,'public'),uploadDir:path.join(root,'public','uploads')});
let failed=0;try{for(const {cover} of db.prepare('SELECT DISTINCT cover FROM articles').all()){try{await media.generate(cover);console.log('Versões responsivas:',cover);}catch(error){failed++;console.error('Não foi possível processar',cover,error.message);}}}finally{db.close();}if(failed)process.exitCode=1;
