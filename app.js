const $ = (s, p=document)=>p.querySelector(s);
const $$ = (s, p=document)=>[...p.querySelectorAll(s)];
let supabase, session, profile, publicConfig, settings, selectedPackageId=null, pendingImage=null, chatHistory=[], currentView="chat", videoPollTimer=null;

const api = async (path, body={}, opts={}) => {
  const token = session?.access_token;
  const res = await fetch(`/api/${path}`, {
    method: opts.method || "POST",
    headers: {"Content-Type":"application/json", ...(token?{"Authorization":`Bearer ${token}`}:{})},
    body: opts.method==="GET" ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(()=>({error:"Invalid server response"}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

const toast=(message,type="info")=>{
  const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=message;$("#toastRoot").append(el);
  setTimeout(()=>el.remove(),4200);
};

const setBusy=(btn,busy,label)=>{
  if(!btn)return; if(!btn.dataset.original)btn.dataset.original=btn.innerHTML;
  btn.disabled=busy; btn.innerHTML=busy?`<span class="spinner" style="width:16px;height:16px;border-width:2px;margin:0"></span> ${label||"Working…"}`:btn.dataset.original;
};

const esc=(s="")=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const fmt=n=>Number(n||0).toLocaleString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function boot(){
  try{
    publicConfig=await fetch("/api/config").then(r=>r.json());
    if(!publicConfig.supabaseUrl||!publicConfig.supabaseAnonKey) throw new Error("Supabase public config is missing.");
    supabase=window.supabase.createClient(publicConfig.supabaseUrl,publicConfig.supabaseAnonKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    const {data}=await supabase.auth.getSession(); session=data.session;
    supabase.auth.onAuthStateChange(async(event,newSession)=>{
      session=newSession;
      if(event==="SIGNED_IN"&&session){await enterApp();}
      if(event==="SIGNED_OUT"){showAuth("login");}
      if(event==="PASSWORD_RECOVERY"){toast("Open Settings to set your new password.","success");}
    });
    bindUI();
    if(session) await enterApp(); else showAuth("login");
  }catch(e){
    $("#bootScreen").innerHTML=`<div class="brand-orb">!</div><h1>Setup required</h1><p>${esc(e.message)}</p><p style="max-width:560px;text-align:center;margin-top:12px">Follow README.md to configure Supabase and Netlify environment variables.</p>`;
  }
}

function bindUI(){
  $("#showSignup").onclick=()=>showAuth("signup"); $("#showLogin").onclick=()=>showAuth("login"); $("#forgotBtn").onclick=()=>showAuth("reset"); $("#backLogin").onclick=()=>showAuth("login");
  $$(".pass-toggle").forEach(b=>b.onclick=()=>{const i=$("#"+b.dataset.target);i.type=i.type==="password"?"text":"password"});
  $("#signupPassword").oninput=e=>{$("#passwordMeter").style.width=Math.min(100,e.target.value.length*10)+"%"};
  $("#loginBtn").onclick=login; $("#signupBtn").onclick=signup; $("#verifyBtn").onclick=verifyOtp; $("#resendOtp").onclick=resendOtp; $("#resetBtn").onclick=resetPassword;
  $("#loginPassword").onkeydown=e=>{if(e.key==="Enter")login()};
  setupOtp();
  $$(".nav-item[data-view],.nav-jump").forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $("#menuBtn").onclick=()=>$("#sidebar").classList.toggle("open");
  $("#logoutBtn").onclick=()=>supabase.auth.signOut();
  $("#themeBtn").onclick=toggleTheme; 
  $("#newChatBtn").onclick=()=>{chatHistory=[];$("#messages").innerHTML="";$("#chatEmpty").classList.remove("hidden");switchView("chat")};
  $$("[data-quick]").forEach(b=>b.onclick=()=>{$("#chatInput").value=b.dataset.quick;sendChat()});
  $("#chatInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat()}}; $("#chatInput").oninput=autoGrow;
  $("#sendBtn").onclick=sendChat; $("#attachImageBtn").onclick=()=>$("#chatImageInput").click(); $("#chatImageInput").onchange=loadChatImage;
  bindSegment("#imageRatios"); bindSegment("#videoRatios");
  $("#generateImageBtn").onclick=generateImage; $("#generateVideoBtn").onclick=generateVideo; $("#generateVoiceBtn").onclick=generateVoice; $("#buildProjectBtn").onclick=buildProject;
  $("#voiceText").oninput=updateVoiceEstimate;
  $("#copyBkash").onclick=async()=>{await navigator.clipboard.writeText(settings?.bkash_number||"01729834248");toast("bKash number copied.","success")};
  $("#submitRechargeBtn").onclick=submitRecharge;
  $("#refreshAdmin").onclick=loadAdmin; $("#saveSettingsBtn").onclick=saveAdminSettings;
}

function setupOtp(){
  const inputs=$$("#otpRow input");
  inputs.forEach((i,idx)=>{
    i.oninput=()=>{i.value=i.value.replace(/\D/g,"").slice(0,1);if(i.value&&inputs[idx+1])inputs[idx+1].focus()};
    i.onkeydown=e=>{if(e.key==="Backspace"&&!i.value&&inputs[idx-1])inputs[idx-1].focus()};
    i.onpaste=e=>{const s=e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);if(s.length){e.preventDefault();[...s].forEach((c,n)=>inputs[n]&&(inputs[n].value=c));inputs[Math.min(s.length,6)-1]?.focus()}};
  });
}
function showAuth(which){
  $("#bootScreen").classList.add("hidden");$("#appView").classList.add("hidden");$("#authView").classList.remove("hidden");
  $$(".auth-pane").forEach(p=>p.classList.add("hidden"));$("#"+which+"Pane").classList.remove("hidden");
}
async function login(){
  const id=$("#loginId").value.trim(),password=$("#loginPassword").value;if(!id||!password)return toast("Enter your email/username and password.","error");
  setBusy($("#loginBtn"),true,"Signing in");
  try{
    let data;
    if(id.includes("@")){const r=await supabase.auth.signInWithPassword({email:id,password});if(r.error)throw r.error;data=r.data}
    else{data=await api("username-login",{username:id,password});await supabase.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token})}
  }catch(e){toast(e.message,"error")}finally{setBusy($("#loginBtn"),false)}
}
let pendingVerifyEmail="",otpInterval;
async function signup(){
  const full_name=$("#signupName").value.trim(),username=$("#signupUsername").value.trim(),email=$("#signupEmail").value.trim(),password=$("#signupPassword").value;
  if(!full_name||!username||!email||password.length<8)return toast("Complete all fields and use at least 8 password characters.","error");
  if(!/^[a-zA-Z0-9_.]{3,24}$/.test(username))return toast("Username must be 3–24 letters, numbers, _ or .","error");
  if(!$("#termsCheck").checked)return toast("Please accept the Terms & Privacy Policy.","error");
  setBusy($("#signupBtn"),true,"Creating account");
  try{
    const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name,username}}});if(error)throw error;
    pendingVerifyEmail=email;$("#verifyEmailText").textContent=email;showAuth("verify");startOtpTimer();
    if(data.session) await enterApp();
  }catch(e){toast(e.message,"error")}finally{setBusy($("#signupBtn"),false)}
}
function startOtpTimer(){
  clearInterval(otpInterval);let n=60;$("#resendOtp").disabled=true;$("#otpTimer").textContent=`Resend in ${n}s`;
  otpInterval=setInterval(()=>{n--;$("#otpTimer").textContent=n>0?`Resend in ${n}s`:"Code can be resent";if(n<=0){clearInterval(otpInterval);$("#resendOtp").disabled=false}},1000);
}
async function verifyOtp(){
  const token=$$("#otpRow input").map(i=>i.value).join("");if(token.length!==6)return toast("Enter all 6 digits.","error");
  setBusy($("#verifyBtn"),true,"Verifying");
  try{const {error}=await supabase.auth.verifyOtp({email:pendingVerifyEmail,token,type:"signup"});if(error)throw error;toast("Account verified. Welcome!","success")}catch(e){toast(e.message,"error")}finally{setBusy($("#verifyBtn"),false)}
}
async function resendOtp(){
  try{const {error}=await supabase.auth.resend({type:"signup",email:pendingVerifyEmail});if(error)throw error;startOtpTimer();toast("A new code was sent.","success")}catch(e){toast(e.message,"error")}
}
async function resetPassword(){
  const email=$("#resetEmail").value.trim();if(!email)return toast("Enter your email.","error");
  setBusy($("#resetBtn"),true,"Sending");
  try{const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});if(error)throw error;toast("Password reset email sent.","success");showAuth("login")}catch(e){toast(e.message,"error")}finally{setBusy($("#resetBtn"),false)}
}

