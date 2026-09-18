import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const dataModule=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const locations=dataModule(await readFile(new URL('../lib/locations.ts',import.meta.url),'utf8'));
const {filterResultRows}=await import(dataModule((await readFile(new URL('../lib/aqar.ts',import.meta.url),'utf8')).replace('"@/lib/locations"',JSON.stringify(locations))));
const filters={propertyType:'عام',purpose:'sale',locations:[],keywords:[],mode:'strict',priceMin:0,priceMax:0,areaMin:0,areaMax:0,sqmMin:0,sqmMax:0,yieldMin:0,minMeters:0,minApartments:0,minRooms:0,minCommercialShops:0,minFloors:0,minStreet:0,minAge:0,maxAge:0,minDensity:0};
const listing={listingId:'7000001',url:'https://sa.aqar.fm/عمائر-للبيع/الدمام/عمارة-7000001',title:'عمارة مواقف سيارات',description:'',city:'الدمام',neighborhood:'طيبة',propertyType:'عمارة',price:2000000,area:500,sqmPrice:4000,income:160000,incomeKind:'actual',yieldPct:8,apartments:10,totalRooms:26,rooms:null,meters:10,commercialShops:2,floors:3,street:20,age:'16',density:2,status:'بيانات ناقصة',score:1,nearEligible:false};
const ids=rows=>rows.map(row=>row.listingId);
test('city/type/price filters compose and removing them restores the untouched source',()=>{
  const rows=[listing,{...listing,listingId:'2',city:'الخبر'},{...listing,listingId:'3',city:'جدة'},{...listing,listingId:'4',city:'الخرج'},{...listing,listingId:'5',propertyType:'فيلا'}];
  const snapshot=JSON.stringify(rows),city={...filters,locations:[{city:'الدمام',neighborhoods:[]},{city:'',neighborhoods:[]}]};
  assert.deepEqual(ids(filterResultRows(rows,city)),['7000001','5']);
  assert.deepEqual(ids(filterResultRows(rows,{...city,propertyType:'عمارة'})),['7000001']);
  assert.equal(filterResultRows(rows,{...city,priceMax:1000000}).length,0);
  assert.equal(filterResultRows(rows,filters).length,5);
  assert.equal(JSON.stringify(rows),snapshot);
});
test('cities are OR scopes with their own neighborhoods and Arabic aliases',()=>{
  const rows=[listing,{...listing,listingId:'2',city:'الخبر',neighborhood:'الثقبة'},{...listing,listingId:'3',city:'الرياض',neighborhood:'الشفا'}];
  const locations=[{city:'الدمام',neighborhoods:['طيبة']},{city:'الخبر',neighborhoods:['الثقبة']}];
  assert.deepEqual(ids(filterResultRows(rows,{...filters,locations})),['7000001','2']);
  assert.deepEqual(ids(filterResultRows(rows,{...filters,locations:[{city:'الرياض',neighborhoods:['الشفاء']}]})),['3']);
  assert.equal(filterResultRows([{...listing,city:''}],{...filters,locations}).length,0);
});
test('every numeric control filters stored rows, including strict missing and near mode',()=>{
  for(const [key,bound] of Object.entries({priceMin:3000000,priceMax:1000000,areaMin:600,areaMax:400,sqmMin:5000,sqmMax:3000,yieldMin:10,minMeters:11,minApartments:11,minRooms:27,minCommercialShops:3,minFloors:4,minStreet:21,minAge:17,maxAge:15,minDensity:3})){
    assert.equal(filterResultRows([listing],{...filters,[key]:bound}).length,0,key);
    assert.equal(filterResultRows([listing],filters).length,1,key+' removed');
  }
  assert.equal(filterResultRows([{...listing,age:null}],{...filters,maxAge:20}).length,0);
  assert.equal(filterResultRows([{...listing,age:null}],{...filters,maxAge:20,mode:'near'})[0].status,'بيانات ناقصة');
  assert.equal(filterResultRows([listing],{...filters,priceMax:1800000,mode:'near'})[0].status,'قريبة');
  assert.equal(filterResultRows([listing],{...filters,priceMax:1000000,mode:'near'}).length,0);
  assert.equal(filterResultRows([{...listing,age:'جديد'}],{...filters,maxAge:1}).length,1);
});
test('purpose, keywords and commercial use actual data and hidden conditions do not apply',()=>{
  assert.equal(filterResultRows([listing],{...filters,purpose:'rent'}).length,0);
  assert.equal(filterResultRows([{...listing,url:'https://sa.aqar.fm/عمائر-للإيجار/الدمام/عمارة-7000001'}],{...filters,purpose:'rent'}).length,1);
  assert.equal(filterResultRows([listing],{...filters,keywords:['مكيف','موقف سيارة']}).length,1);
  assert.equal(filterResultRows([listing],{...filters,keywords:['مكيف']}).length,0);
  assert.equal(filterResultRows([listing],{...filters,commercialOnly:true}).length,0);
  assert.equal(filterResultRows([{...listing,sourceCommercialOnly:true}],{...filters,commercialOnly:true}).length,1);
  assert.equal(filterResultRows([{...listing,propertyType:'أرض',age:null}],{...filters,propertyType:'أرض',maxAge:2,minApartments:100}).length,1);
});
