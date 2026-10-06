import { env, baseUrl, googleJson, admin, deepFind, requireUser, parseBody, refund, uploadMedia, ok, fail } from "./_lib.mjs";
export default async (req)=>{
  if(req.method!=="POST")return fail(405,"Method not allowed");
  try{
    const user=await requireUser(req);const {jobId}=await parseBody(req);if(!jobId)return fail(400,"jobId is required.");
    const {data:job,error}=await admin.from("media_jobs").select("*").eq("id",jobId).eq("user_id",user.id).single();if(error||!job)return fail(404,"Video job not found.");
    if(job.status==="ready")return ok({status:"ready",url:job.result_url});if(job.status==="failed")return ok({status:"failed",error:job.error});
    const data=await googleJson(baseUrl(`/${job.operation_name}`),null,"GET");
    if(!data.done)return ok({status:"processing"});
    if(data.error){
      if(!job.refunded){await refund(user.id,job.charge_amount,"video_refund",`video:${job.id}`).catch(()=>{});}
      await admin.from("media_jobs").update({status:"failed",error:data.error.message||"Video generation failed.",refunded:true,updated_at:new Date().toISOString()}).eq("id",job.id);
      return ok({status:"failed",error:data.error.message||"Video generation failed."});
    }
    const hit=deepFind(data,v=>typeof v?.uri==="string"&&String(v.uri).startsWith("http"));
    if(!hit?.uri)throw new Error("Video completed but no downloadable file URI was found.");
    const r=await fetch(hit.uri,{headers:{"x-goog-api-key":env.geminiKey}});if(!r.ok)throw new Error(`Could not download generated video (${r.status}).`);
    const buffer=Buffer.from(await r.arrayBuffer());const url=await uploadMedia(user.id,"videos",buffer,"video/mp4","mp4");
    await admin.from("media_jobs").update({status:"ready",result_url:url,updated_at:new Date().toISOString()}).eq("id",job.id);
    return ok({status:"ready",url});
  }catch(e){return fail(e.status||500,e.message)}
};
