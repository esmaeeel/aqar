import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { savedResultSets } from "@/db/schema";
import { storedDataJson, storedDataOptions, storedUserId } from "@/lib/shared-storage";

export const dynamic = "force-dynamic";
export const OPTIONS = storedDataOptions;
export async function GET(req:Request){ const userId=storedUserId(req); const rows=await getDb().select({id:savedResultSets.id,name:savedResultSets.name,propertyType:savedResultSets.propertyType,resultsJson:savedResultSets.resultsJson,createdAt:savedResultSets.createdAt}).from(savedResultSets).where(eq(savedResultSets.userId,userId)).orderBy(desc(savedResultSets.createdAt)); return storedDataJson(req,{sets:rows.map(r=>({...r,count:JSON.parse(r.resultsJson).length}))}); }
export async function POST(req:Request){ const userId=storedUserId(req); const p=await req.json() as {name?:string;propertyType?:string;results?:unknown[]}; if(!p.results?.length)return storedDataJson(req,{error:"لا توجد نتائج لحفظها."},{status:400}); const stamp=new Intl.DateTimeFormat("ar-SA",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Riyadh"}).format(new Date()); const name=p.name?.trim()||`${p.propertyType||"عقارات"} — ${stamp}`; const [row]=await getDb().insert(savedResultSets).values({userId,name,propertyType:p.propertyType||"غير مصنف",resultsJson:JSON.stringify(p.results)}).returning(); return storedDataJson(req,{set:{...row,count:p.results.length}},{status:201}); }
export async function DELETE(req:Request){ const userId=storedUserId(req); const id=Number(new URL(req.url).searchParams.get("id")); if(!id)return storedDataJson(req,{error:"معرّف غير صالح"},{status:400}); await getDb().delete(savedResultSets).where(and(eq(savedResultSets.id,id),eq(savedResultSets.userId,userId))); return storedDataJson(req,{ok:true}); }
