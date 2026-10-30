/* global process, console */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync,spawn} from 'node:child_process';
import {ROUTES} from './routes.mjs';
const root=path.resolve(process.argv[2]||'site');
const release=JSON.parse(await fs.readFile(process.argv[3]||'release.json','utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const assets=['manifest.webmanifest','images/katushka-home-clean.png','images/katushka-share-qr-lab.svg','icons/favicon-v1-32.png','icons/app-icon-v1-192.png','icons/app-icon-v1-512.png','icons/app-icon-v1-maskable-512.png','icons/apple-touch-icon-v1.png'];
function allowed(file){
 if(file==='.nojekyll')return true;
 if(file.includes('\\')||file.split('/').some(p=>!p||p.startsWith('.')||p==='..'))return false;
 if(assets.includes(file)||file==='404.html')return true;
 if(/^_next\/static\/[A-Za-z0-9_./-]+\.(js|css|woff2?)$/.test(file))return true;
 return [...ROUTES,'_not-found'].some(r=>{const p=r?r+'/':'';if(!file.startsWith(p))return false;const n=file.slice(p.length);return n==='index.html'||n==='index.txt'||/^__next[\w.-]*\.txt$/.test(n);});
}
async function walk(relative=''){
 const out=[];for(const e of await fs.readdir(path.join(root,relative),{withFileTypes:true})){const file=path.posix.join(relative,e.name);assert.ok(!e.isSymbolicLink(),'Symlink refused');if(e.isDirectory())out.push(...await walk(file));else if(e.isFile())out.push(file);else throw Error('Unsupported entry');}return out.sort();
}
assert.equal(release.format,'katushka-lab-static-v1');assert.match(release.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(release.url,'https://katushka-workshop-lab.github.io/katushka-lab/');
assert.ok(Array.isArray(release.files));const expected=release.files.map(f=>f.file).sort();assert.equal(new Set(expected).size,expected.length);assert.deepEqual(await walk(),expected);
for(const f of release.files){assert.ok(allowed(f.file),'Unapproved public file: '+f.file);const bytes=await fs.readFile(path.join(root,f.file));assert.equal(bytes.length,f.bytes,f.file);assert.equal(sha(bytes),f.sha256,f.file);
 if(/\.(js|css|html|txt|svg|webmanifest)$/.test(f.file)){
 const text=bytes.toString();for(const pattern of [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b/,/\/(?:Users|home)\/[A-Za-z0-9_.@-]+\//,/"(?:contacts|ideas|windings|editorDrafts)"\s*:\s*\[\s*\{/,/\/[/*][#@]\s*sourceMappingURL\s*=/])assert.ok(!pattern.test(text),'Unsafe public content: '+f.file);
 if(f.file.endsWith('.html'))for(const m of text.matchAll(/(?:href|src)="(\/[^"\n]*)"/g))assert.ok(m[1].startsWith('/katushka-lab/'),'Wrong asset/navigation path');
 }}
for(const required of ['.nojekyll',...assets,...ROUTES.map(r=>(r?r+'/':'')+'index.html')])assert.ok(expected.includes(required),'Required file missing: '+required);
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.webmanifest'),'utf8'));assert.equal(manifest.name,'KATUШКА LAB');assert.equal(manifest.short_name,'KATUШКА LAB');for(const k of ['id','scope','start_url'])assert.equal(manifest[k],'/katushka-lab/');assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)assert.ok(icon.src.startsWith('/katushka-lab/icons/'));
// Native workflow checks history too: never discard dependencies of cached pages.
if(process.env.GITHUB_ACTIONS==='true'){
 const parent=spawnSync('git',['rev-parse','HEAD^'],{encoding:'utf8'});
 if(parent.status===0){
  const prev=parent.stdout.trim();const listed=spawnSync('git',['ls-tree','-r','--name-only',prev,'--','site/_next/static','site/images','site/icons'],{encoding:'utf8'});assert.equal(listed.status,0);
  for(const file of listed.stdout.trim().split('\n').filter(Boolean)){
   // Stream blobs: public images can exceed spawnSync's default 1 MiB buffer.
   const child=spawn('git',['show',prev+':'+file],{stdio:['ignore','pipe','ignore']});
   const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Unable to read prior dependency: '+file)));});
   const previousHash=createHash('sha256');for await(const chunk of child.stdout)previousHash.update(chunk);await finished;
   assert.equal(sha(await fs.readFile(file)),previousHash.digest('hex'),'Old dependency removed/changed: '+file);
  }
 }
}
console.log('Verified '+release.files.length+' static files, SHA-256, PWA, routes, safety and retained dependencies.');
