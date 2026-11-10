import {readFileSync} from 'node:fs';
import {openVisitorStore} from './store.mjs';
const db=openVisitorStore(process.env.DATABASE_PATH||'/var/lib/tiny-tashkent/visitors.sqlite');
try{console.log(JSON.stringify({total:db.importHashes(JSON.parse(readFileSync(0,'utf8')))}));}finally{db.close();}
