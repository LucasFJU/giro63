import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {hashPassword} from '../src/db.js';
import {createApp} from '../src/server.js';

const login=async(app,email)=>{const agent=request.agent(app),page=await agent.get('/admin/login'),csrf=page.text.match(/name="_csrf" value="([^"]+)"/)[1];await agent.post('/admin/login').type('form').send({_csrf:csrf,email,password:'Senha de teste editorial!'}).expect(302);return agent;};

test('painel: camada de design, navegação acessível por perfil e visão geral com atalhos',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'giro63-admin-ui-')),app=await createApp({dataDir:dir,uploadDir:path.join(dir,'uploads')}),db=app.locals.db;
 try{
  for(const [role,name] of [['author','Paulo Autor'],['editor','Marina Editora']])await db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name,role+'@example.test',hashPassword('Senha de teste editorial!'),role);

  const editor=await login(app,'editor@example.test');
  const home=(await editor.get('/admin').expect(200)).text;
  assert.match(home,/href="\/admin-ui\.css/);                                   // camada de design carregada
  assert.match(home,/<a href="\/admin" class="current" aria-current="page"/);    // item atual anunciado a leitores de tela
  assert.match(home,/class="nav-icon"[^>]+aria-hidden="true"/);                   // ícones decorativos
  assert.match(home,/class="avatar"[^>]*aria-hidden="true">ME</);                 // iniciais do usuário
  assert.match(home,/class="attention-grid"/);
  assert.match(home,/href="\/admin\/audiencia"/);                                 // atalho só para editores
  assert.doesNotMatch(home,/style="/);                                            // a CSP bloqueia estilos inline
  for(const route of ['/admin/materias','/admin/categorias','/admin/tags','/admin/automacao','/admin/publicidade','/admin/audiencia','/admin/configuracoes','/admin/instagram'])
   assert.match((await editor.get(route).expect(200)).text,/href="\/admin-ui\.css/);
  const list=(await editor.get('/admin/materias?status=archived').expect(200)).text;
  assert.match(list,/class="view-tabs"/);
  assert.match(list,/<a href="\/admin\/materias\?status=archived" class="is-active" aria-current="page">Arquivadas<\/a>/);

  const studio=(await editor.get('/admin/instagram?q=sem-correspondencia').expect(200)).text;
  assert.match(studio,/Estúdio de artes/);assert.match(studio,/Nenhuma matéria encontrada/);
  const author=await login(app,'author@example.test');
  const authorHome=(await author.get('/admin').expect(200)).text;
  assert.doesNotMatch(authorHome,/href="\/admin\/audiencia"/);                    // autor não vê áreas de gestão
  assert.doesNotMatch(authorHome,/href="\/admin\/equipe"/);

  assert.doesNotMatch((await request(app).get('/admin/login').expect(200)).text,/admin-ui\.css/);

  const css=readFileSync(new URL('../public/admin-ui.css',import.meta.url),'utf8');
  assert.match(css,/prefers-reduced-motion/);                                     // respeita movimento reduzido
  assert.match(css,/:focus-visible/);                                             // foco sempre visível
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px/);            // nenhum texto abaixo de 12 px
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
