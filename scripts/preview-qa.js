// Ambiente descartável para verificar o painel sem criar contas no banco real.
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { hashPassword } from '../src/db.js';
const directory=mkdtempSync(path.join(os.tmpdir(),'giro63-browser-qa-'));
const app=(await createApp({dataDir:directory,uploadDir:path.join(directory,'uploads')}));
(await app.locals.db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'editor')").run('Editor de validação','qa@example.test',hashPassword('ValidacaoLocal63!')));
const server=app.listen(3001,'127.0.0.1',()=>console.log('Ambiente descartável de QA em http://localhost:3001. Banco principal não é utilizado.'));
function stop(){server.close(()=>{app.locals.db.close();rmSync(directory,{recursive:true,force:true});process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
