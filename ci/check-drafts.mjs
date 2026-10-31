/* global process, console, window, document, localStorage, Storage, HTMLTextAreaElement, InputEvent, CompositionEvent, PageTransitionEvent, URL, DOMException, crypto */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {startMirrorServer} from './serve.mjs';
const output=path.resolve(process.env.KATUSHKA_TEST_OUTPUT);await fs.mkdir(output);
const pw=await import(pathToFileURL(path.join(process.env.KATUSHKA_PLAYWRIGHT_PATH,'index.mjs')).href);
const pkg=process.env.KATUSHKA_TEST_PACKAGE||'lab-package',old=process.env.KATUSHKA_TEST_PREVIOUS_PACKAGE||null;
const lab=process.env.KATUSHKA_TEST_LAB==='1',prefix=lab?'/katushka-lab/':'/katushka-pwa-mirror/';
const key=lab?'katushka.lab.contacts.v1':'katushka.mirror.katushka-pwa-mirror.contacts.v1',draftPrefix=key+'.drafts.v1.';
const dkey=id=>draftPrefix+(id===null?'new':'history.'+encodeURIComponent(id));
const hash=text=>createHash('sha256').update(text).digest('hex');
const server=await startMirrorServer(old||pkg,3063,prefix);
const result={syntheticOnly:true,physicalDevicesTested:false,realSystemDictationTested:false,network:'Loopback only; new disposable persistent profiles',engines:[]};
const fixture=id=>({id,createdAt:'2026-10-01T10:00:00.000Z',name:'Синтетический '+id,metAt:'Вымышленная встреча',discussed:'',impressions:'',agreements:'',details:{version:1,story:'Первый рассказ '+id,originalStory:'  Исходник '+id+'\n  ',organization:'',position:'',meetingDate:'',circumstances:'',nextActions:'',dueDate:'',notes:''}});
try{
 for(const engine of (process.env.KATUSHKA_TEST_ENGINES||'chromium,webkit').split(',')){
  server.usePackage(old||pkg);
  const row={engine,checks:[],errors:[],violations:[],originalHashes:{}};result.engines.push(row);
  const check=text=>{row.checks.push(text);console.log(engine+': '+text);};
  const options={headless:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ru-RU',acceptDownloads:true,...(engine==='chromium'?{executablePath:process.env.KATUSHKA_CHROMIUM_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})};
  const protect=async context=>{
   await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(['http:','https:'].includes(u.protocol)&&(u.origin!==server.origin||!['GET','HEAD'].includes(r.method()))){row.violations.push(u.origin);return route.abort();}return route.continue();});
   context.on('page',p=>{p.on('pageerror',e=>row.errors.push(e.message));p.on('dialog',d=>d.accept());});
  };
  const profile=path.join(output,engine+'-profile');let context=await pw[engine].launchPersistentContext(profile,options);await protect(context);let page=await context.newPage();
  const go=route=>page.goto(server.origin+prefix+route,{waitUntil:'networkidle'});
  const ready=async()=>{await page.locator('[data-testid="winding-draft-status"][data-ready="true"]').waitFor({state:'attached'});};
  const raw=id=>page.evaluate(k=>localStorage.getItem(k),dkey(id));
  const stored=async id=>JSON.parse(await raw(id));
  const contacts=()=>page.evaluate(k=>localStorage.getItem(k),key);
  const gotoNew=async()=>{await go('namotka/');await ready();};
  const gotoAddition=async id=>{await go('namotka/?history='+encodeURIComponent(id));await ready();};
  const saved=()=>page.getByText('Черновик сохранён',{exact:true}).waitFor();
  const restored=()=>page.getByText('Черновик восстановлен',{exact:true}).waitFor();
  try{
   await go('');const fixtures=[fixture('A262'),fixture('B262')];
   await page.evaluate(({key,fixtures})=>{localStorage.setItem(key,JSON.stringify({version:1,contacts:fixtures}));localStorage.setItem('unrelated-project','SYNTHETIC262_UNTOUCHED');localStorage.setItem('katushka.personal-workshop.v1','SYNTHETIC262_WORKSHOP_UNTOUCHED');},{key,fixtures});
   const initialRaw=await contacts();for(const f of fixtures)row.originalHashes[f.id]=hash(f.details.originalStory);
   server.usePackage(pkg);await gotoNew();assert.equal(await raw(null),null);
   await page.getByLabel('Имя человека',{exact:false}).fill('Синтетический новый Д262');await page.getByLabel('Полный рассказ',{exact:true}).fill('  SYNTHETIC262 Начало\n  ');
   const started=Date.now();let segments=0;
   while(Date.now()-started<31_000){await page.getByLabel('Полный рассказ',{exact:true}).pressSequentially(' фрагмент');const value=await page.getByLabel('Полный рассказ',{exact:true}).inputValue();assert.equal((await stored(null)).payload.draft.details.story,value);assert.equal(await page.evaluate(()=>document.activeElement.id),'story');assert.equal(await page.getByLabel('Полный рассказ',{exact:true}).isEditable(),true);segments++;await page.waitForTimeout(850);}
   await page.getByLabel('Полный рассказ',{exact:true}).pressSequentially(' ПОСЛЕДНИЙ');let text=await page.getByLabel('Полный рассказ',{exact:true}).inputValue();assert.equal((await stored(null)).payload.draft.details.story,text);row.continuousInputMs=Date.now()-started;row.inputSegments=segments;
   check('More than 30 seconds of continuous input/pauses: synchronous full saves, last fragment and focus retained');

   text+='\nСинтетическая диктовка — точные слова.';
   await page.getByLabel('Полный рассказ',{exact:true}).evaluate((element,value)=>{
    element.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));element.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertFromDictation',data:'Синтетическая диктовка',isComposing:true}));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(element,value);element.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromDictation',data:'Синтетическая диктовка',isComposing:true}));
   },text);
   assert.equal((await stored(null)).payload.draft.details.story,text);
   await page.getByLabel('Полный рассказ',{exact:true}).dispatchEvent('compositionend',{data:'Синтетическая диктовка'});assert.equal(await page.getByLabel('Полный рассказ',{exact:true}).inputValue(),text);
   const draftID=(await stored(null)).id;check('Composition/beforeinput/input with dictation-like text persist exactly; real phone microphone not simulated');
   await page.getByRole('button',{name:'Проверить перед сохранением',exact:true}).click();await page.getByRole('heading',{name:'Проверьте Намотку',exact:true}).waitFor();const original=text;
   await page.getByRole('button',{name:'Вернуться к редактированию',exact:true}).click();text+='\nИсправление после первого предпросмотра.';await page.getByLabel('Полный рассказ',{exact:true}).fill(text);
   await page.reload({waitUntil:'networkidle'});await ready();await restored();assert.equal(await page.getByLabel('Полный рассказ',{exact:true}).inputValue(),text);assert.equal((await stored(null)).payload.original,original);assert.equal((await stored(null)).id,draftID);
   check('Reload restores all text and stable ID; original first-review text remains separate from later corrections');
   await page.locator('.app-home-link').click();await page.getByRole('link',{name:'Мастерская',exact:true}).click();await page.locator('.app-home-link').click();await page.getByRole('link',{name:'Намотка — сохранить знакомство',exact:true}).click();await ready();assert.equal(await page.getByLabel('Полный рассказ',{exact:true}).inputValue(),text);assert.equal(await contacts(),initialRaw);
   check('Home/Workshop/back-to-form navigation preserves draft and does not mutate saved contacts');
   await context.setOffline(true);text+='\nOFFLINE262';await page.getByLabel('Полный рассказ',{exact:true}).fill(text);assert.equal((await stored(null)).payload.draft.details.story,text);await saved();await context.setOffline(false);await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await page.getByLabel('Полный рассказ',{exact:true}).inputValue(),text);
   check('Offline input in a loaded form saves locally and is restored after reconnection');
   await context.close();context=await pw[engine].launchPersistentContext(profile,options);await protect(context);page=await context.newPage();await gotoNew();await restored();assert.equal(await page.getByLabel('Полный рассказ',{exact:true}).inputValue(),text);assert.equal((await stored(null)).id,draftID);const newRaw=await raw(null);
   check('Full browser process close/relaunch restores the exact unfinished new winding');

   await gotoAddition('A262');await page.getByLabel('Новая Намотка',{exact:true}).fill('  SYNTHETIC262 Дополнение A\n  ');await page.getByLabel('Название Намотки (необязательно)',{exact:true}).fill('Тест A');const aText=await page.getByLabel('Новая Намотка',{exact:true}).inputValue();
   await gotoAddition('B262');await page.getByLabel('Новая Намотка',{exact:true}).fill('SYNTHETIC262 Дополнение B');let bRaw=await raw('B262');await gotoAddition('A262');await restored();assert.equal(await page.getByLabel('Новая Намотка',{exact:true}).inputValue(),aText);assert.equal(await raw('B262'),bRaw);assert.equal(await raw(null),newRaw);assert.equal(await contacts(),initialRaw);
   check('New winding and separate A/B history drafts retain their own IDs, titles, text and source links');
   const aBeforeClose=await stored('A262');await context.setOffline(true);await page.getByLabel('Новая Намотка',{exact:true}).fill(aText+'Дополнение без сети');assert.equal((await stored('A262')).payload.story,aText+'Дополнение без сети');await context.setOffline(false);
   const offlineA=(await stored('A262')).payload.story;await context.close();context=await pw[engine].launchPersistentContext(profile,options);await protect(context);page=await context.newPage();await gotoAddition('A262');await restored();assert.equal(await page.getByLabel('Новая Намотка',{exact:true}).inputValue(),offlineA);assert.equal((await stored('A262')).id,aBeforeClose.id);assert.equal(await raw('B262'),bRaw);assert.equal(await raw(null),newRaw);
   check('Offline addition and full process restart preserve its ID/basis, both history drafts and the separate new winding');
   const other=await context.newPage();await other.goto(server.origin+prefix+'namotka/?history=A262',{waitUntil:'networkidle'});await other.locator('[data-ready="true"]').waitFor({state:'attached'});assert.equal(await other.getByLabel('Новая Намотка',{exact:true}).isEditable(),false);assert.equal(await other.getByRole('button',{name:'Сохранить',exact:true}).isEnabled(),false);
   const independent=await context.newPage();await independent.goto(server.origin+prefix+'namotka/?history=B262',{waitUntil:'networkidle'});await independent.locator('[data-ready="true"]').waitFor({state:'attached'});assert.equal(await independent.getByLabel('Новая Намотка',{exact:true}).isEditable(),true);await independent.getByLabel('Новая Намотка',{exact:true}).fill('SYNTHETIC262 B другая вкладка');await independent.close();bRaw=await raw('B262');
   await page.getByLabel('Новая Намотка',{exact:true}).fill(aText+'Первый редактор');const visibleA=await page.getByLabel('Новая Намотка',{exact:true}).inputValue();
   await other.evaluate(k=>{const r=JSON.parse(localStorage.getItem(k));r.revision=crypto.randomUUID();r.payload.story='SYNTHETIC262 Внешняя новая версия';localStorage.setItem(k,JSON.stringify(r));},dkey('A262'));
   await page.getByRole('alert').filter({hasText:'изменён вне этой вкладки'}).waitFor();assert.equal(await page.getByLabel('Новая Намотка',{exact:true}).inputValue(),visibleA);assert.equal(await page.getByLabel('Новая Намотка',{exact:true}).isEditable(),false);assert.equal((await stored('A262')).payload.story,'SYNTHETIC262 Внешняя новая версия');await other.close();await page.reload({waitUntil:'networkidle'});await ready();await restored();
   check('Same-draft second tab is read-only; different history can edit; external newer revision never overwrites local text or vice versa');

   const aPending=await raw('A262'),aID=(await stored('A262')).id;
   await page.getByRole('button',{name:'Сохранить',exact:true}).evaluate(b=>{b.click();b.click();});await page.getByText('Новая Намотка сохранена в этой истории.',{exact:true}).waitFor();let data=JSON.parse(await contacts());assert.equal(data.contacts[0].windings.length,1);assert.equal(data.contacts[0].windings[0].id,aID);assert.equal(hash(data.contacts[0].details.originalStory),row.originalHashes['A262']);assert.equal((await stored('A262')).state,'saved');assert.equal((await stored('A262')).payload,null);assert.equal(await raw('B262'),bRaw);assert.equal(await raw(null),newRaw);
   await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:dkey('A262'),raw:aPending});await gotoAddition('A262');await restored();await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByText('Новая Намотка сохранена в этой истории.',{exact:true}).waitFor();assert.equal(JSON.parse(await contacts()).contacts[0].windings.length,1);
   check('Addition finalization clears only A; double Save and interrupted post-save cleanup never duplicate the winding');
   await gotoNew();await page.getByRole('button',{name:'Проверить перед сохранением',exact:true}).click();await page.getByRole('button',{name:'Подтвердить и сохранить Намотку',exact:true}).evaluate(b=>{b.click();b.click();});await page.getByText('Намотка и полный рассказ сохранены в этом браузере.').waitFor();data=JSON.parse(await contacts());assert.equal(data.contacts.length,3);const created=data.contacts.find(c=>c.id===draftID);assert.equal(created.details.story,text);assert.equal(created.details.originalStory,original);assert.equal((await stored(null)).payload,null);assert.equal(await raw('B262'),bRaw);
   await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:dkey(null),raw:newRaw});await gotoNew();await page.getByRole('button',{name:'Проверить перед сохранением',exact:true}).click();await page.getByRole('button',{name:'Подтвердить и сохранить Намотку',exact:true}).click();await page.getByText('Намотка и полный рассказ сохранены в этом браузере.').waitFor();assert.equal(JSON.parse(await contacts()).contacts.length,3);assert.deepEqual(JSON.parse(await contacts()),data);
   check('New winding finalization preserves originalStory and stable ID; restored stale draft cannot create a duplicate');
   await gotoAddition('A262');await page.getByLabel('Новая Намотка',{exact:true}).fill('SYNTHETIC262 Удаляемый черновик');const beforeDelete=await contacts(),pendingDelete=await raw('A262');await page.getByRole('button',{name:'Удалить черновик',exact:true}).click();await page.getByRole('button',{name:'Продолжить дополнение',exact:true}).click();assert.equal(await raw('A262'),pendingDelete);await page.getByRole('button',{name:'Удалить черновик',exact:true}).click();await page.getByRole('button',{name:'Удалить только это дополнение',exact:true}).click();assert.equal((await stored('A262')).state,'discarded');assert.equal((await stored('A262')).payload,null);assert.equal(await raw('B262'),bRaw);assert.equal(await contacts(),beforeDelete);
   check('Explicit Delete draft/reconsider/confirm changes only the selected draft, never saved histories');

   await gotoAddition('B262');await page.getByLabel('Новая Намотка',{exact:true}).focus();
   await page.evaluate(prefix=>{const native=Storage.prototype.setItem;window.__draftWriteFailure=true;Storage.prototype.setItem=function(k,v){if(k.startsWith(prefix)&&window.__draftWriteFailure)throw new DOMException('Synthetic quota','QuotaExceededError');return native.call(this,k,v);};},draftPrefix);
   const failedText='SYNTHETIC262 B ошибка записи — последний фрагмент';await page.getByLabel('Новая Намотка',{exact:true}).fill(failedText);await page.getByRole('alert').filter({hasText:'Не удалось сохранить черновик'}).waitFor();assert.equal(await page.getByLabel('Новая Намотка',{exact:true}).inputValue(),failedText);assert.equal(await page.getByLabel('Новая Намотка',{exact:true}).isEditable(),true);assert.equal(await raw('B262'),bRaw);assert.equal(await page.getByText('Черновик сохранён',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>document.activeElement.id),'addition-story');
   await page.evaluate(()=>{window.__draftWriteFailure=false;});await page.getByLabel('Новая Намотка',{exact:true}).pressSequentially(' + повтор');await saved();assert.equal((await stored('B262')).payload.story,failedText+' + повтор');bRaw=await raw('B262');await page.screenshot({path:path.join(output,engine+'-restored-addition.png')});
   check('Quota error retains latest input and focus without false Saved; next input saves the entire failed fragment too');

   await gotoNew();await page.getByLabel('Имя человека',{exact:false}).fill('Синтетический сбой очистки');await page.getByLabel('Полный рассказ',{exact:true}).fill('SYNTHETIC262 Готовая Намотка');await page.getByRole('button',{name:'Проверить перед сохранением',exact:true}).click();const cleanupID=(await stored(null)).id;
   await page.evaluate(prefix=>{const native=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith(prefix)&&JSON.parse(v).state==='saved')throw new DOMException('Synthetic cleanup failure','QuotaExceededError');return native.call(this,k,v);};},draftPrefix);
   await page.getByRole('button',{name:'Подтвердить и сохранить Намотку',exact:true}).click();await page.getByRole('alert').filter({hasText:'Намотка сохранена, но черновик не удалён'}).waitFor();assert.equal(JSON.parse(await contacts()).contacts.filter(c=>c.id===cleanupID).length,1);assert.equal((await stored(null)).state,'active');
   await gotoNew();await page.getByRole('button',{name:'Проверить перед сохранением',exact:true}).click();await page.getByRole('button',{name:'Подтвердить и сохранить Намотку',exact:true}).click();await page.getByText('Намотка и полный рассказ сохранены в этом браузере.').waitFor();assert.equal(JSON.parse(await contacts()).contacts.filter(c=>c.id===cleanupID).length,1);assert.equal((await stored(null)).state,'saved');
   check('Real UI cleanup-write failure after a confirmed contact save recovers with the same ID and no duplicate');

   const beforeUpgrade=await page.evaluate(prefix=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>[k,localStorage.getItem(k)])),draftPrefix),contactsBeforeUpgrade=await contacts();
   if(old){server.usePackage(old);await go('namotka/');await go('settings/');assert.deepEqual(await page.evaluate(prefix=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>[k,localStorage.getItem(k)])),draftPrefix),beforeUpgrade);server.usePackage(pkg);await gotoAddition('B262');await restored();assert.equal(await raw('B262'),bRaw);assert.equal(await contacts(),contactsBeforeUpgrade);check('Accepted old client leaves v1 draft keys untouched; new client restores them after version switch');}else{row.previousVersionTested=false;}
   await page.setViewportSize({width:320,height:568});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.getByLabel('Новая Намотка',{exact:true}).focus();await page.setViewportSize({width:320,height:330});assert.equal(await page.getByLabel('Новая Намотка',{exact:true}).isEditable(),true);await page.getByLabel('Новая Намотка',{exact:true}).scrollIntoViewIfNeeded();assert.ok(await page.locator('.app-home-link').isVisible());
   const beforePause=await raw('B262');await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.getByRole('button',{name:'Продолжить работу',exact:true}).waitFor();assert.equal(await page.getByLabel('Новая Намотка',{exact:true}).isEditable(),false);const continued=page.waitForEvent('load');await page.getByRole('button',{name:'Продолжить работу',exact:true}).click();await continued;await page.waitForLoadState('networkidle');await ready();await restored();assert.equal(await raw('B262'),beforePause);assert.equal(await page.getByLabel('Новая Намотка',{exact:true}).isEditable(),true);
   check('Pagehide/BFCache-like pause provides an explicit safe Continue action and restores the exact persisted draft');
   assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-project')),'SYNTHETIC262_UNTOUCHED');assert.equal(await page.evaluate(()=>localStorage.getItem('katushka.personal-workshop.v1')),'SYNTHETIC262_WORKSHOP_UNTOUCHED');check('320px and keyboard viewport preserve editing/Home; unrelated keys remain untouched');

   const bad=await pw[engine].launchPersistentContext(path.join(output,engine+'-bad-storage'),options);await protect(bad);
   try{await bad.addInitScript(prefix=>{const native=Storage.prototype.getItem;Storage.prototype.getItem=function(k){if(k.startsWith(prefix))throw new DOMException('Synthetic read error','SecurityError');return native.call(this,k);};},draftPrefix);const p=await bad.newPage();await p.goto(server.origin+prefix+'namotka/',{waitUntil:'networkidle'});await p.getByRole('alert').filter({hasText:'Не удалось открыть черновик'}).waitFor();assert.equal(await p.getByLabel('Полный рассказ',{exact:true}).isEditable(),false);assert.equal(await p.getByText('Черновик сохранён',{exact:true}).count(),0);}finally{await bad.close();}
   check('Unavailable localStorage shows a warning/read-only form, never a false protection claim');
   const future=await pw[engine].launchPersistentContext(path.join(output,engine+'-future-storage'),options);await protect(future);
   try{const futureRaw=JSON.stringify({format:'katushka-winding-draft',version:99,payload:'SYNTHETIC262_KEEP'});await future.addInitScript(({key,raw,origin})=>{if(window.location.origin===origin)localStorage.setItem(key,raw);},{key:dkey(null),raw:futureRaw,origin:server.origin});const p=await future.newPage();await p.goto(server.origin+prefix+'namotka/',{waitUntil:'networkidle'});await p.getByRole('alert').filter({hasText:'Формат черновика не поддерживается'}).waitFor();assert.equal(await p.evaluate(k=>localStorage.getItem(k),dkey(null)),futureRaw);assert.equal(await p.getByLabel('Полный рассказ',{exact:true}).isEditable(),false);}finally{await future.close();}
   check('Unsupported future draft remains byte-for-byte intact and cannot be silently overwritten');
   data=JSON.parse(await contacts());for(const id of ['A262','B262'])assert.equal(hash(data.contacts.find(c=>c.id===id).details.originalStory),row.originalHashes[id]);assert.deepEqual(row.errors,[]);assert.deepEqual(row.violations,[]);row.ok=true;
  }catch(error){row.ok=false;row.failure=String(error.stack);await page.screenshot({path:path.join(output,engine+'-failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{await context.close();await fs.writeFile(path.join(output,'draft-browser-results.json'),JSON.stringify(result,null,2)+'\n');}
 }
 result.ok=true;
}finally{await server.close();await fs.writeFile(path.join(output,'draft-browser-results.json'),JSON.stringify(result,null,2)+'\n');}
