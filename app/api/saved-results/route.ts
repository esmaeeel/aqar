import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { savedResultSets } from "@/db/schema";

export const dynamic = "force-dynamic";
async function uid() { const h=await headers(); const signed=h.get("oai-authenticated-user-id"); const device=h.get("x-aqar-device-id")||""; return signed || (/^[a-f0-9-]{20,64}$/i.test(device)?`device:${device}`:"device:anonymous"); }
export async function GET(){ const userId=await uid(); const rows=await getDb().select({id:savedResultSets.id,name:savedResultSets.name,propertyType:savedResultSets.propertyType,resultsJson:savedResultSets.resultsJson,createdAt:savedResultSets.createdAt}).from(savedResultSets).where(eq(savedResultSets.userId,userId)).orderBy(desc(savedResultSets.createdAt)); return Response.json({sets:rows.map(r=>({...r,count:JSON.parse(r.resultsJson).length}))}); }
export async function POST(req:Request){ const userId=await uid(); const p=await req.json() as {name?:string;propertyType?:string;results?:unknown[]}; if(!p.results?.length)return Response.json({error:"لا توجد نتائج لحفظها."},{status:400}); const stamp=new Intl.DateTimeFormat("ar-SA",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Riyadh"}).format(new Date()); const name=p.name?.trim()||`${p.propertyType||"عقارات"} — ${stamp}`; const [row]=await getDb().insert(savedResultSets).values({userId,name,propertyType:p.propertyType||"غير مصنف",resultsJson:JSON.stringify(p.results)}).returning(); return Response.json({set:{...row,count:p.results.length}},{status:201}); }
export async function DELETE(req:Request){ const userId=await uid(); const id=Number(new URL(req.url).searchParams.get("id")); if(!id)return Response.json({error:"معرّف غير صالح"},{status:400}); await getDb().delete(savedResultSets).where(and(eq(savedResultSets.id,id),eq(savedResultSets.userId,userId))); return Response.json({ok:true}); }
