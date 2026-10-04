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
const discoveryUrl=moduleUrl((await read('../lib/neighborhood-discovery.ts')).replace('"@/lib/aqar"',JSON.stringify(aqarUrl)).replace('"@/lib/locations"',JSON.stringify(locationsUrl)));
const {discoverNeighborhoodSource,sourceDirectory,directoryMatchesNeighborhood,directoryPageUrl,SOURCE_UNRESOLVED}=await import(discoveryUrl);
const category='أراضي-للبيع';
const source='https://sa.aqar.fm/أراضي-للبيع/الرياض/غرب-الرياض/حي-ظهرة-نمار';
const link=(id,hood='العوالي',city='الرياض',directory='ظهرة-نمار')=>`https://sa.aqar.fm/${category}/${city}/غرب-${city}/حي-${directory}/شارع-التوحيد-حي-${hood}-مدينة-${city}-منطقة-${city}-${id}`;
const feed=urls=>urls.map(url=>`<a href="${url}">أرض للبيع</a>`).join('');

test('builds direct URLs without any city/neighborhood routing exception',()=>{
  assert.equal(decodeURI(locationUrl(category,'الرياض','العوالي',1)),'https://sa.aqar.fm/أراضي-للبيع/الرياض/حي-العوالي');
  assert.equal(decodeURI(locationUrl(category,'الرياض','حي العوالي',2)),'https://sa.aqar.fm/أراضي-للبيع/الرياض/حي-العوالي/2');
  assert.equal(decodeURI(locationUrl(category,'مكة المكرمة','العوالي',1)),'https://sa.aqar.fm/أراضي-للبيع/مكة-المكرمة/حي-العوالي');
  assert.equal(decodeURI(locationUrl(category,'الرياض','الشفا',1)),'https://sa.aqar.fm/أراضي-للبيع/الرياض/حي-الشفا');
  assert.equal(decodeURI(locationUrl(category,'الرياض','',1)),'https://sa.aqar.fm/أراضي-للبيع/الرياض');
  assert.equal(decodeURI(locationUrl(category,'','العوالي',1)),'https://sa.aqar.fm/أراضي-للبيع');
  assert.equal(decodeURI(locationUrl('أراضي-للإيجار','الرياض','العوالي',1)),'https://sa.aqar.fm/أراضي-للإيجار/الرياض/حي-العوالي');
  assert.equal(directoryPageUrl(source,2),source+'/2');
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
    '@/lib/neighborhood-discovery':discoveryUrl,
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
    if(path==='https://sa.aqar.fm/أراضي-للبيع/الرياض/حي-العوالي')return new Response('',{status:404});
    if(path==='https://sa.aqar.fm/أراضي-للبيع/الرياض')return new Response(feed([link('7000020')]));
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
    assert.deepEqual(calls.slice(-3),[source,link('7000020'),link('7000021')]);
    globalThis.fetch=async()=>{const redirected=new Response('');Object.defineProperty(redirected,'url',{value:'https://sa.aqar.fm/أراضي-للبيع'});return redirected;};
    const failed=await POST(new Request('https://aqar.test/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filters,category,city:'الرياض',neighborhood:'العوالي',sourceBaseUrl:source,page:1,remaining:20})}));
    assert.equal(failed.status,502);
    assert.equal((await failed.json()).code,'SOURCE_UNRESOLVED');
  }finally{globalThis.fetch=originalFetch;}
});

test('discovers an arbitrary child through city/direction/parent navigation, across batches',async()=>{
  const scope={category:'شقق-للإيجار',city:'مكة المكرمة',neighborhood:'الحي الفرعي التجريبي',purpose:'rent'};
  const base='https://sa.aqar.fm/شقق-للإيجار/مكة-المكرمة';
  const parent=base+'/غرب-مكة-المكرمة/حي-التصنيف-الأوسع';
  const dirs=['شمال','جنوب','شرق','غرب'].map(dir=>base+'/'+dir+'-مكة-المكرمة');
  const calls=[];
  const readPage=async url=>{
    const path=decodeURI(url);calls.push(path);
    if(path.includes('/حي-الحي-الفرعي'))return {url:'https://sa.aqar.fm/شقق-للإيجار',html:''};
    if(path===base)return {url,html:feed(dirs)};
    if(dirs.includes(path))return {url,html:path===dirs[3]?feed([parent]):''};
    assert.equal(path,parent);
    return {url,html:feed([parent+'/شارع-مثال-حي-الحي-الفرعي-التجريبي-مدينة-مكة-المكرمة-1234567'])};
  };
  const first=await discoverNeighborhoodSource(scope,readPage);
  assert.ok(first.sourceDiscovery);
  assert.equal(calls.length,2);
  let next=first;
  while(next.sourceDiscovery){const before=calls.length;next=await discoverNeighborhoodSource(scope,readPage,next.sourceDiscovery);assert.ok(calls.length-before<=2);}
  assert.equal(decodeURI(next.sourceBaseUrl),parent);
  assert.equal(directoryMatchesNeighborhood(next.sourceBaseUrl,scope),false,'Parent and child are not aliases');
  assert.equal(new Set(calls).size,calls.length,'No repeated probes');
  const cached=await discoverNeighborhoodSource(scope,()=>{throw Error('Should use discovered cache');});
  assert.equal(cached.sourceBaseUrl,next.sourceBaseUrl);
});

test('directory navigation keeps city, category, origin and safe URL scope',()=>{
  const scope={category,city:'الرياض',neighborhood:'العوالي',purpose:'sale'};
  for(const url of ['https://example.com/'+category+'/الرياض/حي-العوالي','//example.com/','https://sa.aqar.fm/أراضي-للبيع/جدة/حي-العوالي',source+'?keyword=foo',source+'#x',source+'/أرض-1234567','https://user@sa.aqar.fm/'+category+'/الرياض/حي-العوالي','https://sa.aqar.fm/'+category+'/الرياض/الواجهة-شمال'])assert.equal(sourceDirectory(url,scope),null,url);
  assert.equal(decodeURI(sourceDirectory(encodeURI(source),scope)),source);
});

test('unresolved neighborhoods and source protection never become a successful empty search',async()=>{
  const scope={category,city:'الخبر',neighborhood:'حي تجريبي غير معروف',purpose:'sale'};
  await assert.rejects(discoverNeighborhoodSource(scope,async()=>({url:'https://sa.aqar.fm/أراضي-للبيع',html:''})),{message:SOURCE_UNRESOLVED});
  for(const message of ['منع موقع عقار القراءة الآلية مؤقتًا (403).','أوقف موقع عقار القراءة مؤقتًا (429).','تعذر الاتصال مؤقتًا بمنصة عقار']){
    let calls=0;
    await assert.rejects(discoverNeighborhoodSource(scope,async()=>{calls++;throw Error(message);}),{message});
    assert.equal(calls,1);
  }
});
