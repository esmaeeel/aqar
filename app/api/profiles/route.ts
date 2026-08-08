import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { savedProfiles } from "@/db/schema";

export const dynamic = "force-dynamic";
async function uid() { return (await headers()).get("oai-authenticated-user-id") || "local-preview"; }
export async function GET(){ const userId=await uid(); return Response.json({profiles:await getDb().select().from(savedProfiles).where(eq(savedProfiles.userId,userId)).orderBy(desc(savedProfiles.updatedAt))}); }
export async function POST(req:Request){ const userId=await uid(); const p=await req.json() as {name?:string;filters?:unknown}; const name=p.name?.trim(); if(!name)return Response.json({error:"اكتب اسمًا للمواصفات."},{status:400}); const [row]=await getDb().insert(savedProfiles).values({userId,name,filtersJson:JSON.stringify(p.filters||{}),updatedAt:new Date().toISOString()}).returning(); return Response.json({profile:row},{status:201}); }
export async function DELETE(req:Request){ const userId=await uid(); const id=Number(new URL(req.url).searchParams.get("id")); if(!id)return Response.json({error:"معرّف غير صالح"},{status:400}); await getDb().delete(savedProfiles).where(and(eq(savedProfiles.id,id),eq(savedProfiles.userId,userId))); return Response.json({ok:true}); }