async function enterApp(){
  $("#bootScreen").classList.add("hidden");$("#authView").classList.add("hidden");$("#appView").classList.remove("hidden");
  await refreshProfile(); await loadSettings(); await loadRecharge();
}
async function refreshProfile(){
  const {data,error}=await supabase.from("profiles").select("*").eq("id",session.user.id).single();if(error)throw error;profile=data;
  $("#sideCredits").textContent=fmt(profile.credits);$("#topCredits").textContent=fmt(profile.credits);$("#rechargeBalance").textContent=fmt(profile.credits);
  $("#profileBtn").textContent=(profile.full_name||profile.username||"M")[0].toUpperCase();$("#adminNav").classList.toggle("hidden",!profile.is_admin);
  const pct=Math.min(100,Math.max(3,(profile.credits/10000)*100));$("#creditBar").style.width=pct+"%";
}
async function loadSettings(){
  const {data}=await supabase.from("app_settings").select("*").eq("id",true).single();settings=data||publicConfig.settings||{};
  $("#bkashNumber").textContent=settings.bkash_number||"01729834248";$("#voiceCostLabel").textContent=`${settings.voice_cost||10} credits`;
}
function switchView(view){
  currentView=view;$$(".view").forEach(v=>v.classList.remove("active"));$("#view-"+view)?.classList.add("active");
  $$(".nav-item[data-view]").forEach(n=>n.classList.toggle("active",n.dataset.view===view));
  const names={chat:["AI Chat","Ask, analyze and create"],image:["Image Studio","Generate visuals"],video:["Video Studio","Create with Veo"],voice:["Voice Studio","Text to natural audio"],project:["Project Builder","Generate multi-file projects"],recharge:["Recharge Credits","Manual bKash payments"],admin:["Admin Panel","Manage Molla Pro Zone AI"]};
  $("#topTitle").textContent=names[view]?.[0]||"Molla Pro Zone AI";$("#topSubtitle").textContent=names[view]?.[1]||"AI Workspace";
  $("#sidebar").classList.remove("open"); if(view==="recharge")loadRecharge(); if(view==="admin")loadAdmin();
}
function toggleTheme(){
  const t=document.documentElement.dataset.theme==="light"?"dark":"light";document.documentElement.dataset.theme=t;localStorage.setItem("mpz-theme",t)
}
if(localStorage.getItem("mpz-theme")==="light")document.documentElement.dataset.theme="light";
function autoGrow(){const t=$("#chatInput");t.style.height="auto";t.style.height=Math.min(t.scrollHeight,180)+"px"}
function bindSegment(selector){$$(selector+" button").forEach(b=>b.onclick=()=>{$$(selector+" button").forEach(x=>x.classList.remove("selected"));b.classList.add("selected")})}
function selectedValue(selector){return $(selector+" .selected")?.dataset.value}

