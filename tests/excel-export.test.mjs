import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import writeExcelFile from "write-excel-file/node";

const source=await readFile(new URL("../lib/excel-export.ts",import.meta.url),"utf8");
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildExcelExport}=await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("ينشئ ملف Excel عربيًا حقيقيًا بالقيم الرقمية والأعمدة المناسبة",async()=>{
  const listing={listingId:"6817902",status:"مطابقة",propertyType:"عمارة",age:"جديد",city:"الرياض",neighborhood:"الشفا",price:2500000,sqmPrice:3125,income:200000,yieldPct:8,area:800,apartments:10,rooms:null,housingUnits:12,commercialShops:2,totalRooms:40,meters:8,floors:4,street:30,density:1.25,url:"https://sa.aqar.fm/6817902"};
  const model=buildExcelExport([listing],{propertyType:"عمارة",purpose:"sale",roomMode:false,includeSquareMeterPrice:true,hiddenColumns:new Set()});
  assert.equal(model.sheetOptions.rightToLeft,true);
  assert.equal(model.sheetOptions.stickyRowsCount,1);
  assert.deepEqual(model.sheetData[0].slice(0,7).map(cell=>cell.value),["رقم الإعلان","الحالة","نوع العقار","العمر","المدينة","الحي","السعر"]);
  assert.equal(model.sheetData[1][0].value,"6817902");
  assert.equal(model.sheetData[1][6].value,2500000);
  assert.equal(model.sheetData[1][6].type,Number);
  const buffer=await writeExcelFile(model.sheetData,model.sheetOptions,{fontFamily:"Arial",fontSize:11}).toBuffer();
  assert.ok(buffer.length>1000);
  assert.equal(buffer[0],0x50);
  assert.equal(buffer[1],0x4b);
});
