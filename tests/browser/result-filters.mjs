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
  const errors=[],requests=[],searchRequests=[];let savedRows,allowSearch=false,reservations=0,discoveryMode=false,unresolvedMode=false;
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
      if(path==='/api/search'){
        assert.ok(allowSearch,'Filtering must never search');
        assert.equal(request.headers()['x-aqar-trial-token'],'offline-token');
        const payload=request.postDataJSON();searchRequests.push(payload);
        if(discoveryMode){
          if(unresolvedMode)return route.fulfill({status:502,json:{code:'SOURCE_UNRESOLVED',error:'تعذر تحديد مصدر الحي؛ هذا لا يعني عدم وجود عروض فيه.'}});
          const sourceBaseUrl='https://sa.aqar.fm/شقق-للبيع/الدمام/حي-التصنيف-الأوسع';
          if(!payload.sourceDiscovery&&!payload.sourceBaseUrl)return route.fulfill({json:{sourceDiscovery:{pending:[sourceBaseUrl],visited:['https://sa.aqar.fm/شقق-للبيع/الدمام']}}});
          if(payload.page>1)assert.equal(payload.sourceBaseUrl,sourceBaseUrl,'Reuse the discovered source on later pages');
          return route.fulfill({json:{sourceBaseUrl,results:[],discovered:payload.page===1?2:3,checkedListingIds:payload.page===1?['8100001','8100002']:['8100003','8100004','8100005'],warnings:[]}});
        }
        return route.fulfill({json:{results:[],discovered:payload.filters.maxListings,checkedListingIds:Array.from({length:payload.filters.maxListings},(_,i)=>String(8000000+i)),warnings:[]}});
      }
      if(path==='/api/trial'&&request.method()==='POST'){
        assert.ok(allowSearch,'Invalid forms or filtering must never reserve quota');reservations++;
        return route.fulfill({json:{token:'offline-token',status:{remaining:99,limit:100,globalRemaining:999}}});
      }
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
  // A meaningful type OR keywords allows a nationwide search; city alone is insufficient.
  const propertyInput=page.locator('.propertyKeywordsRow select');
  const keywordInput=page.getByPlaceholder('مثل: دوبلكس، موقف، مطبخ، مكيف');
  const excludedInput=page.getByRole('textbox',{name:'مواصفات مستبعدة'});
  const keywordBox=await keywordInput.boundingBox(),excludedBox=await excludedInput.boundingBox();
  assert.ok(keywordBox&&excludedBox&&excludedBox.y>keywordBox.y,'Excluded field sits below keywords');
  const cityInput=page.getByRole('combobox',{name:'المدينة',exact:true});
  const startButton=page.getByRole('button',{name:'ابدأ البحث',exact:true});
  const expectErrors=async expected=>{
    for(const input of [propertyInput,keywordInput]){
      assert.equal(await input.getAttribute('aria-invalid'),String(expected));
      if(expected)assert.equal(await input.evaluate(element=>getComputedStyle(element).borderTopColor),'rgb(191, 48, 48)');
    }
  };
  await expectErrors(false);
  await startButton.click();await expectErrors(true);
  assert.match(await page.locator('.status').textContent(),/عند اختيار «عام»/);
  await cityInput.fill('الدمام');await cityInput.press('Tab');
  await startButton.click();await expectErrors(true);
  assert.equal(reservations,0);
  await cityInput.fill('');await cityInput.press('Tab');
  async function runSearch(expectedCity,expectedCategory){
    allowSearch=true;const before=searchRequests.length,used=reservations;
    const response=page.waitForResponse(response=>response.url().endsWith('/api/search'));
    await startButton.click();await response;
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='ابدأ البحث'&&!button.disabled));
    assert.equal(searchRequests.length,before+1,'Respect maxListings; do not fan out across all cities');
    assert.equal(reservations,used+1,'Only one reservation per search');
    assert.equal(searchRequests.at(-1).city,expectedCity);
    assert.equal(searchRequests.at(-1).category,expectedCategory);
    assert.equal(searchRequests.at(-1).filters.locations.length,expectedCity?1:0);
    await expectErrors(false);allowSearch=false;
  }
  await propertyInput.selectOption('شقة');await expectErrors(false);
  await runSearch('','شقق-للبيع');
  await propertyInput.selectOption('عام');
  for(const word of ['مزرعة','ملعب']){await keywordInput.fill(word);await runSearch('','عقارات');}
  await cityInput.fill('الدمام');await cityInput.press('Tab');
  await runSearch('الدمام','عقارات');
  await page.getByRole('button',{name:'مسح الحقول',exact:true}).click();
  await page.getByRole('button',{name:'تجاري',exact:true}).click();
  await runSearch('','عقارات');
  await page.getByRole('button',{name:'مسح الحقول',exact:true}).click();await expectErrors(false);
  // Discovery continues across requests and pages, but reserves only one trial.
  await propertyInput.selectOption('شقة');
  await cityInput.fill('الدمام');await cityInput.press('Tab');
  await page.getByPlaceholder('ابدأ الكتابة: الروضة…').fill('حي فرعي تجريبي');
  await page.locator('.listingLimit input').fill('5');
  discoveryMode=true;allowSearch=true;
  let discoveryStart=searchRequests.length,quotaStart=reservations;
  await startButton.click();
  await page.waitForFunction(()=>document.querySelector('.status')?.textContent.includes('اكتمل البحث'));
  assert.equal(reservations,quotaStart+1);
  assert.deepEqual(searchRequests.slice(discoveryStart).map(request=>request.page),[1,1,2]);
  assert.deepEqual(searchRequests.at(-1).excludeListingIds,['8100001','8100002']);
  unresolvedMode=true;discoveryStart=searchRequests.length;quotaStart=reservations;
  await startButton.click();
  await page.waitForFunction(()=>document.querySelector('.status')?.textContent.includes('هذا لا يعني عدم وجود عروض'));
  assert.equal(searchRequests.length,discoveryStart+1);
  assert.equal(reservations,quotaStart+1);
  assert.doesNotMatch(await page.locator('.status').textContent(),/اكتمل البحث/);
  discoveryMode=false;unresolvedMode=false;allowSearch=false;
  await page.getByRole('button',{name:'مسح الحقول',exact:true}).click();
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
  await excludedInput.fill('موقف سيارة');
  await allTables(0);
  await excludedInput.fill('مكيف');
  await allTables(5);
  await excludedInput.fill('');
  await allTables(5);
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
