// Offline integration test against the built UI, including the mobile WebKit engine.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const pw=createRequire(import.meta.url)(process.env.AQAR_PLAYWRIGHT_MODULE||'playwright');
const {default:worker}=await import('../../dist/server/index.js');
const engine=process.env.AQAR_BROWSER||'webkit';
const browser=await pw[engine].launch({headless:true,...(process.env.AQAR_BROWSER_EXECUTABLE?{executablePath:process.env.AQAR_BROWSER_EXECUTABLE}:{})});
const makeRows=offset=>['الدمام','الدمام','الخبر','جدة','الخرج'].map((city,i)=>({listingId:String(7000000+offset+i),url:`https://sa.aqar.fm/عمائر-للبيع/${city}/عقار-${7000000+offset+i}`,title:`اختبار ${city} ${i}`,city,neighborhood:'طيبة',propertyType:i===1?'فيلا':'عمارة',price:i===1?1000000:2000000,age:'16',description:'موقف سيارة',status:'مطابقة',score:100,nearEligible:true}));
const rows=makeRows(0),archived=makeRows(100),favorites=makeRows(200);
try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.setDefaultTimeout(8000);
  const errors=[],requests=[];let savedRows;
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({archived,favorites})=>{
    localStorage.setItem('aqar-archived-listings-v1',JSON.stringify(archived));
    localStorage.setItem('aqar-favorite-listings-v1',JSON.stringify(favorites));
  },{archived,favorites});
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(url.hostname!=='aqar.test')return route.abort();
    if(path.startsWith('/api/')){
      requests.push(`${request.method()} ${path}`);
      assert.notEqual(path,'/api/search','Filtering must never search');
      assert.ok(path!='/api/trial'||request.method()==='GET','Filtering must never reserve quota');
      let data={};
      if(path==='/api/trial')data={remaining:100,limit:100,globalRemaining:1000};
      if(path==='/api/profiles')data={profiles:[]};
      if(path==='/api/saved-results'){
        if(request.method()==='POST'){savedRows=request.postDataJSON().results;data={set:{name:'اختبار'}};}
        else data={sets:[{id:1,name:'اختبار التصفية',propertyType:'عام',count:rows.length,resultsJson:JSON.stringify(rows)}]};
      }
      return route.fulfill({json:data});
    }
    if(path.startsWith('/_next/'))return route.fulfill({body:await readFile(new URL('../../dist/client'+path,import.meta.url)),contentType:path.endsWith('.css')?'text/css':'text/javascript'});
    const response=await worker.fetch(new Request(url,{headers:{accept:'text/html'}}),{ASSETS:{fetch:async()=>new Response('',{status:404})}},{waitUntil(){},passThroughOnException(){}});
    return route.fulfill({status:response.status,body:await response.text(),contentType:'text/html'});
  });
  await page.goto('https://aqar.test/');
  await page.getByRole('button',{name:'نتائج محفوظة',exact:true}).click();
  await page.getByRole('button',{name:'فتح',exact:true}).click();
  const main=page.getByRole('region',{name:'جدول مقارنة نتائج العقارات',exact:true});
  const count=async(region,expected)=>{
    await page.waitForFunction(({label,expected})=>document.querySelector(`[aria-label="${label}"]`).querySelectorAll('tbody tr td[data-listing-id]:first-child').length===expected,{label:await region.getAttribute('aria-label'),expected});
  };
  async function allTables(expected){
    await count(main,expected);
    const archiveButton=page.locator('.archiveListButton'),favoriteButton=page.locator('.favoriteListButton');
    if(await archiveButton.getAttribute('aria-expanded')!=='true')await archiveButton.click();
    await count(page.getByRole('region',{name:'جدول العقارات المؤرشفة',exact:true}),expected);
    await favoriteButton.click();
    await count(page.getByRole('region',{name:'جدول العقارات المفضلة',exact:true}),expected);
  }
  await allTables(5);
  const initialRequests=requests.length;
  const city=page.getByRole('combobox',{name:'المدينة',exact:true});
  await city.fill('الدمام');
  await page.getByRole('option',{name:'الدمام',exact:true}).click();
  await allTables(2);
  await page.locator('.propertyKeywordsRow select').selectOption('عمارة');
  await allTables(1);
  await page.getByLabel('السعر إلى',{exact:true}).fill('1500000');
  await allTables(0);
  assert.match(await main.textContent(),/لا توجد عقارات تحقق الشروط الحالية/);
  await page.getByLabel('السعر إلى',{exact:true}).fill('');
  await allTables(1);
  await city.fill('');await city.press('Tab');
  await allTables(4);
  await page.getByRole('button',{name:'مسح الحقول',exact:true}).click();
  await allTables(5);
  assert.equal(requests.length,initialRequests,'Changing filters must not send network requests');
  const stored=await page.evaluate(()=>({archived:JSON.parse(localStorage.getItem('aqar-archived-listings-v1')),favorites:JSON.parse(localStorage.getItem('aqar-favorite-listings-v1'))}));
  assert.deepEqual(stored,{archived,favorites},'Filtering must preserve every original stored row');
  await city.fill('الدمام');await city.press('Tab');
  await page.locator('.propertyKeywordsRow select').selectOption('عمارة');
  await page.getByRole('button',{name:'حفظ هذه النتائج',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.resultSaveStatus')?.textContent.includes('حُفظت'));
  assert.deepEqual(savedRows.map(row=>row.listingId),['7000000'],'Save only visible results');
  assert.deepEqual(errors,[]);
  console.log(`${engine}: all three tables filter immediately; restoring, storage, save and zero-search checks passed`);
}finally{await browser.close();}
