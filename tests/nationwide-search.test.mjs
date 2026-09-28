import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const locations=moduleUrl(await read('../lib/locations.ts'));
const aqarUrl=moduleUrl((await read('../lib/aqar.ts')).replace('"@/lib/locations"',JSON.stringify(locations)));
const {locationUrl,searchSourcesFor,listingLinks,listingMatchesRequestedLocation,generalSearchHasRequiredKeywords}=await import(aqarUrl);
const filters={propertyType:'عام',purpose:'sale',locations:[],keywords:['ملعب'],mode:'strict',maxPages:2,maxListings:5,priceMin:0,priceMax:0,areaMin:0,areaMax:0,sqmMin:0,sqmMax:0,yieldMin:0,minMeters:0,minApartments:0,minRooms:0,minCommercialShops:0,minFloors:0,minStreet:0,minAge:0,maxAge:0,minDensity:0};
const ads=[
  {id:'7000001',city:'الدمام',category:'شقق-للبيع',description:'شقة بجوار ملعب'},
  {id:'7000002',city:'الرياض',category:'شقق-للبيع',description:'شقة مؤثثة بجوار ملعب'},
  {id:'7000003',city:'جدة',category:'شقق-للإيجار',description:'شقة بجوار ملعب'},
];
const adUrl=ad=>`https://sa.aqar.fm/${ad.category}/${ad.city}/حي-النور/شقة-${ad.id}`;
const feed=ads.map(ad=>`<a href="${adUrl(ad)}">إعلان</a>`).join('')+'<a href="https://example.com/شقق-للبيع/الدمام/شقة-7000004">خارج المنصة</a>';
test('empty city creates one nationwide scope with valid paginated category URLs',()=>{
  assert.equal(decodeURI(locationUrl('شقق-للبيع','','',1)),'https://sa.aqar.fm/شقق-للبيع');
  assert.equal(decodeURI(locationUrl('عقارات','','حي النور',2)),'https://sa.aqar.fm/عقارات/2');
  assert.equal(decodeURI(locationUrl('شقق-للبيع','الدمام','النور',2)),'https://sa.aqar.fm/شقق-للبيع/الدمام/حي-النور/2');
  assert.deepEqual(searchSourcesFor(filters),[1,2].map(page=>({category:'عقارات',city:'',neighborhood:'',page})));
  assert.deepEqual(searchSourcesFor({...filters,locations:[{city:' ',neighborhoods:['النور']}]}),searchSourcesFor(filters));
  assert.ok(searchSourcesFor({...filters,propertyType:'شقة',keywords:[]}).every(source=>source.category==='شقق-للبيع'&&source.city===''));
  assert.ok(searchSourcesFor({...filters,locations:[{city:'الخبر',neighborhoods:[]},{city:'',neighborhoods:[]}]}).every(source=>source.city==='الخبر'));
});
test('nationwide links and final validation allow different cities while selected cities remain strict',()=>{
  assert.deepEqual(listingLinks(feed,'شقق-للبيع','').map(ad=>ad.listingId),['7000001','7000002']);
  assert.deepEqual(listingLinks(feed,'عقارات','','','sale').map(ad=>ad.listingId),['7000001','7000002']);
  assert.deepEqual(listingLinks(feed,'عقارات','','','rent').map(ad=>ad.listingId),['7000003']);
  assert.deepEqual(listingLinks(feed,'شقق-للبيع','الدمام','النور').map(ad=>ad.listingId),['7000001']);
  assert.equal(listingMatchesRequestedLocation('جدة','الروضة',''),true);
  assert.equal(listingMatchesRequestedLocation('جدة','الروضة','الدمام'),false);
  assert.equal(listingMatchesRequestedLocation('الدمام','الروضة','الدمام','النور'),false);
  assert.equal(generalSearchHasRequiredKeywords('عام',[]),false);
  assert.equal(generalSearchHasRequiredKeywords('عام',['  ']),false);
  assert.equal(generalSearchHasRequiredKeywords('شقة',[]),true);
  assert.equal(generalSearchHasRequiredKeywords('عام',['مزرعة']),true);
  assert.equal(generalSearchHasRequiredKeywords('عام',['ملعب']),true);
});
test('search route reads the nationwide feed and returns actual cities without widening a selected city',async()=>{
  const dependencies={
    '@/lib/aqar':aqarUrl,
    '@/lib/neighborhood-discovery':moduleUrl((await read('../lib/neighborhood-discovery.ts')).replace('"@/lib/aqar"',JSON.stringify(aqarUrl)).replace('"@/lib/locations"',JSON.stringify(locations))),
    '@/lib/trial':moduleUrl('export const isTrialTokenValid=async()=>true;'),
    '@/lib/listing-amount-reconciliation':moduleUrl('export const reconcileListingAmounts=(html,item)=>item;'),
    '@/lib/source-protection':moduleUrl(await read('../lib/source-protection.ts')),
    '@/lib/commercial-filter':moduleUrl(await read('../lib/commercial-filter.ts')),
  };
  let routeSource=await read('../app/api/search/route.ts');
  for(const [name,url] of Object.entries(dependencies))routeSource=routeSource.replace(JSON.stringify(name),JSON.stringify(url));
  const {POST}=await import(moduleUrl(routeSource));
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{
    const path=decodeURI(String(url));calls.push(path);
    if(path==='https://sa.aqar.fm/عقارات')return new Response(feed);
    const ad=ads.find(item=>adUrl(item)===path);
    assert.ok(ad,'Unexpected external request: '+path);
    return new Response(`<h1>شقة للبيع في حي النور، مدينة ${ad.city}، المنطقة</h1><div>500,000 ريال</div><div>استكشف خيارات التمويل</div><p>${ad.description}</p><div>رقم الإعلان ${ad.id}</div>`);
  };
  try{
    const response=await POST(new Request('https://aqar.test/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filters,category:'عقارات',city:'',neighborhood:'ignored',page:1,remaining:2})}));
    const data=await response.json();
    assert.equal(response.status,200);
    assert.deepEqual(data.results.map(row=>row.city),['الدمام','الرياض']);
    assert.equal(data.results.length,2);
    assert.equal(data.warnings.length,0);
    assert.equal(calls[0],'https://sa.aqar.fm/عقارات');
    const excludedResponse=await POST(new Request('https://aqar.test/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filters:{...filters,excludedKeywords:['مؤثثة']},category:'عقارات',city:'',neighborhood:'',page:1,remaining:2})}));
    const excludedData=await excludedResponse.json();
    assert.equal(excludedResponse.status,200);
    assert.deepEqual(excludedData.results.map(row=>row.city),['الدمام']);
    assert.deepEqual(excludedData.checkedListingIds,['7000001','7000002']);
  }finally{globalThis.fetch=originalFetch;}
});