async function loadChatImage(e){
  const file=e.target.files?.[0];if(!file)return; if(file.size>8*1024*1024)return toast("Please choose an image under 8 MB.","error");
  pendingImage={name:file.name,mimeType:file.type,data:await fileToBase64(file)};
  $("#attachmentPreview").innerHTML=`📎 ${esc(file.name)} <button id="removeAttach" class="link-btn">Remove</button>`;$("#attachmentPreview").classList.remove("hidden");
  $("#removeAttach").onclick=()=>{pendingImage=null;$("#attachmentPreview").classList.add("hidden");e.target.value=""};
}
const fileToBase64=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=rej;r.readAsDataURL(file)});
function addMessage(role,text,imageSrc=null,thinking=false){
  $("#chatEmpty").classList.add("hidden");const wrap=document.createElement("div");wrap.className=`message ${role}`;
  wrap.innerHTML=`<div class="msg-avatar">${role==="ai"?"✦":"YOU"}</div><div class="bubble">${thinking?'<span class="thinking">Molla Pro Zone AI is thinking <i></i><i></i><i></i></span>':(role==="ai"?marked.parse(text):esc(text).replace(/\n/g,"<br>"))}${imageSrc?`<img src="${imageSrc}" alt="attachment"/>`:""}</div>`;
  $("#messages").append(wrap);wrap.scrollIntoView({behavior:"smooth",block:"end"});return wrap;
}
async function sendChat(){
  const message=$("#chatInput").value.trim();if(!message&&!pendingImage)return;
  if((profile?.credits||0)<(settings?.chat_cost||1))return outOfCredits();
  const img=pendingImage;let preview=img?`data:${img.mimeType};base64,${img.data}`:null;
  addMessage("user",message||"Analyze this image",preview);$("#chatInput").value="";pendingImage=null;$("#attachmentPreview").classList.add("hidden");$("#chatImageInput").value="";autoGrow();
  const thinking=addMessage("ai","",null,true);
  try{
    const data=await api("chat",{message:message||"Analyze this image and help me.",history:chatHistory.slice(-12),image:img?{mimeType:img.mimeType,data:img.data}:null});
    thinking.remove();const el=addMessage("ai","");await typeMarkdown($(".bubble",el),data.text);
    chatHistory.push({role:"user",text:message||"[image]"});chatHistory.push({role:"assistant",text:data.text});await refreshProfile();
  }catch(e){thinking.remove();addMessage("ai",`Sorry, I couldn't complete that request.\n\n${e.message}`);toast(e.message,"error");await refreshProfile()}
}
async function typeMarkdown(el,text){
  const max=140,step=Math.max(4,Math.floor(text.length/max));let i=0;
  while(i<text.length){i+=step;el.innerHTML=marked.parse(text.slice(0,i));await sleep(10)}
  el.innerHTML=marked.parse(text);
}

