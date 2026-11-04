import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const categories = [
  ['cidades','Cidades'],['politica','Política'],['seguranca','Segurança'],
  ['economia-e-agro','Economia e Agro'],['saude','Saúde'],['cultura-e-turismo','Cultura e Turismo'],['brasil','Brasil']
];
export const cities = ['Palmas','Araguaína','Gurupi','Porto Nacional','Paraíso do Tocantins','Dianópolis','Tocantinópolis','Jalapão'];
export const slugify = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function verifyPassword(password, stored) {
  try { const [salt, hash] = stored.split(':'); const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash,'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); } catch { return false; }
}
export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'giro63.sqlite'));
  db.function('normalize_search',{deterministic:true},value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('author','editor')), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS articles(id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, city TEXT NOT NULL DEFAULT '', author_id INTEGER REFERENCES users(id), byline TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '/images/cerrado.jpg', credit TEXT NOT NULL DEFAULT '', sources TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published')), featured INTEGER NOT NULL DEFAULT 0, urgent INTEGER NOT NULL DEFAULT 0, demo INTEGER NOT NULL DEFAULT 0, feedback TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT);
    CREATE TABLE IF NOT EXISTS ads(id INTEGER PRIMARY KEY, name TEXT NOT NULL, image TEXT NOT NULL, alt TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', position TEXT NOT NULL CHECK(position IN ('top','middle','sidebar')), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS editorial_categories(slug TEXT PRIMARY KEY,name TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0,show_menu INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS articles_public ON articles(status,published_at DESC);
    CREATE INDEX IF NOT EXISTS articles_category ON articles(category,status);
    CREATE TABLE IF NOT EXISTS article_daily_reads(article_id INTEGER NOT NULL REFERENCES articles(id),day TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(article_id,day));
    CREATE INDEX IF NOT EXISTS article_reads_day ON article_daily_reads(day,article_id);
  `);
  if(!db.prepare('PRAGMA table_info(articles)').all().some(c=>c.name==='cover_alt'))db.exec("ALTER TABLE articles ADD COLUMN cover_alt TEXT NOT NULL DEFAULT ''");
  const adColumns=new Set(db.prepare('PRAGMA table_info(ads)').all().map(c=>c.name));
  for(const [name,type] of [['advertiser',"TEXT NOT NULL DEFAULT ''"],['starts_at','TEXT'],['ends_at','TEXT'],['archived','INTEGER NOT NULL DEFAULT 0']])if(!adColumns.has(name))db.exec(`ALTER TABLE ads ADD COLUMN ${name} ${type}`);
  db.exec(`CREATE TABLE IF NOT EXISTS ad_rotation(position TEXT PRIMARY KEY,last_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ad_deliveries(token TEXT PRIMARY KEY,ad_id INTEGER NOT NULL REFERENCES ads(id),expires_at INTEGER NOT NULL,viewed INTEGER NOT NULL DEFAULT 0,clicked INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS ad_deliveries_expiry ON ad_deliveries(expires_at);
    CREATE TABLE IF NOT EXISTS ad_daily(ad_id INTEGER NOT NULL REFERENCES ads(id),day TEXT NOT NULL,impressions INTEGER NOT NULL DEFAULT 0,clicks INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(ad_id,day));`);
  for(const [position,[slug,name]] of categories.entries())db.prepare('INSERT OR IGNORE INTO editorial_categories(slug,name,position) VALUES(?,?,?)').run(slug,name,position);
  const defaults = { name:'Giro63', tagline:'O Tocantins em movimento.', instagram:'', email:'', phone:'', about:'O Giro63 nasce para acompanhar o Tocantins de perto, conectando cidades, pessoas e histórias.', editorial:'Nossa proposta é informar com clareza, conferir as fontes, distinguir opinião de informação e corrigir erros com transparência. Política editorial definitiva: a preencher pela redação.', staff:'Expediente e responsáveis editoriais: a preencher pela redação.' };
  for(const [key,value] of Object.entries(defaults)) db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(key,value);
  return db;
}
export function seedDemo(db) {
  if(db.prepare('SELECT count(*) AS n FROM articles').get().n) return;
  const stories = [
    ['Entre o cerrado e as águas: um novo olhar sobre o Tocantins','Paisagens, cultura e pessoas. Um convite para descobrir as histórias que fazem do nosso estado um lugar singular.','cultura-e-turismo','Jalapão','cerrado',1],
    ['Palmas, uma cidade para viver além da rotina','Os espaços de encontro, a arquitetura e a vida ao ar livre em uma pauta sobre a capital.','cidades','Palmas','cidade',2],
    ['A força de quem produz e transforma o campo','Uma proposta de reportagem sobre os caminhos da produção e os pequenos negócios no interior.','economia-e-agro','Gurupi','campo',3],
    ['As histórias que atravessam gerações em Porto Nacional','Memória, patrimônio e pertencimento em uma pauta dedicada à cultura tocantinense.','cultura-e-turismo','Porto Nacional','cultura',4],
    ['Araguaína em movimento: olhares sobre o cotidiano da cidade','Comércio, bairros e encontros ajudam a construir uma pauta sobre a vida urbana.','cidades','Araguaína','cidade',0],
    ['Informação que cuida: caminhos para falar sobre saúde','Um exemplo de pauta de serviço, com espaço para fontes e orientações verificadas.','saude','Palmas','saude',0],
    ['O que acompanhar nas decisões que afetam sua cidade','Entenda como nossa editoria pretende aproximar o debate público do dia a dia.','politica','Palmas','cultura',0],
    ['Pequenos negócios, grandes conexões com a comunidade','Uma pauta sobre o trabalho de quem empreende perto de casa.','economia-e-agro','Paraíso do Tocantins','campo',0],
    ['Segurança e cidadania: informação a serviço das pessoas','Um exemplo de cobertura voltada a prevenção, serviços e fontes oficiais.','seguranca','Gurupi','cidade',0],
    ['O Brasil que também passa pelo Tocantins','Uma proposta de leitura dos temas nacionais a partir de seus efeitos locais.','brasil','','cerrado',0],
    ['Saberes e sabores que contam a nossa história','Uma pauta para descobrir a cultura local pela culinária e pelas memórias.','cultura-e-turismo','Dianópolis','cultura',0],
    ['Cidades conectadas pelas histórias de seus moradores','Um convite para acompanhar o Tocantins para além da capital.','cidades','Tocantinópolis','cerrado',0],
    ['Turismo com tempo para conhecer e preservar','Uma proposta de reportagem sobre experiências e respeito às paisagens.','cultura-e-turismo','Jalapão','campo',0],
    ['Juventude, trabalho e os próximos passos no interior','Espaço demonstrativo para histórias sobre formação e oportunidades.','economia-e-agro','Araguaína','cidade',0],
    ['Cuidar dos espaços comuns também é cuidar da cidade','Pauta demonstrativa sobre convivência e participação da comunidade.','cidades','Porto Nacional','saude',0],
    ['Cultura que aproxima: vozes e expressões do nosso estado','Uma proposta de encontro com quem cria, ensina e compartilha tradições.','cultura-e-turismo','Palmas','cultura',0]
  ];
  const insert = db.prepare(`INSERT INTO articles(slug,title,summary,body,category,city,byline,cover,credit,sources,status,featured,demo,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,'published',?,1,?,?,?)`);
  stories.forEach(([title,summary,category,city,image,featured],i)=>{
    const time = new Date(Date.now()-i*3600000).toISOString();
    const body = `<p><strong>Conteúdo demonstrativo.</strong> Esta página apresenta a experiência de leitura do Giro63. Não relata um acontecimento apurado nem deve ser compartilhada como notícia real.</p><p>${summary}</p><h2>Um olhar mais próximo do Tocantins</h2><p>Este espaço será preenchido pela redação com informações verificadas, entrevistas e contexto. A proposta do portal é conectar os acontecimentos do estado à vida de quem mora aqui.</p><blockquote>Histórias locais merecem contexto, escuta e informação de qualidade.</blockquote><p>Antes da publicação de uma matéria real, a equipe deverá conferir os fatos, registrar as fontes, identificar a autoria e verificar os direitos de uso das imagens.</p>`;
    const regional=image==='cerrado'?'jalapao':image==='cidade'&&city==='Palmas'?'palmas':image;
    const credit=regional==='jalapao'?'Dunas do Jalapão • Marcelo85photo / Wikimedia Commons • CC BY-SA 3.0. Imagem redimensionada; recorte de exibição.':regional==='palmas'?'Praça dos Girassóis, Palmas • Danniel3d / Wikimedia Commons • CC BY-SA 4.0. Recorte de exibição.':'Fotografia ilustrativa • Unsplash. Não representa necessariamente o local citado.';
    insert.run(slugify(title),title,summary,body,category,city,'Redação demonstrativa',`/images/${regional}.jpg`,credit,'Conteúdo de demonstração; sem apuração jornalística.',featured,time,time,time);
  });
}
