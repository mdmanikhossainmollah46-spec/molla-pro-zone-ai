import { env, baseUrl, googleJson, extractImage, requireUser, parseBody, getSettings, charge, refund, uploadMedia, ok, fail } from "./_lib.mjs";
const ratios=new Set(["1:1","16:9","9:16","4:3","3:4","3:2"]);
const sizes=new Set(["1K","2K","4K"]);
export default async (req)=>{
  if(req.method!=="POST")return fail(405,"Method not allowed");
  let user,ref,cost=0;
  try{
    user=await requireUser(req);const b=await parseBody(req);if(!b.prompt)return fail(400,"Prompt is required.");
    const s=await getSettings();cost=s.image_cost;ref=await charge(user.id,cost,"image_generation");
    const aspect=ratios.has(b.aspectRatio)?b.aspectRatio:"1:1",size=sizes.has(b.imageSize)?b.imageSize:"1K";
    const data=await googleJson(baseUrl("/interactions"),{model:env.imageModel,input:String(b.prompt).slice(0,12000),response_format:{type:"image",mime_type:"image/png",aspect_ratio:aspect,image_size:size}});
    const img=extractImage(data);if(!img?.data)throw new Error("No image was returned by the selected Gemini image model.");
    const buffer=Buffer.from(img.data,"base64");const mime=img.mimeType||"image/png";const ext=mime.includes("jpeg")?"jpg":"png";
    const url=await uploadMedia(user.id,"images",buffer,mime,ext);return ok({url});
  }catch(e){if(user&&ref)await refund(user.id,cost,"image_refund",ref).catch(()=>{});return fail(e.status||500,e.message)}
};
