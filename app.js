const SUPABASE_URL='https://nrdmakgigcixmzhxthrh.supabase.co';
const SUPABASE_KEY='sb_publishable_OhoPpv-hRk56QGy3PZJSBQ_W72oHkq1';
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const screen=document.querySelector('#screen'),toast=document.querySelector('#toast'),nav=document.querySelector('nav'),account=document.querySelector('#account');
let session=null,profile=null,patientId=null,doses=[],journal=[],caregiverLinks=[],tab='today',previous=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(text){toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),4500)}
function busy(text='Loading…'){screen.innerHTML=`<div class="loading"><b>SD</b><strong>${esc(text)}</strong></div>`}
function authView(){
 nav.hidden=true;account.textContent='?';
 screen.innerHTML=`<div class="auth"><small>PRIVATE & SECURE</small><h1>Welcome to Steady Dose</h1><p>Enter your email. We will send a secure sign-in link. No password is required.</p><form class="invite-form" id="email-signin"><label>Email address<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><button class="google" type="submit">EMAIL MY SIGN-IN LINK</button></form><p class="privacy">🔒 Open the link in your email to sign in securely.</p></div>`;
 document.querySelector('#email-signin').onsubmit=signInEmail;
}
async function signInEmail(e){
 e.preventDefault();
 const email=new FormData(e.target).get('email').trim().toLowerCase();
 const button=e.target.querySelector('button');button.disabled=true;button.textContent='SENDING…';
 const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:'https://dariakimberly4-netizen.github.io/steady-dose/'}});
 if(error){button.disabled=false;button.textContent='EMAIL MY SIGN-IN LINK';notify(error.message)}
 else{screen.innerHTML=`<div class="auth"><small>CHECK YOUR EMAIL</small><h1>Sign-in link sent</h1><p>We sent a secure link to <strong>${esc(email)}</strong>.</p><p>Open that link to enter Steady Dose.</p><button class="google" onclick="authView()">USE ANOTHER EMAIL</button></div>`;}
}
async function ensureProfile(){
 let {data}=await db.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
 if(!data){
  const email=String(session.user.email||'').toLowerCase();
  const invited=await db.from('caregiver_invitations').select('id').eq('caregiver_email',email).eq('status','pending').limit(1);
  const role=invited.data?.length?'caregiver':'patient';
  const meta=session.user.user_metadata||{};
  const name=meta.full_name||meta.name||email.split('@')[0];
  const r=await db.from('profiles').insert({id:session.user.id,full_name:name,role}).select().single();
  if(r.error)throw r.error;data=r.data;
 }
 profile=data;
}
async function load(){
 busy();try{await ensureProfile();if(profile.role==='caregiver'){await loadCaregiverHome()}else{patientId=session.user.id;await loadPatientData();render()}}catch(e){notify(e.message);screen.innerHTML='<div class="empty"><strong>Could not load your account.</strong><span>Please try signing out and back in.</span></div>'}
}
async function loadPatientData(){
 const date=new Date().toISOString().slice(0,10);
 let d=await db.from('medication_doses').select('*').eq('patient_id',patientId).eq('dose_date',date).order('dose_time');
 if(d.error)throw d.error;
 if(!d.data.length&&patientId===session.user.id){
  const defaults=[['06:00','Levodopa','½ tablet'],['10:00','Levodopa','½ tablet'],['14:00','Levodopa','½ tablet'],['18:00','Levodopa CR','1 tablet'],['21:00','Kinetica','8 mg']];
  const ins=await db.from('medication_doses').insert(defaults.map(x=>({patient_id:patientId,dose_date:date,dose_time:x[0],medication_name:x[1],amount:x[2]}))).select();
  if(ins.error)throw ins.error;d.data=ins.data;
 }
 doses=d.data||[];
 const j=await db.from('symptom_entries').select('*').eq('patient_id',patientId).gte('recorded_at',date+'T00:00:00').order('recorded_at',{ascending:false});
 if(j.error)throw j.error;journal=j.data||[];
 if(profile.role==='patient'){const c=await db.from('patient_caregivers').select('patient_id,caregiver_id,can_view,can_log_doses,profiles!patient_caregivers_caregiver_id_fkey(full_name)').eq('patient_id',session.user.id);if(c.error)throw c.error;caregiverLinks=c.data||[]}
}
async function loadCaregiverHome(){
 nav.hidden=true;account.textContent=(profile.full_name||'?').slice(0,2).toUpperCase();
 const inv=await db.from('caregiver_invitations').select('id,patient_id,status,created_at').eq('caregiver_email',session.user.email.toLowerCase());
 const links=await db.from('patient_caregivers').select('patient_id,can_view,profiles!patient_caregivers_patient_id_fkey(full_name)').eq('caregiver_id',session.user.id);
 const pending=(inv.data||[]).filter(i=>i.status==='pending'&&!(links.data||[]).some(l=>l.patient_id===i.patient_id));
 screen.innerHTML=`<div class="title"><small>CAREGIVER ACCOUNT</small><h1>Hello, ${esc(profile.full_name)}</h1><p>Select a patient who has shared access with you.</p></div>
 ${pending.map(i=>`<section class="invite"><div><strong>Care invitation</strong><span>A patient invited ${esc(session.user.email)}.</span></div><button onclick="acceptInvite('${i.patient_id}','${i.id}')">ACCEPT</button></section>`).join('')}
 <div class="patient-list">${(links.data||[]).map(l=>`<button onclick="openPatient('${l.patient_id}')"><b>♡</b><span><strong>${esc(l.profiles?.full_name||'Patient')}</strong><small>View shared medication record</small></span><em>OPEN</em></button>`).join('')||'<div class="empty"><strong>No linked patients yet.</strong><span>Ask the patient to invite this email address.</span></div>'}</div>`;
}
async function acceptInvite(pid,iid){
 const a=await db.from('patient_caregivers').insert({patient_id:pid,caregiver_id:session.user.id});
 if(a.error)return notify(a.error.message);
 await db.from('caregiver_invitations').update({status:'accepted',accepted_at:new Date().toISOString()}).eq('id',iid);
 notify('Care invitation accepted');loadCaregiverHome();
}
async function openPatient(pid){patientId=pid;await loadPatientData();nav.hidden=false;tab='today';render()}
async function take(i,status='taken'){
 const d=doses[i];if(!d)return;previous={...d};
 const r=await db.from('medication_doses').update({status,recorded_by:session.user.id,recorded_at:new Date().toISOString()}).eq('id',d.id).select().single();
 if(r.error)return notify(r.error.message);doses[i]=r.data;render();notify(`Dose marked ${status}`);
}
async function check(state){
 const r=await db.from('symptom_entries').insert({patient_id:patientId,state,recorded_by:session.user.id}).select().single();
 if(r.error)return notify(r.error.message);journal.unshift(r.data);render();notify(`${state} state saved`);
}
const stateButtons=()=>`<div class="states">${[['ON','●','Moving well'],['OFF','◐','Symptoms returned'],['Dyskinesia','≈','Extra movement'],['Freezing','❄','Hard to move']].map(x=>`<button onclick="check('${x[0]}')"><b>${x[1]}</b><strong>${x[0]}</strong><small>${x[2]}</small></button>`).join('')}</div>`;
const fmtTime=t=>new Date('2000-01-01T'+t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
function today(){let i=doses.findIndex(d=>d.status==='due'),taken=doses.filter(d=>['taken','late'].includes(d.status)).length,pct=doses.length?Math.round(taken/doses.length*100):0,d=doses[i];return `<div class="intro"><small>${new Date().toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric'})}</small><h1>Good day, ${esc(profile.full_name)}</h1><p>One dose at a time.</p></div><section class="next"><small>NEXT DOSE</small><h2>${d?fmtTime(d.dose_time):'All done'}</h2>${d?`<div class="med"><b>●</b><div><strong>${esc(d.medication_name)}</strong><span>${esc(d.amount)}</span></div></div><button class="take" onclick="take(${i})">✓ I TOOK MY DOSE</button><div class="twins"><button onclick="take(${i},'late')">Taken late</button><button onclick="take(${i},'skipped')">Skip dose</button></div>`:'<p>You completed today’s schedule.</p>'}</section><h3>How are you moving?</h3>${stateButtons()}<section class="progress"><b>${pct}%</b><div><small>TODAY’S PROGRESS</small><strong>${taken} of ${doses.length} doses taken</strong><span>${journal.length} symptom check-ins recorded</span></div></section>`}
function schedule(){return `<div class="title"><small>MEDICATION PLAN</small><h1>Today’s schedule</h1></div><div class="dose-list">${doses.map((d,i)=>`<article class="${d.status}"><b>${fmtTime(d.dose_time)}</b><div><strong>${esc(d.medication_name)}</strong><small>${esc(d.amount)}</small></div><em>${d.status==='taken'?'✓ Taken':d.status}</em>${d.status==='due'?`<button onclick="take(${i})">Take</button>`:''}</article>`).join('')}</div>`}
function journalView(){return `<div class="title"><small>SYMPTOM JOURNAL</small><h1>How are you feeling?</h1><p>Your entry is timestamped automatically.</p></div>${stateButtons()}<h3>Recent entries</h3>${journal.length?`<div class="timeline">${journal.map(j=>`<article><b>●</b><div><strong>${esc(j.state)}</strong><small>${new Date(j.recorded_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></div></article>`).join('')}</div>`:'<div class="empty"><strong>No check-ins yet today.</strong><span>Use the buttons above when movement changes.</span></div>'}`}
async function sendInvite(e){e.preventDefault();const email=new FormData(e.target).get('email');const b=e.target.querySelector('button');b.disabled=true;b.textContent='SAVING…';const {data,error}=await db.functions.invoke('invite-caregiver',{body:{email}});b.disabled=false;b.textContent='INVITE CAREGIVER';notify(error?.message||data?.error||data?.message||'Invitation saved')}
async function setPermission(caregiverId,field,value){const r=await db.from('patient_caregivers').update({[field]:value}).eq('patient_id',session.user.id).eq('caregiver_id',caregiverId);if(r.error)return notify(r.error.message);await loadPatientData();render();notify('Caregiver permission updated')}
async function removeCaregiver(caregiverId){if(!confirm('Remove this caregiver’s access?'))return;const r=await db.from('patient_caregivers').delete().eq('patient_id',session.user.id).eq('caregiver_id',caregiverId);if(r.error)return notify(r.error.message);await loadPatientData();render();notify('Caregiver access removed')}
function care(){
 const taken=doses.filter(d=>['taken','late'].includes(d.status)).length,pct=doses.length?Math.round(taken/doses.length*100):0;
 if(profile.role==='caregiver')return `<div class="title"><small>CAREGIVER VIEW</small><h1>Shared patient summary</h1><p>You can only view information this patient shared.</p></div><div class="summary"><div><b>${pct}%</b><small>Adherence</small></div><div><b>${doses.filter(d=>d.status==='skipped').length}</b><small>Missed</small></div><div><b>${journal.length}</b><small>Check-ins</small></div></div><button class="report" onclick="backToCare()">← CHANGE PATIENT</button>`;
 return `<div class="title"><small>CARE CIRCLE</small><h1>Invite a caregiver</h1><p>Enter their email address. They must sign in and accept before access is granted.</p></div><form class="invite-form" onsubmit="sendInvite(event)"><label>Caregiver email<input name="email" type="email" required placeholder="caregiver@example.com"></label><button class="report">INVITE CAREGIVER</button></form><h3>Connected caregivers</h3><div class="permissions">${caregiverLinks.map(c=>`<section><strong>${esc(c.profiles?.full_name||'Caregiver')}</strong><label><input type="checkbox" ${c.can_view?'checked':''} onchange="setPermission('${c.caregiver_id}','can_view',this.checked)"> Can view records</label><label><input type="checkbox" ${c.can_log_doses?'checked':''} onchange="setPermission('${c.caregiver_id}','can_log_doses',this.checked)"> Can log doses</label><button onclick="removeCaregiver('${c.caregiver_id}')">REMOVE ACCESS</button></section>`).join('')||'<div class="empty"><strong>No connected caregivers.</strong><span>Invitations must be accepted first.</span></div>'}</div><p class="privacy">🔒 You control each caregiver’s access.</p>`;
}
function backToCare(){patientId=null;loadCaregiverHome()}
function render(){nav.hidden=false;account.textContent=(profile.full_name||'?').slice(0,2).toUpperCase();screen.innerHTML=tab==='today'?today():tab==='schedule'?schedule():tab==='journal'?journalView():care()}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));render()});
account.onclick=async()=>{if(!session)return; if(confirm('Sign out of Steady Dose?'))await db.auth.signOut()};
db.auth.onAuthStateChange((_event,s)=>{session=s;if(s)load();else authView()});
db.auth.getSession().then(({data})=>{session=data.session;if(session)load();else authView()});