function loadingResult(el,title,sub){el.innerHTML=`<div class="progress-card"><div class="spinner"></div><h3>${esc(title)}</h3><p class="muted">${esc(sub)}</p><div class="progress-steps"><span>Preparing</span><span>Generating</span><span>Finalizing</span></div></div>`}
async function generateImage(){
  const prompt=$("#imagePrompt").value.trim();if(!prompt)return toast("Write an image prompt.","error");if(profile.credits<(settings?.image_cost||20))return outOfCredits();
  const btn=$("#generateImageBtn");setBusy(btn,true,"Generating");loadingResult($("#imageResult"),"Creating your image","AI is composing the final visual…");
  try{
    const data=await api("image",{prompt,aspectRatio:selectedValue("#imageRatios")||"1:1",imageSize:$("#imageSize").value});
    $("#imageResult").innerHTML=`<div class="generated-media"><img src="${data.url}" alt="Generated image"/><div class="result-actions"><a class="primary" href="${data.url}" download="molla-pro-zone-ai.png">Download Image</a><button class="secondary" id="copyImageUrl">Copy link</button></div></div>`;
    $("#copyImageUrl").onclick=()=>navigator.clipboard.writeText(data.url).then(()=>toast("Image link copied.","success"));await refreshProfile();
  }catch(e){$("#imageResult").innerHTML=`<div class="result-placeholder"><div>!</div><h3>Generation failed</h3><p>${esc(e.message)}</p></div>`;toast(e.message,"error");await refreshProfile()}finally{setBusy(btn,false)}
}
async function generateVideo(){
  const prompt=$("#videoPrompt").value.trim();if(!prompt)return toast("Write a video prompt.","error");if(profile.credits<(settings?.video_cost||50))return outOfCredits();
  const btn=$("#generateVideoBtn");setBusy(btn,true,"Starting");loadingResult($("#videoResult"),"Starting video generation","Veo is preparing your scene…");
  try{
    const data=await api("video-start",{prompt,aspectRatio:selectedValue("#videoRatios")||"16:9",resolution:$("#videoResolution").value});
    setBusy(btn,false);pollVideo(data.jobId);
  }catch(e){$("#videoResult").innerHTML=`<div class="result-placeholder"><div>!</div><h3>Could not start video</h3><p>${esc(e.message)}</p></div>`;toast(e.message,"error");await refreshProfile();setBusy(btn,false)}
}
async function pollVideo(jobId){
  clearTimeout(videoPollTimer);let attempts=0;
  const poll=async()=>{
    attempts++;
    try{
      const data=await api("video-status",{jobId});
      if(data.status==="ready"){
        $("#videoResult").innerHTML=`<div class="generated-media"><video src="${data.url}" controls playsinline></video><div class="result-actions"><a class="primary" href="${data.url}" download="molla-pro-zone-ai.mp4">Download Video</a></div></div>`;await refreshProfile();return;
      }
      if(data.status==="failed")throw new Error(data.error||"Video generation failed.");
      loadingResult($("#videoResult"),data.status==="processing"?"Generating video":"Finalizing video",`Status: ${data.status}. You can keep this page open while we finish.`);
      if(attempts<90)videoPollTimer=setTimeout(poll,10000);else throw new Error("Video is taking longer than expected. Try checking again later.");
    }catch(e){$("#videoResult").innerHTML=`<div class="result-placeholder"><div>!</div><h3>Video not ready</h3><p>${esc(e.message)}</p><button class="secondary" id="retryVideoPoll">Retry status</button></div>`;$("#retryVideoPoll").onclick=()=>{attempts=0;poll()};toast(e.message,"error");await refreshProfile()}
  };poll();
}
function updateVoiceEstimate(){
  const words=$("#voiceText").value.trim().split(/\s+/).filter(Boolean).length;const secs=Math.round(words/2.4);$("#voiceEstimate").textContent=`Estimated duration: ${secs<60?secs+"s":Math.floor(secs/60)+"m "+secs%60+"s"}`;
}
async function generateVoice(){
  const text=$("#voiceText").value.trim();if(!text)return toast("Enter text for the voice.","error");
  const words=text.split(/\s+/).length;if(words>850)return toast("Please keep the script around 5 minutes (about 850 words) or less.","error");
  if(profile.credits<(settings?.voice_cost||10))return outOfCredits();
  const btn=$("#generateVoiceBtn");setBusy(btn,true,"Generating");loadingResult($("#voiceResult"),"Generating natural voice","Preparing narration and audio…");
  try{
    const data=await api("voice",{text,voice:$("#voiceName").value,style:$("#voiceStyle").value});
    $("#voiceResult").innerHTML=`<div class="generated-media"><audio src="${data.url}" controls style="width:min(520px,100%)"></audio><div class="result-actions"><a class="primary" href="${data.url}" download="molla-pro-zone-ai.wav">Download Audio</a></div></div>`;await refreshProfile();
  }catch(e){$("#voiceResult").innerHTML=`<div class="result-placeholder"><div>!</div><h3>Audio generation failed</h3><p>${esc(e.message)}</p></div>`;toast(e.message,"error");await refreshProfile()}finally{setBusy(btn,false)}
}
let lastProjectFiles=null;
async function buildProject(){
  const prompt=$("#projectPrompt").value.trim();if(!prompt)return toast("Describe the project you want.","error");if(profile.credits<(settings?.project_cost||20))return outOfCredits();
  const btn=$("#buildProjectBtn");setBusy(btn,true,"Building");loadingResult($("#projectResult"),"Building project","Planning files and writing code…");
  try{
    const data=await api("project",{prompt});lastProjectFiles=data.files;renderProjectFiles(data.files);await refreshProfile();
  }catch(e){$("#projectResult").innerHTML=`<div class="result-placeholder"><div>!</div><h3>Project build failed</h3><p>${esc(e.message)}</p></div>`;toast(e.message,"error");await refreshProfile()}finally{setBusy(btn,false)}
}
function renderProjectFiles(files){
  $("#projectResult").innerHTML=`<div style="width:100%"><div class="between"><div><h3>Generated project</h3><p class="muted">${files.length} files ready</p></div><div class="result-actions"><button id="saveFolderBtn" class="primary">Save to Folder</button><button id="downloadZipBtn" class="secondary">Download ZIP</button></div></div><div class="file-tree">${files.map(f=>`<div class="file-row"><span>${esc(f.path)}</span><span>${fmt(f.content.length)} chars</span></div>`).join("")}</div></div>`;
  $("#saveFolderBtn").onclick=saveProjectToFolder;$("#downloadZipBtn").onclick=downloadProjectZip;
}
async function saveProjectToFolder(){
  if(!window.showDirectoryPicker)return downloadProjectZip();
  try{
    const dir=await window.showDirectoryPicker({mode:"readwrite"});
    for(const f of lastProjectFiles){const parts=f.path.split("/").filter(Boolean);let current=dir;for(let i=0;i<parts.length-1;i++)current=await current.getDirectoryHandle(parts[i],{create:true});const handle=await current.getFileHandle(parts.at(-1),{create:true});const w=await handle.createWritable();await w.write(f.content);await w.close()}
    toast("Project saved directly to your selected folder.","success");
  }catch(e){if(e.name!=="AbortError")toast("Folder save failed. You can use Download ZIP instead.","error")}
}
async function downloadProjectZip(){
  const zip=new JSZip();lastProjectFiles.forEach(f=>zip.file(f.path,f.content));const blob=await zip.generateAsync({type:"blob"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="molla-pro-zone-project.zip";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}

async function loadRecharge(){
  if(!session)return;
  const [{data:packages},{data:history}]=await Promise.all([
    supabase.from("recharge_packages").select("*").eq("active",true).order("credits"),
    supabase.from("recharge_requests").select("id,trx_id,status,created_at,recharge_packages(credits,price_bdt)").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(20)
  ]);
  $("#packageGrid").innerHTML=(packages||[]).map(p=>`<button class="package-card ${selectedPackageId===p.id?"selected":""}" data-id="${p.id}" data-credits="${p.credits}" data-price="${p.price_bdt}"><strong>${fmt(p.credits)}</strong><span>credits</span><b>৳${p.price_bdt}</b></button>`).join("");
  $$(".package-card").forEach(b=>b.onclick=()=>{selectedPackageId=b.dataset.id;$$(".package-card").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");$("#selectedPackage").value=`${fmt(b.dataset.credits)} credits — ৳${b.dataset.price}`});
  $("#rechargeHistory").innerHTML=(history||[]).length?(history||[]).map(h=>`<div class="history-item"><div><b>${fmt(h.recharge_packages?.credits)} credits</b><div class="muted">TrxID: ${esc(h.trx_id)}</div></div><span class="status ${h.status}">${h.status}</span></div>`).join(""):`<p class="muted">No recharge requests yet.</p>`;
}
async function submitRecharge(){
  const trx=$("#trxId").value.trim();if(!selectedPackageId)return toast("Choose a recharge package.","error");if(!trx||trx.length<6)return toast("Enter a valid Transaction ID.","error");
  setBusy($("#submitRechargeBtn"),true,"Submitting");
  try{
    const {error}=await supabase.from("recharge_requests").insert({user_id:session.user.id,package_id:selectedPackageId,trx_id:trx});if(error)throw error;
    $("#trxId").value="";toast("Recharge request submitted for admin approval.","success");await loadRecharge();
  }catch(e){toast(e.message.includes("duplicate")?"This TrxID was already submitted.":e.message,"error")}finally{setBusy($("#submitRechargeBtn"),false)}
}
function outOfCredits(){toast("You’ve run out of credits. Recharge to continue.","error");switchView("recharge")}

async function loadAdmin(){
  if(!profile?.is_admin)return;
  try{
    const data=await api("admin",{action:"dashboard"});
    $("#statUsers").textContent=fmt(data.stats.users);$("#statPending").textContent=fmt(data.stats.pending);$("#statCredits").textContent=fmt(data.stats.totalCredits);
    $("#adminRechargeBody").innerHTML=data.pending.map(r=>`<tr><td>${esc(r.user_name||r.user_email||r.user_id)}</td><td>${fmt(r.credits)} cr • ৳${r.price_bdt}</td><td><b>${esc(r.trx_id)}</b></td><td>${new Date(r.created_at).toLocaleString()}</td><td><button class="secondary admin-approve" data-id="${r.id}">Approve</button> <button class="secondary admin-reject" data-id="${r.id}">Reject</button></td></tr>`).join("")||`<tr><td colspan="5" class="muted">No pending recharge requests.</td></tr>`;
    $$(".admin-approve").forEach(b=>b.onclick=()=>adminRecharge(b.dataset.id,"approve"));$$(".admin-reject").forEach(b=>b.onclick=()=>adminRecharge(b.dataset.id,"reject"));
    const s=data.settings;$("#setWelcome").value=s.welcome_credits;$("#setChat").value=s.chat_cost;$("#setImage").value=s.image_cost;$("#setVideo").value=s.video_cost;$("#setVoice").value=s.voice_cost;$("#setProject").value=s.project_cost;
  }catch(e){toast(e.message,"error")}
}
async function adminRecharge(id,decision){
  try{await api("admin",{action:"recharge",id,decision});toast(`Recharge ${decision}d.`,"success");await loadAdmin()}catch(e){toast(e.message,"error")}
}
async function saveAdminSettings(){
  const payload={welcome_credits:+$("#setWelcome").value,chat_cost:+$("#setChat").value,image_cost:+$("#setImage").value,video_cost:+$("#setVideo").value,voice_cost:+$("#setVoice").value,project_cost:+$("#setProject").value};
  try{await api("admin",{action:"settings",settings:payload});toast("System pricing updated.","success");await loadSettings()}catch(e){toast(e.message,"error")}
}

boot();
