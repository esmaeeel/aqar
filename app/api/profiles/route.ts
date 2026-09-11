import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { savedProfiles } from "@/db/schema";
import { storedDataJson, storedDataOptions, storedUserId } from "@/lib/shared-storage";

export const dynamic = "force-dynamic";
export const OPTIONS = storedDataOptions;
export async function GET(req:Request){ const userId=storedUserId(req); return storedDataJson(req,{profiles:await getDb().select().from(savedProfiles).where(eq(savedProfiles.userId,userId)).orderBy(desc(savedProfiles.updatedAt))}); }
export async function POST(req:Request){ const userId=storedUserId(req); const p=await req.json() as {name?:string;filters?:unknown}; const name=p.name?.trim(); if(!name)return storedDataJson(req,{error:"اكتب اسمًا للمواصفات."},{status:400}); const [row]=await getDb().insert(savedProfiles).values({userId,name,filtersJson:JSON.stringify(p.filters||{}),updatedAt:new Date().toISOString()}).returning(); return storedDataJson(req,{profile:row},{status:201}); }
export async function PUT(req:Request){ const userId=storedUserId(req); const id=Number(new URL(req.url).searchParams.get("id")); const p=await req.json() as {name?:string}; const name=p.name?.trim(); if(!id||!name)return storedDataJson(req,{error:"بيانات غير صالحة."},{status:400}); const [row]=await getDb().update(savedProfiles).set({name,updatedAt:new Date().toISOString()}).where(and(eq(savedProfiles.id,id),eq(savedProfiles.userId,userId))).returning(); if(!row)return storedDataJson(req,{error:"لم توجد الشروط المحفوظة."},{status:404}); return storedDataJson(req,{profile:row}); }
export async function DELETE(req:Request){ const userId=storedUserId(req); const id=Number(new URL(req.url).searchParams.get("id")); if(!id)return storedDataJson(req,{error:"معرّف غير صالح"},{status:400}); await getDb().delete(savedProfiles).where(and(eq(savedProfiles.id,id),eq(savedProfiles.userId,userId))); return storedDataJson(req,{ok:true}); }
