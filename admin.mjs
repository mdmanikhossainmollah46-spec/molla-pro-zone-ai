import { admin, requireUser, parseBody, ok, fail } from "./_lib.mjs";
async function ensureAdmin(user){
  const {data}=await admin.from("profiles").select("is_admin").eq("id",user.id).single();if(!data?.is_admin)throw Object.assign(new Error("Admin access required."),{status:403});
}
export default async (req)=>{
  if(req.method!=="POST")return fail(405,"Method not allowed");
  try{
    const user=await requireUser(req);await ensureAdmin(user);const b=await parseBody(req);
    if(b.action==="dashboard"){
      const [{count:users},{count:pending},{data:credits},{data:settings},{data:rows}]=await Promise.all([
        admin.from("profiles").select("*",{count:"exact",head:true}),
        admin.from("recharge_requests").select("*",{count:"exact",head:true}).eq("status","pending"),
        admin.from("profiles").select("credits"),
        admin.from("app_settings").select("*").eq("id",true).single(),
        admin.from("recharge_requests").select("id,user_id,trx_id,created_at,recharge_packages(credits,price_bdt),profiles!recharge_requests_user_id_fkey(full_name,email)").eq("status","pending").order("created_at",{ascending:true})
      ]);
      return ok({stats:{users:users||0,pending:pending||0,totalCredits:(credits||[]).reduce((a,x)=>a+(x.credits||0),0)},settings,pending:(rows||[]).map(r=>({id:r.id,user_id:r.user_id,user_name:r.profiles?.full_name,user_email:r.profiles?.email,trx_id:r.trx_id,created_at:r.created_at,credits:r.recharge_packages?.credits,price_bdt:r.recharge_packages?.price_bdt}))});
    }
    if(b.action==="recharge"){
      if(!b.id||!["approve","reject"].includes(b.decision))return fail(400,"Invalid recharge action.");
      const fn=b.decision==="approve"?"approve_recharge":"reject_recharge";const args=b.decision==="approve"?{p_request:b.id,p_admin:user.id}:{p_request:b.id,p_admin:user.id};const {error}=await admin.rpc(fn,args);if(error)throw error;return ok({success:true});
    }
    if(b.action==="settings"){
      const allowed=["welcome_credits","chat_cost","image_cost","video_cost","voice_cost","project_cost"];const patch={updated_at:new Date().toISOString()};for(const k of allowed){const n=Number(b.settings?.[k]);if(Number.isFinite(n)&&n>=0)patch[k]=Math.round(n)}
      const {error}=await admin.from("app_settings").update(patch).eq("id",true);if(error)throw error;return ok({success:true});
    }
    return fail(400,"Unknown admin action.");
  }catch(e){return fail(e.status||500,e.message)}
};
