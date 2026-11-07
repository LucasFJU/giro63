import {backup} from 'node:sqlite';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {initializeEditorial} from '../src/editorial-schema.js';
import {migrateAutomationFooters} from '../src/footer-migration.js';
if(process.env.DATABASE_URL)throw Error('Use a migração supervisionada do Supabase para o ambiente de produção.');
const destination=path.resolve('backups',new Date().toISOString().replace(/[:.]/g,'-')+'-creditos');await mkdir(destination,{recursive:true});
const db=openDatabase(process.env.GIRO63_DATA_DIR||path.resolve('data'));
try{await backup(db,path.join(destination,'giro63.sqlite'));await initializeEditorial(db);const result=await migrateAutomationFooters(db,{backup:rows=>writeFile(path.join(destination,'creditos-originais.json'),JSON.stringify(rows,null,2))});await writeFile(path.join(destination,'resultado.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}finally{db.close();}
