import { env, baseUrl, googleJson, deepFind, requireUser, parseBody, getSettings, charge, refund, uploadMedia, ok, fail } from "./_lib.mjs";
export default async (req)=>{
  if(req.method!=="POST")return fail(405,"Method not allowed");
  let user,ref,cost=0;
  try{
    user=await requireUser(req);const b=await parseBody(req);if(!b.text)return fail(400,"Text is required.");
    if(String(b.text).length>12000)return fail(400,"Text is too long for one generation. Keep it around five minutes.");
    const s=await getSettings();cost=s.voice_cost;ref=await charge(user.id,cost,"voice_generation");
    const model=env.ttsModel,url=baseUrl(`/models/${encodeURIComponent(model)}:generateContent`);
    const body={contents:[{role:"user",parts:[{text:String(b.text),speech_metadata:{style:String(b.style||"warm professional narrator")}}]}],generationConfig:{responseModalities:["AUDIO"],speechConfig:{voiceConfig:{voice:String(b.voice||"Kore")}}}};
    const data=await googleJson(url,body);
    const hit=deepFind(data,v=>typeof v?.data==="string"&&String(v?.mimeType||v?.mime_type||"").includes("audio"));
    if(!hit?.data)throw new Error("No audio was returned by the selected TTS model.");
    const buffer=Buffer.from(hit.data,"base64");const urlOut=await uploadMedia(user.id,"audio",buffer,"audio/wav","wav");return ok({url:urlOut});
  }catch(e){if(user&&ref)await refund(user.id,cost,"voice_refund",ref).catch(()=>{});return fail(e.status||500,e.message)}
};
