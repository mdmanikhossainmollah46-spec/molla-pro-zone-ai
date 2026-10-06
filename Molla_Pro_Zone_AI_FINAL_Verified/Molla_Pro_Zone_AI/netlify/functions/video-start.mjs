import { env, baseUrl, googleJson, admin, requireUser, parseBody, getSettings, charge, refund, ok, fail } from "./_lib.mjs";
export default async (req)=>{
  if(req.method!=="POST")return fail(405,"Method not allowed");
  let user,ref,cost=0;
  try{
    user=await requireUser(req);const b=await parseBody(req);if(!b.prompt)return fail(400,"Prompt is required.");
    const s=await getSettings();cost=s.video_cost;ref=await charge(user.id,cost,"video_generation");
    const aspect=b.aspectRatio==="9:16"?"9:16":"16:9";const res=["720p","1080p","4k"].includes(b.resolution)?b.resolution:"720p";
    const data=await googleJson(baseUrl(`/models/${encodeURIComponent(env.videoModel)}:predictLongRunning`),{instances:[{prompt:String(b.prompt).slice(0,10000)}],parameters:{aspectRatio:aspect,resolution:res,numberOfVideos:1}});
    if(!data.name)throw new Error("Video generation did not return an operation ID.");
    const {data:job,error}=await admin.from("media_jobs").insert({user_id:user.id,kind:"video",operation_name:data.name,charge_amount:cost}).select("id").single();if(error)throw error;
    return ok({jobId:job.id,status:"processing"});
  }catch(e){if(user&&ref)await refund(user.id,cost,"video_start_refund",ref).catch(()=>{});return fail(e.status||500,e.message)}
};
