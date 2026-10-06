import { env, baseUrl, googleJson, extractText, requireUser, parseBody, getSettings, charge, refund, identity, ok, fail } from "./_lib.mjs";
export default async (req)=>{
  if(req.method!=="POST")return fail(405,"Method not allowed");
  let user,ref,cost=0;
  try{
    user=await requireUser(req);const b=await parseBody(req);const s=await getSettings();cost=s.chat_cost;ref=await charge(user.id,cost,"chat");
    const history=(b.history||[]).slice(-12).map(x=>`${x.role==="assistant"?"Assistant":"User"}: ${String(x.text||"").slice(0,4000)}`).join("\n");
    const input=[{type:"text",text:`${identity}\n\nConversation so far:\n${history}\n\nUser: ${String(b.message||"").slice(0,10000)}`}];
    if(b.image?.data)input.push({type:"image",mime_type:b.image.mimeType||"image/jpeg",data:b.image.data});
    const data=await googleJson(baseUrl("/interactions"),{model:env.textModel,input});
    const text=extractText(data);if(!text)throw new Error("The AI returned an empty response.");
    return ok({text});
  }catch(e){if(user&&ref)await refund(user.id,cost,"chat_refund",ref).catch(()=>{});return fail(e.status||500,e.message)}
};
