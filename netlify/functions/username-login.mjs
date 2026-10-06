import { admin, anon, parseBody, ok, fail } from "./_lib.mjs";
export default async (req)=>{
  if(req.method!=="POST")return fail(405,"Method not allowed");
  try{
    const {username,password}=await parseBody(req);if(!username||!password)return fail(400,"Username and password are required.");
    const {data:p,error}=await admin.from("profiles").select("email").ilike("username",username).maybeSingle();if(error)throw error;if(!p?.email)return fail(400,"Invalid username or password.");
   const {data, error: authError}=await anon.auth.signInWithPassword({email:p.email,password:password});if(error)return fail(400,"Invalid username or password.");
    return ok({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
  }catch(e){return fail(e.status||500,e.message)}
};
