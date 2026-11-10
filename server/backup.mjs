import {mkdirSync,readdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {openVisitorStore} from './store.mjs';
const directory=process.env.BACKUP_DIRECTORY||'/var/lib/tiny-tashkent/backups';
mkdirSync(directory,{recursive:true,mode:0o700});
const db=openVisitorStore(process.env.DATABASE_PATH||'/var/lib/tiny-tashkent/visitors.sqlite');
try{db.backup(join(directory,'visitors-'+new Date().toISOString().replaceAll(':','-')+'.sqlite'));}finally{db.close();}
const files=readdirSync(directory).filter(f=>/^visitors-[\dTZ.\-]+\.sqlite$/.test(f)).sort().reverse();
for(const file of files.slice(14))unlinkSync(join(directory,file));
console.log('Visitor database backup completed');
