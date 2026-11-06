import {openDatabase,seedDemo} from '../src/db.js';
const db=openDatabase(process.env.GIRO63_DATA_DIR||'data');try{seedDemo(db);console.log('Demonstrações locais preparadas explicitamente.');}finally{db.close();}
