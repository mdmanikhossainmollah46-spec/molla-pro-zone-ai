import { env, admin, ok, fail } from "./_lib.mjs";
export default async ()=>{
  try{
    let settings={};if(env.supabaseUrl&&env.serviceKey){const {data}=await admin.from("app_settings").select("welcome_credits,chat_cost,image_cost,video_cost,voice_cost,project_cost,bkash_type").eq("id",true).single();settings=data||{}}
    return ok({supabaseUrl:env.supabaseUrl,supabaseAnonKey:env.anonKey,settings,brand:"Molla Pro Zone AI"});
  }catch(e){return fail(500,e.message)}
};
