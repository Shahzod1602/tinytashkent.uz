import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export function openVisitorStore(filename){
  mkdirSync(dirname(filename),{recursive:true,mode:0o700});
  const sqlite=new DatabaseSync(filename);
  sqlite.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS visitors (visitor_hash TEXT PRIMARY KEY NOT NULL);`);
  return {
    prepare(sql){
      const statement=sqlite.prepare(sql);
      return {bind(...args){return {async run(){return statement.run(...args);}};},async first(){return statement.get();}};
    },
    importHashes(hashes){
      if(!Array.isArray(hashes)||!hashes.every(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)))throw Error('Invalid visitor export');
      const insert=sqlite.prepare('INSERT OR IGNORE INTO visitors (visitor_hash) VALUES (?)');
      sqlite.exec('BEGIN IMMEDIATE');
      try{for(const hash of hashes)insert.run(hash);sqlite.exec('COMMIT');}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
      return sqlite.prepare('SELECT COUNT(*) AS total FROM visitors').get().total;
    },
    backup(destination){sqlite.exec("VACUUM INTO '"+destination.replaceAll("'","''")+"'");},
    close(){sqlite.close();}
  };
}
