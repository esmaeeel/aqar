import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source=await readFile(new URL('../app/api/source-page/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source.replace('"@/lib/trial"','"data:text/javascript,export const isTrialTokenValid=async(token,id)=>token===%22valid%22%26%26id===%22device%22;"'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {POST}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const request=(url,token='valid')=>new Request('https://aqar.test/api/source-page',{method:'POST',headers:{'content-type':'application/json','x-aqar-trial-token':token,'x-aqar-device-id':'device'},body:JSON.stringify({url})});

test('source proxy checks trial and Aqar origin, streams allowed pages, and preserves source protection',async()=>{
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{calls.push(String(url));const response=new Response('<a href="/شقق-للإيجار/الرياض/شقة-7000001">إعلان</a>');Object.defineProperty(response,'url',{value:String(url)});return response;};
  try{
    assert.equal((await POST(request('https://sa.aqar.fm/شقق-للإيجار/الرياض','bad'))).status,403);
    assert.equal((await POST(request('https://example.com/شقق-للإيجار/الرياض'))).status,400);
    assert.equal(calls.length,0);
    const sourceUrl='https://sa.aqar.fm/شقق-للإيجار/الرياض?type=eq%2C2';
    const response=await POST(request(sourceUrl));
    assert.equal(response.status,200);
    assert.equal(decodeURIComponent(response.headers.get('x-aqar-final-url')),new URL(sourceUrl).href);
    assert.match(await response.text(),/7000001/);
    assert.deepEqual(calls,[new URL(sourceUrl).href]);
    globalThis.fetch=async()=>new Response('',{status:403});
    const blocked=await POST(request(sourceUrl));
    assert.equal(blocked.status,502);
    assert.match((await blocked.json()).error,/منع موقع عقار/);
  }finally{globalThis.fetch=originalFetch;}
});
