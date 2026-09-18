// Run after build. Set AQAR_PLAYWRIGHT_MODULE / AQAR_BROWSER_EXECUTABLE if using a bundled runtime.
// Entirely offline: real built UI, intercepted APIs, and synthetic saved results.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const pw=require(process.env.AQAR_PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.AQAR_BROWSER||'webkit';
const {default:worker}=await import('../../dist/server/index.js');
const rows=Array.from({length:30},(_,i)=>({listingId:String(6837497+i),title:`عمارة اختبار ${i}`,url:`https://sa.aqar.fm/test-${6837497+i}`,city:'الخبر',neighborhood:'الثقبة',propertyType:'عمارة',purpose:'sale',price:2000000+i*10000,area:500+i,age:'16',income:160000,yieldPct:8,incomeKind:'actual',status:['مطابقة','قريبة','بيانات ناقصة'][i%3],apartments:10,score:1}));
const browser=await pw[engine].launch({headless:true,...(process.env.AQAR_BROWSER_EXECUTABLE?{executablePath:process.env.AQAR_BROWSER_EXECUTABLE}:{})});
console.log(engine,'launched');
try{
 const desktop=process.env.AQAR_DESKTOP==='1';
 const page=await browser.newPage({viewport:{width:desktop?1280:390,height:844},isMobile:!desktop,hasTouch:!desktop});
 await mkdir(new URL('../../outputs/',import.meta.url),{recursive:true});
 page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='aqar.test')return route.abort();
  const path=url.pathname;
  if(path.startsWith('/api/')){
   assert.notEqual(path,'/api/search','No real or simulated search required');
   let data={};
   if(path==='/api/trial')data={remaining:100,limit:100,globalRemaining:1000};
   if(path==='/api/profiles')data={profiles:[]};
   if(path==='/api/saved-results')data={sets:[{id:1,name:'اختبار التمرير',propertyType:'عمارة',count:rows.length,resultsJson:JSON.stringify(rows)}]};
   return route.fulfill({json:data});
  }
  if(path.startsWith('/_next/'))return route.fulfill({body:await readFile(new URL('../../dist/client'+path,import.meta.url)),contentType:path.endsWith('.css')?'text/css':'text/javascript'});
  const response=await worker.fetch(new Request(url,{headers:{accept:'text/html'}}),{ASSETS:{fetch:async()=>new Response('',{status:404})}},{waitUntil(){},passThroughOnException(){}});
  return route.fulfill({status:response.status,body:await response.text(),contentType:'text/html'});
 });
 await page.goto('https://aqar.test/');
 console.log(engine,'loaded');
 await page.getByRole('button',{name:'نتائج محفوظة',exact:true}).click();
 await page.getByRole('button',{name:'فتح',exact:true}).click();
 const frame=page.locator('.resultsTableFrame').first(),scroll=frame.locator('.resultsTableWrap'),fixed=frame.locator('.resultsPinnedPane');
 await fixed.waitFor({state:'visible'});
 await frame.scrollIntoViewIfNeeded();
 await page.evaluate(()=>document.documentElement.style.scrollBehavior='auto');
 const nextFrame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 async function stable(firstKey){
  assert.equal(await fixed.locator('th').getAttribute('data-column-key'),firstKey);
  const baseline=await fixed.locator('tbody tr').first().boundingBox();
  const values=await fixed.locator('tbody td').allTextContents();
  const painted=async()=>{
   const box=await fixed.boundingBox();
   // Exclude rounded transparent corners that legitimately reveal scrolling cells below.
   return page.screenshot({animations:'disabled',clip:{x:box.x+15,y:box.y+15,width:box.width-30,height:box.height-30}});
  };
  const image=await painted();
  for(const x of [-100,-500,-1000,0]){
   await scroll.evaluate((e,x)=>{e.scrollLeft=x},x);await nextFrame();
   const box=await fixed.locator('tbody tr').first().boundingBox();
   assert.ok(Math.abs(box.x-baseline.x)<1,'first column moved horizontally');
   assert.deepEqual(await fixed.locator('tbody td').allTextContents(),values);
   // Pixel comparison catches painted text disappearing even when DOM rectangles remain correct.
   const after=await painted();
   if(!image.equals(after)){
    await writeFile(new URL('../../outputs/pin-before.png',import.meta.url),image);
    await writeFile(new URL('../../outputs/pin-after.png',import.meta.url),after);
   }
   assert.ok(image.equals(after),`frozen column pixels changed at ${x}`);
  }
 }
 await stable('price');
 // Vertical synchronization in both directions and exact row alignment.
 for(const pane of [scroll,fixed]){
  await pane.evaluate(e=>e.scrollTop=180);await nextFrame();
  assert.ok(Math.abs(await scroll.evaluate(e=>e.scrollTop)-await fixed.evaluate(e=>e.scrollTop))<1);
  const source=await scroll.locator('tbody tr').nth(8).boundingBox(),target=await fixed.locator('tbody tr').nth(8).boundingBox();
  assert.ok(Math.abs(source.y-target.y)<1,'rows drift vertically');
  await pane.evaluate(e=>e.scrollTop=0);await nextFrame();
 }
 await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);await nextFrame();
 const endSource=await scroll.locator('tbody tr').last().boundingBox(),endTarget=await fixed.locator('tbody tr').last().boundingBox();
 assert.ok(Math.abs(endSource.y-endTarget.y)<1,'last row drifts at the bottom');
 await scroll.evaluate(e=>e.scrollTop=0);await nextFrame();
 // Sorting changes both panes using the same data.
 await fixed.locator('.sortHeader').click();
 assert.equal(await fixed.locator('tbody td').first().getAttribute('data-listing-id'),rows[0].listingId);
 await fixed.locator('.sortHeader').click();
 assert.equal(await fixed.locator('tbody td').first().getAttribute('data-listing-id'),rows.at(-1).listingId);
 // Move area into first position; test resizing and reloading persisted order.
 await scroll.locator('[data-column-key="area"] .columnDragHandle').press('ArrowRight');
 await nextFrame();await stable('area');
 const before=(await fixed.boundingBox()).width;
 await fixed.locator('.columnResizeHandle').press('ArrowLeft');await nextFrame();
 assert.ok((await fixed.boundingBox()).width>before);
 await stable('area');
 // Restore price, open actions, verify the menu is visible and functional.
 await fixed.locator('.columnDragHandle').press('ArrowLeft');await nextFrame();
 await fixed.locator('summary').first().click();
 const menu=fixed.getByRole('menuitemcheckbox').first();await menu.waitFor({state:'visible'});
 const menuBox=await menu.boundingBox(),paneBox=await fixed.boundingBox();
 assert.ok(menuBox.x>=paneBox.x&&menuBox.x+menuBox.width<=paneBox.x+paneBox.width+1,'action menu clipped horizontally');
 await menu.click();
 assert.match(await page.getByRole('button',{name:/^المفضلة/}).textContent(),/1/);
 // Horizontal swipe beginning inside the frozen column still scrolls the data pane.
 await fixed.evaluate(e=>{
  const send=(type,x)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:type==='touchend'?[]:[{identifier:1,target:e,clientX:x,clientY:200}]});e.dispatchEvent(event)};
  send('touchstart',250);send('touchmove',300);send('touchend',300);
 });
 await nextFrame();assert.ok(await scroll.evaluate(e=>e.scrollLeft)<0);
 await scroll.evaluate(e=>{e.scrollLeft=0;e.scrollTop=0});await nextFrame();
 await mkdir(new URL('../../outputs/',import.meta.url),{recursive:true});
 await frame.screenshot({path:fileURLToPath(new URL(`../../outputs/first-column-${engine}.png`,import.meta.url))});
 // Restore a non-price first column from local storage after reload.
 await fixed.locator('.columnDragHandle').press('ArrowLeft');await nextFrame();
 await page.reload();
 await page.getByRole('button',{name:'نتائج محفوظة',exact:true}).click();
 await page.getByRole('button',{name:'فتح',exact:true}).click();
 await fixed.waitFor({state:'visible'});await frame.scrollIntoViewIfNeeded();
 assert.equal(await fixed.locator('th').getAttribute('data-column-key'),'area');
 // Favorites use the same fixed-column implementation.
 await page.getByRole('button',{name:/^المفضلة/}).click();
 await page.locator('#favorite-results .resultsPinnedPane').waitFor({state:'visible'});
 assert.equal(await page.locator('#favorite-results .resultsPinnedPane th').getAttribute('data-column-key'),'area');
 assert.deepEqual(errors,[]);
 console.log(`${engine}: PASS — fixed-column pixels, scroll sync, sorting, reordering, resizing, actions, touch swipe`);
}finally{await browser.close()}
