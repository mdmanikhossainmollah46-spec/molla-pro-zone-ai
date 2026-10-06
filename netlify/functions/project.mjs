import { env, baseUrl, googleJson, extractText, requireUser, parseBody, getSettings, charge, refund, identity, ok, fail } from "./_lib.mjs";
function parseFiles(text){
  let s=String(text||"").trim().replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
  const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a>=0&&b>a)s=s.slice(a,b+1);
  const obj=JSON.parse(s);if(!Array.isArray(obj.files))throw new Error("AI did not return a valid file list.");
  return obj.files.filter(f=>f&&typeof f.path==="string"&&typeof f.content==="string").slice(0,60).map(f=>({path:f.path.replace(/^\/+/,"").replace(/\.\./g,"_"),content:f.content}));
}
export default async (req)=>{
  if(req.method!=="POST")return fail(405,"Method not allowed");
  let user,ref,cost=0;
  try{
    user=await requireUser(req);const b=await parseBody(req);if(!b.prompt)return fail(400,"Project description is required.");
    const s=await getSettings();cost=s.project_cost;ref=await charge(user.id,cost,"project_generation");
    const prompt=`${identity}

You are now a senior software engineer. Build the user's requested project as a complete multi-file project.
Return ONLY valid JSON in exactly this shape:
{"files":[{"path":"relative/path.ext","content":"complete file content"}]}
Rules:
- Include every file needed to run the project, including README with setup instructions.
- No markdown fences.
- Keep paths relative and safe.
- Prefer secure, maintainable code.
- Never embed secrets or API keys; use placeholders/environment variables.
- Do not omit code with phrases like "rest of code here".
User request:
${String(b.prompt).slice(0,12000)}`;
    const data=await googleJson(baseUrl("/interactions"),{model:env.textModel,input:prompt});
    const files=parseFiles(extractText(data));if(!files.length)throw new Error("No project files were generated.");return ok({files});
  }catch(e){if(user&&ref)await refund(user.id,cost,"project_refund",ref).catch(()=>{});return fail(e.status||500,e.message)}
};
