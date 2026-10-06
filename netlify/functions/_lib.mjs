import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const env = {
  supabaseUrl: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  geminiKey: process.env.GEMINI_API_KEY,
  textModel: process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
  imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1",
  videoModel: process.env.GEMINI_VIDEO_MODEL || "veo-3.1-generate-preview",
  ttsModel: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts",
};
export const admin = createClient(env.supabaseUrl || "", env.serviceKey || "", {auth:{persistSession:false,autoRefreshToken:false}});
export const anon = createClient(env.supabaseUrl || "", env.anonKey || "", {auth:{persistSession:false,autoRefreshToken:false}});

export const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export const ok=data=>response(200,data);
export const fail=(status,error,extra={})=>response(status,{error,...extra});
export const parseBody=async req=>{try{return await req.json()}catch{return {}}};

export async function requireUser(req){
  const h=req.headers.get("authorization")||"";const token=h.startsWith("Bearer ")?h.slice(7):null;
  if(!token) throw Object.assign(new Error("Please sign in again."),{status:401});
  const {data,error}=await admin.auth.getUser(token);if(error||!data.user)throw Object.assign(new Error("Your session is invalid or expired."),{status:401});
  return data.user;
}
export async function getSettings(){
  const {data,error}=await admin.from("app_settings").select("*").eq("id",true).single();if(error)throw error;return data;
}
export async function charge(userId,amount,reason,ref=crypto.randomUUID()){
  const {error}=await admin.rpc("charge_credits",{p_user:userId,p_amount:amount,p_reason:reason,p_reference:ref});
  if(error){if(String(error.message).includes("INSUFFICIENT_CREDITS"))throw Object.assign(new Error("Not enough credits. Please recharge your account."),{status:402});throw error}
  return ref;
}
export async function refund(userId,amount,reason,ref){
  if(!amount)return;await admin.rpc("refund_credits",{p_user:userId,p_amount:amount,p_reason:reason,p_reference:ref});
}
export function baseUrl(path=""){return `https://generativelanguage.googleapis.com/v1beta${path}`}

export async function googleJson(url,body,method="POST"){
  if(!env.geminiKey)throw Object.assign(new Error("GEMINI_API_KEY is not configured."),{status:500});
  const r=await fetch(url,{method,headers:{"Content-Type":"application/json","x-goog-api-key":env.geminiKey},body:body?JSON.stringify(body):undefined});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(data?.error?.message||`Gemini API error (${r.status})`),{status:r.status});
  return data;
}
export function deepFind(obj,predicate){
  const seen=new Set();const walk=v=>{
    if(!v||typeof v!=="object"||seen.has(v))return null;seen.add(v);if(predicate(v))return v;
    if(Array.isArray(v)){for(const x of v){const y=walk(x);if(y)return y}} else {for(const x of Object.values(v)){const y=walk(x);if(y)return y}}
    return null;
  };return walk(obj);
}
export function extractText(data){
  if(typeof data?.output_text==="string")return data.output_text;
  if(typeof data?.outputText==="string")return data.outputText;
  const hit=deepFind(data,v=>typeof v?.text==="string"&&v.text.trim());
  return hit?.text||"";
}
export function extractImage(data){
  const oi=data?.output_image||data?.outputImage;if(oi?.data)return {data:oi.data,mimeType:oi.mime_type||oi.mimeType||"image/png"};
  const hit=deepFind(data,v=>(v?.type==="image"||String(v?.mime_type||v?.mimeType||"").startsWith("image/"))&&typeof v?.data==="string");
  return hit?{data:hit.data,mimeType:hit.mime_type||hit.mimeType||"image/png"}:null;
}
export async function uploadMedia(userId,kind,buffer,mimeType,ext){
  const path=`${userId}/${kind}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const {error}=await admin.storage.from("user-media").upload(path,buffer,{contentType:mimeType,upsert:false});if(error)throw error;
  const {data}=admin.storage.from("user-media").getPublicUrl(path);return data.publicUrl;
}
export const identity=`You are Molla Pro Zone AI, a helpful multimodal AI application created by Manik Hossain Molla. If asked who created you, say that Molla Pro Zone AI was created by Manik Hossain Molla. Be truthful that the underlying AI capabilities are powered through Google's Gemini API when asked about the underlying model or provider. Never claim Manik trained Google's foundation model. Be concise, capable and friendly.`;
