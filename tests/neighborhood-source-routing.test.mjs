import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const locationsUrl=moduleUrl(await read('../lib/locations.ts'));
const aqarUrl=moduleUrl((await read('../lib/aqar.ts')).replace('"@/lib/locations"',JSON.stringify(locationsUrl)));
const {locationUrl,listingLinks,listingMatchesRequestedLocation}=await import(aqarUrl);
const {neighborhoodsMatch}=await import(locationsUrl);
const category='أراضي-للبيع';
const source='https://sa.aqar.fm/أراضي-للبيع/الرياض/غرب-الرياض/حي-ظهرة-نمار';
const link=(id,hood='العوالي',city='الرياض',directory='ظهرة-نمار')=>`https://sa.aqar.fm/${category}/${city}/غرب-${city}/حي-${directory}/شارع-التوحيد-حي-${hood}-مدينة-${city}-منطقة-${city}-${id}`;
const feed=urls=>urls.map(url=>`<a href="${url}">أرض للبيع</a>`).join('');

test('uses the verified Aqar directory for Riyadh Al Awali land sales, including pagination',()=>{
  assert.equal(decodeURI(locationUrl(category,'الرياض','العوالي',1)),source);
  assert.equal(decodeURI(locationUrl(category,'الرياض','حي العوالي',2)),source+'/2');
  assert.equal(decodeURI(locationUrl(category,'مكة المكرمة','العوالي',1)),'https://sa.aqar.fm/أراضي-للبيع/مكة-المكرمة/حي-العوالي');
  assert.equal(decodeURI(locationUrl(category,'الرياض','الشفا',1)),'https://sa.aqar.fm/أراضي-للبيع/الرياض/حي-الشفا');
  assert.equal(decodeURI(locationUrl(category,'الرياض','',1)),'https://sa.aqar.fm/أراضي-للبيع/الرياض');
  assert.equal(decodeURI(locationUrl(category,'','العوالي',1)),'https://sa.aqar.fm/أراضي-للبيع');
  // Do not extend a verified sale route to unverified categories or rental sources.
  assert.equal(decodeURI(locationUrl('أراضي-للإيجار','الرياض','العوالي',1)),'https://sa.aqar.fm/أراضي-للإيجار/الرياض/حي-العوالي');
});

test('accepts an explicit title neighborhood despite a different directory, with exact matching',()=>{
  const html=feed([
    link('7000001'),
    link('7000002','ظهرة-نمار'),
    link('7000003','العوالي-الجديدة'),
    link('7000004','العوالي','جدة'),
    // A matching directory must not override a conflicting explicit title.
    link('7000005','نمار','الرياض','العوالي'),
    link('7000006').replace('sa.aqar.fm','example.com'),
  ]);
  for(const requestedCategory of [category,'عقارات']) {
    assert.deepEqual(listingLinks(html,requestedCategory,'الرياض','العوالي','sale').map(item=>item.listingId),['7000001']);
  }
  assert.deepEqual(listingLinks(html,'عقارات','الرياض','العوالي','rent'),[]);
  assert.equal(neighborhoodsMatch('الرياض','العوالي','ظهرة نمار'),false);
  assert.equal(listingMatchesRequestedLocation('الرياض','ظهرة نمار','الرياض','العوالي'),false);
  assert.equal(listingMatchesRequestedLocation('جدة','العوالي','الرياض','العوالي'),false);
});

test('keeps directory-only links and multi-word neighborhood matching when the slug has no address',()=>{
  const url=`https://sa.aqar.fm/${category}/الرياض/غرب-الرياض/حي-ظهرة-نمار/أرض-7000010`;
  assert.equal(listingLinks(feed([url]),category,'الرياض','ظهرة نمار').length,1);
  assert.equal(listingLinks(feed([url]),category,'الرياض','العوالي').length,0);
  const shifa=link('7000011','الشفاء');
  assert.equal(listingLinks(feed([shifa]),category,'الرياض','الشفا').length,1);
});

test('search route returns Al Awali results but rejects a different neighborhood inside the ad',async()=>{
  const dependencies={
    '@/lib/aqar':aqarUrl,
    '@/lib/trial':moduleUrl('export const isTrialTokenValid=async()=>true;'),
    '@/lib/listing-amount-reconciliation':moduleUrl(await read('../lib/listing-amount-reconciliation.ts')),
    '@/lib/source-protection':moduleUrl(await read('../lib/source-protection.ts')),
    '@/lib/commercial-filter':moduleUrl(await read('../lib/commercial-filter.ts')),
  };
  let routeSource=await read('../app/api/search/route.ts');
  for(const [name,url] of Object.entries(dependencies))routeSource=routeSource.replace(JSON.stringify(name),JSON.stringify(url));
  const {POST}=await import(moduleUrl(routeSource));
  const filters={propertyType:'أرض',purpose:'sale',locations:[{city:'الرياض',neighborhoods:['العوالي']}],keywords:[],mode:'strict',maxPages:1,maxListings:400,priceMin:0,priceMax:0,areaMin:0,areaMax:0,sqmMin:0,sqmMax:0,yieldMin:0,minMeters:0,minApartments:0,minRooms:0,minCommercialShops:0,minFloors:0,minStreet:0,minAge:0,maxAge:0,minDensity:0};
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{
    const path=decodeURI(String(url));calls.push(path);
    if(path===source)return new Response(feed([link('7000020'),link('7000021'),link('7000022','ظهرة-نمار')]));
    const id=path.match(/-(\d+)$/)?.[1];
    assert.ok(['7000020','7000021'].includes(id),'Unexpected request: '+path);
    const hood=id==='7000020'?'العوالي':'ظهرة نمار';
    return new Response(`<h1>أرض للبيع في حي ${hood}، مدينة الرياض، منطقة الرياض</h1><div>1,000,000 ريال</div><div>استكشف خيارات التمويل</div><p>أرض للبيع المساحة 400 م²</p><div>رقم الإعلان ${id}</div>`);
  };
  try{
    const response=await POST(new Request('https://aqar.test/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filters,category,city:'الرياض',neighborhood:'العوالي',page:1,remaining:20})}));
    const data=await response.json();
    assert.equal(response.status,200);
    assert.equal(data.discovered,2);
    assert.deepEqual(data.checkedListingIds,['7000020','7000021']);
    assert.deepEqual(data.results.map(row=>[row.listingId,row.city,row.neighborhood]),[['7000020','الرياض','العوالي']]);
    assert.deepEqual(data.warnings,[]);
    assert.deepEqual(calls,[source,link('7000020'),link('7000021')]);
  }finally{globalThis.fetch=originalFetch;}
});
