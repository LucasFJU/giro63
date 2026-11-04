import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { openDatabase, hashPassword } from '../src/db.js';
import { root } from '../src/server.js';

const db = openDatabase(process.env.GIRO63_DATA_DIR || path.join(root, 'data'));

if (db.prepare("SELECT id FROM users WHERE role='editor' AND active=1").get()) {
  console.log('Já existe um editor. Cadastre novos acessos em /admin/equipe.');
  db.close();
  process.exit(0);
}

if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
  console.error('Abra o arquivo "Criar primeiro editor.cmd" em um terminal interativo.');
  db.close();
  process.exit(1);
}

let editor;
let passwordValue;
let confirmation;
let skipLineFeed = false;

function readHidden(prompt) {
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = '';
    let finished = false;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        // Windows terminals can deliver Enter as CR and LF in separate events.
        if (skipLineFeed && character === '\n') {
          skipLineFeed = false;
          continue;
        }
        skipLineFeed = false;

        if (character === '\u0003') {
          finish(new Error('Configuração cancelada.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          skipLineFeed = character === '\r';
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ' && value.length < 200) value += character;
      }
    };

    stdin.on('data', onData);
  });
}

try {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const name = (await rl.question('Nome do editor: ')).trim();
  const email = (await rl.question('E-mail: ')).trim().toLowerCase();
  rl.close();

  if (!name) throw new Error('O nome não pode ficar vazio. Execute o comando novamente.');
  if (name.length > 100) throw new Error('O nome deve ter até 100 caracteres.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Confira o e-mail: use o formato nome@dominio.com.');
  if (email.length > 200) throw new Error('O e-mail deve ter até 200 caracteres.');

  let credentialsAccepted = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    passwordValue = await readHidden('Senha (mínimo 12 caracteres, entrada oculta): ');
    if (passwordValue.length < 12) {
      console.log('A senha precisa ter pelo menos 12 caracteres. Tente novamente.');
      continue;
    }

    confirmation = await readHidden('Confirme a senha: ');
    if (passwordValue !== confirmation) {
      passwordValue = '';
      confirmation = '';
      console.log('As senhas não coincidem. Tente novamente.');
      continue;
    }

    credentialsAccepted = true;
    break;
  }

  if (!credentialsAccepted) throw new Error('Não foi possível confirmar a senha. Execute o comando novamente.');

  db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'editor')")
    .run(name, email, hashPassword(passwordValue));
  console.log('Editor criado. Abra http://localhost:3000/admin para entrar na redação.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  passwordValue = '';
  confirmation = '';
  db.close();
}
