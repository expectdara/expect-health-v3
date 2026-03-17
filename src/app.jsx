const { useState, useEffect, useRef } = React;



// PILOT PHASE CONFIG — change when OAIP approves phase advancement
// Phase 1: 100% PT review (Months 1-4)
// Phase 2: Low-risk auto-approved, 10% audit; high-risk 100% PT review (Months 5-8)
// Phase 3: Auto-approval expanded; PT review for high-risk + first-time (Months 9-12)
const PILOT_PHASE=1;
const PILOT_CASES_VALIDATED=0; // total supervised cases completed — update as pilot progresses

const C={
  pink:"#FC228A",pinkL:"#FF5CA8",pinkD:"#C91A6E",
  purp:"#4C2C84",purpL:"#6B45A8",purpD:"#3A1F68",
  blue:"#008AFC",blueL:"#3AA6FF",blueD:"#0066BE",
  yel:"#D7FC51",yelD:"#A8C93E",
  white:"#FFFFFF",offW:"#F8F7FC",
  g50:"#FAFAFD",g100:"#F0EFF5",g200:"#E2E0EC",g300:"#C9C6D6",g400:"#9994AD",g500:"#6E6887",g600:"#524D66",g700:"#3A3650",g800:"#252238",g900:"#16142A",
  gn:"#22C55E",rd:"#EF4444",or:"#F59E0B",
};
const log=[];let _lid=0;let authSession=null;let ptSessionToken=null;let ptIdentity=null;
async function db(fn,args,opts){try{const hdrs={"Content-Type":"application/json"};const tok=ptSessionToken||authSession?.sessionToken;if(tok)hdrs["Authorization"]="Bearer "+tok;const r=await fetch("/api/db",{method:"POST",headers:hdrs,body:JSON.stringify({fn:"functions:"+fn,args:args||{}})});const d=await r.json();if(!r.ok)throw new Error(d.error);return d.result}catch(e){console.warn("[db]",fn,e.message);if(opts?.throw)throw e;return null}}
function L(t,d){const uid=authSession?.userId||ptIdentity?.userId||null;const det=ptIdentity?{...d,ptEmail:ptIdentity.email,ptName:ptIdentity.name}:(d||{});const evt={id:`A${++_lid}`,ts:new Date().toISOString(),type:t,...d};log.unshift(evt);db("insertAuditEvent",{eventId:evt.id,ts:evt.ts,type:t,details:det,userId:uid})}
// Shared audit event color map (used by PT AuditLog and OAIP audit stream)
const AUDIT_COLORS={consent_signed:C.blue,intake_done:C.pink,plan_generated:C.or,plan_reviewed:C.gn,plan_rejected:C.rd,encounter_note:C.purp,fax_init:C.g500,fax_confirmed:C.gn,plan_sent_patient:C.blue,msg_sent:C.g400,SAFETY_TRIGGER:"#DC2626",SAFETY_ANSWER_CHANGED:"#EA580C",CONCIERGE_SEARCH:C.purpL,CONCIERGE_PROVIDER_SELECTED:C.gn,CONCIERGE_VERIFICATION_REQUEST:C.or,CLINICAL_REGRESSION_FLAG:"#DC2626",EXERCISE_PAIN_REPORT:C.rd,TECHNICAL_ISSUE_REPORT:C.g500,depression_screen_positive:"#D97706",adverse_event_report:"#DC2626",clinical_review_request:C.or,daily_adherence_entry:C.gn,checkin_week8_complete:C.blue,PT_ALERT_NO_ICIQ_PROGRESS:"#EA580C",BOWEL_REGRESSION:C.or,flutsex_improvement:C.gn,flutsex_regression:C.rd,RTM_setup_complete:C.purpL,phq2_resource_card_shown:C.or,FOLLOWUP_NONRESPONSE:"#DC2626",CLINICAL_ESCALATION:"#DC2626",surgical_avoidance_confirmed:C.gn,psi_referral:C.or,psi_referral_approved:C.gn,phq2_followup_email_queued:C.or,expansion_match:C.blueL,month12_checkin_complete:C.blue,CARE_PLAN_DOWNLOADED:C.blue,PRENATAL_PROTOCOL_APPLIED:C.gn,OUTCOME_RECORD_CREATED:C.purpL,OUTCOME_RECORD_COMPLETED:C.gn,PT_PLAN_MODIFIED:C.or,account_created:C.gn,session_timeout:C.rd,identity_verified:C.blue,pt_login:C.purp,oaip_login:C.purp,landing_email_collected:C.blueL};
// PHI-sensitive audit keys that must be masked in auditor mode
const PHI_KEYS=["patient","name","email","dob","date_of_birth","phone","fax","ssn","mrn","address","city","zip","account","license","npi","ip","device","photo","identifier","name_first","name_last","physicianName","physicianFax","physicianNPI"];
// Shared PHI masking utility (used by PT AuditLog and OAIP audit stream)
function hashMask(name){return`ID-${Array.from(new Uint8Array(new TextEncoder().encode(name||""))).reduce((h,b)=>((h<<5)-h+b)>>>0,5381).toString(16).slice(0,6).toUpperCase()}`}
function maskDetails(details,masked){if(!masked)return details;return Object.fromEntries(Object.entries(details).map(([k,v])=>PHI_KEYS.includes(k)?[k,typeof v==="string"?hashMask(v):"[REDACTED]"]:[k,v]))}
// Shared PHQ-2 score computation
function calcPHQ2(ans){return(ans.phq2_interest||0)+(ans.phq2_mood||0)}
// Shared PSI Resource Card component
function PsiResourceCard({compact}){
  if(compact)return<div style={{background:"#FEF3C7",border:"1px solid #D97706",borderRadius:8,padding:12,marginTop:8}}>
    <div style={{fontWeight:700,fontSize:12,color:"#78350F",marginBottom:6}}>Mental Health Support Resources</div>
    {PSI_RESOURCES.crisis.map((r,i)=><div key={i}style={{fontSize:11,color:"#7F1D1D",marginBottom:3}}><strong>{r.name}:</strong> {r.phone} — {r.desc}</div>)}
    {PSI_RESOURCES.support.slice(0,2).map((r,i)=><div key={i}style={{fontSize:11,color:"#4B5563",marginBottom:3}}><strong>{r.name}</strong>{r.phone?" — "+r.phone:""}</div>)}
  </div>;
  return<div style={{borderRadius:12,overflow:"hidden",border:`2px solid ${C.purp}`,boxShadow:"0 2px 12px rgba(109,40,217,.15)"}}>
    <div style={{background:`linear-gradient(135deg,${C.purp},${C.pink})`,padding:"14px 18px",color:"#fff"}}>
      <div style={{fontSize:15,fontWeight:700}}>If you are in immediate danger or experiencing a crisis:</div>
    </div>
    <div style={{padding:"14px 18px",background:"#F5F3FF"}}>
      {PSI_RESOURCES.crisis.map((r,i)=><div key={i}style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<PSI_RESOURCES.crisis.length-1?"1px solid #E9D5FF":"none"}}>
        <span style={{fontSize:18}}>📞</span>
        <div><div style={{fontWeight:700,fontSize:13,color:"#4C1D95"}}>{r.name}: <a href={"tel:"+r.phone.replace(/[^0-9]/g,"")}style={{color:C.purp,textDecoration:"underline"}}>{r.phone}</a></div><div style={{fontSize:11,color:"#5B21B6"}}>{r.desc}</div></div>
      </div>)}
    </div>
    <div style={{padding:"14px 18px",background:"#FFFBEB",borderTop:"1px solid #FDE68A"}}>
      <div style={{fontSize:13,fontWeight:600,color:"#78350F",marginBottom:4}}>It sounds like you may be carrying a heavy load right now. You are not alone, and help is free and confidential:</div>
      {PSI_RESOURCES.support.map((r,i)=><div key={i}style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:i<PSI_RESOURCES.support.length-1?"1px solid #FEF3C7":"none"}}>
        <span style={{fontSize:16,marginTop:1}}>{r.url?"🔗":"📞"}</span>
        <div><div style={{fontWeight:600,fontSize:12,color:"#78350F"}}>{r.name}{r.phone?<span>: <a href={"tel:"+r.phone.replace(/[^0-9]/g,"")}style={{color:"#D97706"}}>{r.phone}</a></span>:null}</div><div style={{fontSize:11,color:"#92400E",lineHeight:1.5}}>{r.desc}</div>{r.url?<a href={r.url}target="_blank"rel="noopener noreferrer"style={{fontSize:11,color:"#6D28D9"}}>{r.url.replace(/https?:\/\/(www\.)?/,"")}</a>:null}</div>
      </div>)}
    </div>
    <div style={{padding:"10px 18px",background:"#F3F4F6",fontSize:10,color:"#6B7280",lineHeight:1.5}}>{PSI_RESOURCES.disclaimer}</div>
  </div>;
}

// ============================================================
// OUTCOME RECORDS — Adaptive Algorithm Foundation (Patent Option 1)
// ============================================================
const OUTCOME_RECORDS=[];let _orid=0;
function ageBracket(dob){if(!dob)return"unknown";const d=new Date(dob);if(isNaN(d))return"unknown";const y=new Date().getFullYear()-d.getFullYear();return y<18?"under18":y<30?"18-29":y<40?"30-39":y<50?"40-49":y<60?"50-59":"60+"}
function buildOutcomeRecord(intake,plan,reviewTimeSec){
  const a=intake.ans,iciq=intake.iciq,pain=intake.pain,gupi=intake.gupi,fluts=intake.fluts,fsex=intake.fsex,popdi=intake.popdi||sPOPDI(a);
  const phq2=calcPHQ2(a);
  const avoid=(a.avoid_activities||[]).filter(x=>x!=="none");
  const constip=(a.bowel_constipation??0)>=2||(a.bowel_frequency??3)<=1||(a.bristol_stool??4)<=2;
  const triggers=pain.triggers||[];
  const rec={id:`OR-${++_orid}-${Date.now()}`,created:new Date().toISOString(),
    baseline:{iciq:{total:iciq.total,severity:iciq.severity,subtype:iciq.subtype},fluts:{F:fluts.F,V:fluts.V,total:fluts.total},fsex:{total:fsex.total},gupi:{total:gupi.total,pain:gupi.pain,urinary:gupi.urinary,qol:gupi.qol,severity:gupi.severity},pain:{composite:pain.composite,functional:pain.functional,severity:pain.severity},phq2,age_bracket:ageBracket(a.dob),pregnancy_status:a.pregnancy_status||"none",delivery_type:a.delivery_type||null,weeks_postpartum:a.delivery_date?Math.round((Date.now()-new Date(a.delivery_date).getTime())/(7*24*60*60*1000)):null,constipation_composite:constip,avoidance_count:avoid.length,cue_preference:a.cue_preference||"default",pudendal_flag:triggers.includes("sitting_long")&&pain.composite>6,med_modify:a.med_modify??0,prior_treatment:a.prior_treatment||[],symptom_triggers:(a.symptoms_trigger||[]).filter(x=>x!=="none"),subtype:iciq.subtype,screener_pain:a.screen_pain==="yes",screener_sexual:a.screen_sexual==="yes",pelvic_history:(a.pelvic_history||[]).filter(x=>x!=="none"),popdi:{score:popdi.score,positiveCount:popdi.positiveCount,bulge:popdi.bulge,highBother:popdi.highBother}},
    treatment:{tier:iciq.total>=13?"Beginner":iciq.total>=6?"Moderate":"Advanced",exercise_ids:(plan.ex||[]).map(e=>e.n),exercise_count:(plan.ex||[]).length,adjunct_types:(plan.adjuncts||[]).map(x=>x.type),adjunct_count:(plan.adjuncts||[]).length,cue_type:a.cue_preference||"default",dx_codes:(plan.dx||[]).map(d=>d.c),risk_level:plan.risk||"green",prenatal_modified:!!plan.prenatal,pt_modified_exercises:false,pt_modified_adjuncts:false,pt_modified_goals:false,pt_rejection:false,review_time_seconds:reviewTimeSec||0},
    outcome:null};
  OUTCOME_RECORDS.push(rec);
  L("OUTCOME_RECORD_CREATED",{recordId:rec.id,tier:rec.treatment.tier,iciq:iciq.total,risk:rec.treatment.risk_level});
  return rec;
}
function completeOutcomeRecord(recordId,baseline,week8){
  const rec=OUTCOME_RECORDS.find(r=>r.id===recordId);if(!rec)return null;
  const iciqD=baseline.iciq-(week8.iciq??baseline.iciq),painD=baseline.pain-(week8.pain??baseline.pain),fsexD=baseline.fsex-(week8.fsex??baseline.fsex),phq2D=baseline.phq2-(week8.phq2??baseline.phq2);
  rec.outcome={iciq_delta:iciqD,pain_delta:painD,fsex_delta:fsexD,phq2_delta:phq2D,bowel_change:week8.bowel||"same",prolapse_followup:week8.prolapse_followup||null,nps:week8.nps??0,activities_resumed:week8.activities_status||"no",adherence_rate:week8.adherence_rate??0,dropout:false,adverse_event:false,clinically_meaningful:iciqD>=3};
  L("OUTCOME_RECORD_COMPLETED",{recordId:rec.id,iciq_delta:iciqD,clinically_meaningful:rec.outcome.clinically_meaningful});
  return rec;
}

// ============================================================
// BIOMARKER DISCOVERY ENGINE — Digital Biomarker Foundation (Patent Option 2)
// ============================================================
const BIOMARKER_CANDIDATES=[
  {id:"BM001",name:"Non-Response Predictor",desc:"High GUPI + high avoidance + PHQ-2 positive \u2192 poor ICIQ improvement",matchFn:r=>r.baseline.gupi.total>=20&&r.baseline.avoidance_count>=3&&r.baseline.phq2>=3,outcomeFn:r=>r.outcome?.iciq_delta??0,direction:"negative"},
  {id:"BM002",name:"Pudendal Early Detection",desc:"FLUTS voiding + pain + sitting trigger at lower thresholds than current heuristic",matchFn:r=>r.baseline.fluts.V>=4&&r.baseline.pain.composite>=4&&r.baseline.symptom_triggers.includes("sitting_long"),outcomeFn:r=>r.outcome?.iciq_delta??0,direction:"negative"},
  {id:"BM003",name:"Dropout Predictor",desc:"High avoidance + PHQ-2 + default cue + no prior treatment \u2192 poor response",matchFn:r=>r.baseline.avoidance_count>=3&&r.baseline.phq2>=2&&r.baseline.cue_preference==="default"&&(r.baseline.prior_treatment||[]).includes("none"),outcomeFn:r=>r.outcome?.iciq_delta??0,direction:"negative"},
  {id:"BM004",name:"Cue-Response Interaction",desc:"Breathing cue + high GUPI \u2192 better outcomes than biologic cue",matchFn:r=>r.baseline.cue_preference==="breathing"&&r.baseline.gupi.total>=15,compareFn:r=>r.baseline.cue_preference==="biologic"&&r.baseline.gupi.total>=15,outcomeFn:r=>r.outcome?.iciq_delta??0,direction:"positive"},
  {id:"BM005",name:"Tier Boundary Signal",desc:"Patients near ICIQ tier boundaries (5-7 or 12-14) \u2014 response pattern analysis",matchFn:r=>(r.baseline.iciq.total>=5&&r.baseline.iciq.total<=7)||(r.baseline.iciq.total>=12&&r.baseline.iciq.total<=14),outcomeFn:r=>r.outcome?.iciq_delta??0,direction:"exploratory"}
];
const BIOMARKER_MIN_N=30;
function normalCDF(x){if(x<0)return 1-normalCDF(-x);const t=1/(1+.2316419*x);return 1-.3989422804*Math.exp(-x*x/2)*(t*(.31938153+t*(-.35656378+t*(1.78147794+t*(-1.82125598+t*1.33027443)))))}
function approxPValue(t,df){if(df<2||!isFinite(t))return 1;const z=df>30?t*(1-1/(4*df))/Math.sqrt(1+t*t/(2*df)):Math.abs(t)*Math.sqrt((df-1.5)/(df*(1+t*t/df)));return 2*(1-normalCDF(Math.abs(z)))}
function analyzePatterns(records){
  const completed=records.filter(r=>r.outcome!==null);
  if(completed.length<BIOMARKER_MIN_N)return{sufficient:false,n:completed.length,required:BIOMARKER_MIN_N,signals:[]};
  return{sufficient:true,n:completed.length,required:BIOMARKER_MIN_N,signals:BIOMARKER_CANDIDATES.map(bm=>{
    const match=completed.filter(bm.matchFn),comp=bm.compareFn?completed.filter(bm.compareFn):completed.filter(r=>!bm.matchFn(r));
    if(match.length<5||comp.length<5)return{biomarker_id:bm.id,name:bm.name,desc:bm.desc,cohort_size:match.length,status:"insufficient",signal_strength:"gray"};
    const mD=match.map(bm.outcomeFn),cD=comp.map(bm.outcomeFn);
    const mM=mD.reduce((s,v)=>s+v,0)/mD.length,cM=cD.reduce((s,v)=>s+v,0)/cD.length;
    const mV=mD.reduce((s,v)=>s+(v-mM)**2,0)/(mD.length-1),cV=cD.reduce((s,v)=>s+(v-cM)**2,0)/(cD.length-1);
    const pooledSD=Math.sqrt(((mD.length-1)*mV+(cD.length-1)*cV)/(mD.length+cD.length-2));
    const d=pooledSD>0?(mM-cM)/pooledSD:0,se=Math.sqrt(mV/mD.length+cV/cD.length);
    const tStat=se>0?(mM-cM)/se:0;
    const dfN=(mV/mD.length+cV/cD.length)**2,dfD=(mV/mD.length)**2/(mD.length-1)+(cV/cD.length)**2/(cD.length-1);
    const p=approxPValue(Math.abs(tStat),dfD>0?dfN/dfD:1);
    const strength=p<.01&&Math.abs(d)>=.5?"strong":p<.05&&Math.abs(d)>=.3?"emerging":"insufficient";
    return{biomarker_id:bm.id,name:bm.name,desc:bm.desc,cohort_size:match.length,comparison_size:comp.length,mean_match:Math.round(mM*100)/100,mean_comparison:Math.round(cM*100)/100,effect_size:Math.round(d*100)/100,p_estimate:Math.round(p*1000)/1000,signal_strength:strength==="strong"?"green":strength==="emerging"?"yellow":"gray",status:strength};
  })};
}

// ============================================================
// PT EDIT DIFF CAPTURE — Tracks what PTs actually changed
// ============================================================
function computePtDiffs(initPlan,editExs,editAdj,editGoals){
  const diffs={exercises:[],adjuncts:[],goals:[]};
  const initEx=initPlan.ex||[],initAdj=initPlan.adjuncts||[],initG=initPlan.goals||[];
  const initExMap=new Map(initEx.map(e=>[e.n,e]));
  const editExMap=new Map(editExs.map(e=>[e.n,e]));
  initEx.forEach(e=>{if(!editExMap.has(e.n))diffs.exercises.push({action:"removed",name:e.n})});
  editExs.forEach(e=>{
    if(!initExMap.has(e.n)){diffs.exercises.push({action:"added",name:e.n,detail:`${e.s}x${e.r}, hold ${e.h}, ${e.f}`});return}
    const orig=initExMap.get(e.n);const ch=[];
    if(String(e.s)!==String(orig.s))ch.push(`sets:${orig.s}→${e.s}`);if(String(e.r)!==String(orig.r))ch.push(`reps:${orig.r}→${e.r}`);
    if(e.h!==orig.h)ch.push(`hold:${orig.h}→${e.h}`);if(e.f!==orig.f)ch.push(`freq:${orig.f}→${e.f}`);
    if(ch.length)diffs.exercises.push({action:"modified",name:e.n,changes:ch});
  });
  const initAdjMap=new Map(initAdj.map(a=>[a.n,a]));
  const editAdjMap=new Map(editAdj.map(a=>[a.n,a]));
  initAdj.forEach(a=>{if(!editAdjMap.has(a.n))diffs.adjuncts.push({action:"removed",name:a.n,type:a.type})});
  editAdj.forEach(a=>{
    if(!initAdjMap.has(a.n)){diffs.adjuncts.push({action:"added",name:a.n,type:a.type});return}
    const orig=initAdjMap.get(a.n);if(a.rx!==orig.rx||a.d!==orig.d)diffs.adjuncts.push({action:"modified",name:a.n,type:a.type});
  });
  const editG=editGoals.split("\n").filter(Boolean);
  editG.filter(g=>!initG.includes(g)).forEach(g=>diffs.goals.push({action:"added",text:g}));
  initG.filter(g=>!editG.includes(g)).forEach(g=>diffs.goals.push({action:"removed",text:g}));
  return diffs;
}
// AI-PT Agreement Rate — % of plans approved without substantive modification
function computeAgreementRate(records){
  if(!records||records.length===0)return{rate:0,total:0,unmodified:0};
  const unmod=records.filter(r=>!r.treatment.pt_modified_exercises&&!r.treatment.pt_modified_adjuncts&&!r.treatment.pt_modified_goals).length;
  return{rate:Math.round(unmod/records.length*1000)/10,total:records.length,unmodified:unmod};
}

const ICIQ=[
{id:"iciq1",text:"How often do you leak urine?",opts:[["Never",0],["About once a week or less often",1],["Two or three times a week",2],["About once a day",3],["Several times a day",4],["All the time",5]]},
{id:"iciq2",text:"How much urine do you usually leak, whether you wear protection or not?",conditional:a=>a.iciq1!==undefined&&a.iciq1!==0,opts:[["None",0],["A small amount",2],["A moderate amount",4],["A large amount",6]]},
{id:"iciq3",text:"Overall, how much does leaking urine interfere with your everyday life? Please pick a number between 0 (not at all) and 10 (a great deal).",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.iciq1!==undefined&&a.iciq1!==0},
{id:"iciq4",text:"Under what circumstances does urine leak? Please select all that apply to you.",type:"multi",conditional:a=>a.iciq1!==undefined&&a.iciq1!==0,opts:[["Never — urine does not leak","never"],["Leaks before you can get to the toilet","urgency"],["Leaks when you cough or sneeze","stress_cough"],["Leaks when you are physically active or exercising","stress_exercise"],["Leaks when you have finished urinating and are dressed","post_void"],["Leaks when you are asleep","nocturnal"],["Leaks for no obvious reason","unknown"],["Leaks all the time","continuous"]]},
];

// Selected FLUTS Filling + Voiding items (not the full ICIQ-FLUTS — Incontinence subscale dropped per Dugan, ICIQ-UI SF is primary incontinence instrument)
const FLUTS=[
{id:"fl2a",text:"During the night, how many times do you have to get up to urinate, on average?",opts:[["None",0],["One",1],["Two",2],["Three",3],["Four or more",4]]},
{id:"fl2b",text:"How much does getting up at night to urinate bother you? (0 = not at all, 10 = a great deal)",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.fl2a!==undefined&&a.fl2a!==0},
{id:"fl3a",text:"Do you have a sudden need to rush to the toilet to urinate?",opts:[["Never",0],["Occasionally",1],["Sometimes",2],["Most of the time",3],["All of the time",4]]},
{id:"fl3b",text:"How much does that sudden urgency bother you? (0 = not at all, 10 = a great deal)",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.fl3a!==undefined&&a.fl3a!==0},
{id:"fl5a",text:"How often do you pass urine during the day?",opts:[["1 to 6 times",0],["7 to 8 times",1],["9 to 10 times",2],["11 to 12 times",3],["13 or more times",4]]},
{id:"fl5b",text:"How much does your daytime urination frequency bother you? (0 = not at all, 10 = a great deal)",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.fl5a!==undefined&&a.fl5a!==0},
{id:"fl6a",text:"Is there a delay before you can start to urinate?",opts:[["Never",0],["Occasionally",1],["Sometimes",2],["Most of the time",3],["All of the time",4]]},
{id:"fl6b",text:"How much does that delay bother you? (0 = not at all, 10 = a great deal)",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.fl6a!==undefined&&a.fl6a!==0},
{id:"fl7a",text:"Do you have to strain to urinate?",opts:[["Never",0],["Occasionally",1],["Sometimes",2],["Most of the time",3],["All of the time",4]]},
{id:"fl7b",text:"How much does straining to urinate bother you? (0 = not at all, 10 = a great deal)",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.fl7a!==undefined&&a.fl7a!==0},
{id:"fl8a",text:"Do you stop and start more than once while you urinate?",opts:[["Never",0],["Occasionally",1],["Sometimes",2],["Most of the time",3],["All of the time",4]]},
{id:"fl8b",text:"How much does stop-and-start urination bother you? (0 = not at all, 10 = a great deal)",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.fl8a!==undefined&&a.fl8a!==0},
];

const FLUTSSEX=[
{id:"fs2a",text:"Do you have pain or discomfort because of a dry vagina?",opts:[["Not at all",0],["A little",1],["Somewhat",2],["A lot",3]]},
{id:"fs2b",text:"How much does vaginal dryness bother you? (0 = not at all, 10 = a great deal)",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.fs2a!==undefined&&a.fs2a!==0},
{id:"fs3a",text:"To what extent do you feel that your sex life has been affected by your urinary symptoms?",opts:[["Not at all",0],["A little",1],["Somewhat",2],["A lot",3]]},
{id:"fs3b",text:"How much does the impact on your sex life bother you? (0 = not at all, 10 = a great deal)",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.fs3a!==undefined&&a.fs3a!==0},
{id:"fs4a",text:"Do you have pain during sexual activity?",opts:[["Not at all",0],["A little",1],["Somewhat",2],["A lot",3],["I don't have sexual activity",4]]},
{id:"fs4b",text:"How much does pain during sexual activity bother you? (0 = not at all, 10 = a great deal)",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.fs4a!==undefined&&a.fs4a!==0&&a.fs4a!==4},
{id:"fs5a",text:"Do you leak urine during sexual activity?",opts:[["Not at all",0],["A little",1],["Somewhat",2],["A lot",3],["I don't have sexual activity",4]]},
{id:"fs5b",text:"How much does leaking during sexual activity bother you? (0 = not at all, 10 = a great deal)",type:"scale",min:0,max:10,lo:"Not at all",hi:"A great deal",conditional:a=>a.fs5a!==undefined&&a.fs5a!==0&&a.fs5a!==4},
];

// GUPI + Pain Assessment combined into one section ("Pain & Discomfort")
// Symptom screeners — gate pain and sexual sections
const SCREENER=[
{id:"screen_urinary",text:"Do you ever experience any loss of urine without your control?",opts:[["Yes","yes"],["No","no"]]},
{id:"screen_bowel",text:"Do you ever experience any concerns with bowel movements (e.g. constipation, straining, or accidental bowel leakage)?",opts:[["Yes","yes"],["No","no"]]},
{id:"screen_pain",text:"Over the past month, have you felt pain, pressure, or discomfort in your lower stomach, pelvis, bladder, or genital area?",opts:[["Yes","yes"],["No","no"]]},
{id:"screen_sexual",text:"Do your pelvic floor symptoms ever interfere with any vaginal penetration (e.g. sexual activity or intimacy, tampon use, or doctor exams)?",opts:[["Yes","yes"],["No","no"]]},
];
// Pain & discomfort questions (gated by screen_pain)
const GUPI_PAIN=[
{id:"gupi1_table",text:"In the last week, have you experienced any pain or discomfort in the following areas?",type:"yn_table",rows:[
  {id:"gupi1a",label:"Entrance to the vagina"},
  {id:"gupi1b",label:"Vagina"},
  {id:"gupi1c",label:"Urethra (the small opening where urine comes out)"},
  {id:"gupi1d",label:"Below the waist, in the pubic or bladder area"},
]},
{id:"gupi2_table",text:"In the last week, have you experienced any of the following?",type:"yn_table",rows:[
  {id:"gupi2a",label:"Pain or burning during urination"},
  {id:"gupi2b",label:"Pain or discomfort during or after sexual activity, tampon use, or any vaginal penetration"},
  {id:"gupi2c",label:"Pain or discomfort as your bladder fills"},
  {id:"gupi2d",label:"Pain or discomfort relieved by voiding (went away or got better after urinating)"},
]},
{id:"gupi3",text:"How often have you had pain or discomfort in any of the areas mentioned above — including the vaginal entrance, vagina, urethra, pubic area, or bladder — over the last week?",opts:[["Never",0],["Rarely",1],["Sometimes",2],["Often",3],["Usually",4],["Always",5]],conditional:a=>{const painYN=["gupi1a","gupi1b","gupi1c","gupi1d","gupi2a","gupi2b","gupi2c","gupi2d"];return painYN.some(k=>a[k]==="yes")}},
{id:"gupi4",text:"Which number best describes your AVERAGE pain or discomfort on the days you had it, over the last week? (0 = no pain, 10 = pain as bad as you can imagine)",type:"scale",min:0,max:10,lo:"No pain",hi:"Pain as bad as you can imagine",conditional:a=>a.gupi3!==undefined&&a.gupi3!==0},
{id:"pain1",text:"What is your current pelvic pain level right now? (0 = no pain, 10 = worst pain imaginable)",type:"scale",min:0,max:10,lo:"No pain",hi:"Worst pain imaginable"},
// pain2 removed — gupi4 ("average pain on days you had it, over the last week") serves as the
// canonical average pain item for both GUPI scoring and backend safety logic (measure once, use twice)
{id:"pain3",text:"How does your pain affect your daily activities?",opts:[["No effect",0],["Mild — I can do most activities",1],["Moderate — I avoid some activities",2],["Severe — I am significantly limited",3],["I cannot perform daily activities",4]]},
{id:"symptoms_location",text:"Where do you experience pain or discomfort? Please select all that apply.",type:"multi",opts:[["None — no pain","none"],["Lower abdomen","lower_abd"],["Pelvic floor","pelvic_floor"],["Vaginal area","vaginal"],["Lower back","lower_back"],["Hip area","hip"]]},
{id:"symptoms_trigger",text:"When do you feel pain or discomfort? Select all that apply.",type:"multi",conditional:a=>!((a.symptoms_location||[]).includes("none")||(a.symptoms_location||[]).length===0),opts:[["During urination","dysuria"],["As my bladder fills (relieved by urinating)","bladder_fills"],["During sexual activity","dyspareunia"],["While inserting a tampon","tampon"],["During bowel movements","bowel_movements"],["While sitting for long periods","sitting_long"],["None of the above","none"]]},
];
// GUPI urinary subscale (always shown, moved from GUPI_PAIN)
const GUPI_URINARY=[
{id:"gupi5",text:"Over the last week, how often have you had a sensation of not completely emptying your bladder after you finished urinating?",opts:[["Not at all",0],["Less than 1 time in 5",1],["Less than half the time",2],["About half the time",3],["More than half the time",4],["Almost always",5]]},
{id:"gupi6",text:"Over the last week, how often have you had to urinate again less than two hours after you finished urinating?",opts:[["Not at all",0],["Less than 1 time in 5",1],["Less than half the time",2],["About half the time",3],["More than half the time",4],["Almost always",5]]},
];
// Bowel health (always shown, moved from GUPI_PAIN)
const BOWEL=[
{id:"bowel_constipation",text:"Over the past month, how often have you experienced constipation or straining during bowel movements?",opts:[["Never",0],["Rarely",1],["Sometimes",2],["Often",3],["Almost always",4]]},
{id:"bowel_frequency",text:"How often do you typically have a bowel movement?",opts:[["Less than once a week",0],["1–4 times per week",1],["5–7 times per week",2],["1–2 times per day",3],["3 or more times per day",4]]},
{id:"bristol_stool",text:"Which best describes your usual stool form? (Bristol Stool Scale)",opts:[["Type 1: Separate hard lumps (like nuts), hard to pass",1],["Type 2: Sausage-shaped but lumpy",2],["Type 3: Sausage-shaped with cracks on the surface",3],["Type 4: Smooth and soft, like a sausage or snake",4],["Type 5: Soft blobs with clear-cut edges, easy to pass",5],["Type 6: Fluffy pieces with ragged edges, mushy",6],["Type 7: Watery, no solid pieces, entirely liquid",7]]},
];

const QOL_IMPACT=[
{id:"gupi7",text:"Over the last week, how much have your symptoms kept you from doing the kinds of things you would usually do?",opts:[["None",0],["Only a little",1],["Some",2],["A lot",3]]},
{id:"gupi8",text:"Over the last week, how much did you think about your symptoms?",opts:[["None",0],["Only a little",1],["Some",2],["A lot",3]]},
{id:"gupi9",text:"If you were to spend the rest of your life with your symptoms just the way they have been during the last week, how would you feel about that?",opts:[["Pleased",1],["Mostly satisfied",2],["Mixed — about equally satisfied and dissatisfied",3],["Mostly dissatisfied",4],["Unhappy",5],["Terrible",6]]},
];

// POPDI-6: Pelvic Organ Prolapse Distress Inventory (screener, not diagnostic)
const POPDI=[
{id:"popdi_table",text:"Pelvic Organ Prolapse Distress Inventory (POPDI-6)",type:"yn_bother_table",
 botherOpts:[["Not at all",1],["Somewhat",2],["Moderately",3],["Quite a bit",4]],
 rows:[
  {id:"popdi1",label:"Do you usually experience pressure in the lower abdomen?"},
  {id:"popdi2",label:"Do you usually experience heaviness or dullness in the pelvic area?"},
  {id:"popdi3",label:"Do you usually have a bulge or something falling out that you can see or feel in the vaginal area?"},
  {id:"popdi4",label:"Do you usually have to push on the vagina or around the rectum to have or complete a bowel movement?"},
  {id:"popdi5",label:"Do you usually experience a feeling of incomplete bladder emptying?"},
  {id:"popdi6",label:"Do you ever have to push up on a bulge in the vaginal area to start or complete urination?"},
]}];

// Additional clinical intake
const CLINICAL_EXTRA=[
{id:"caffeine_intake",text:"How many caffeinated drinks (coffee, tea, soda, energy drinks) do you have per day on average?",opts:[["None",0],["1 per day",1],["2-3 per day",2],["4 or more per day",3]]},
{id:"alcohol_intake",text:"How many alcoholic drinks do you have per week on average?",opts:[["None",0],["1-3 per week",1],["4-7 per week",2],["8 or more per week",3]]},
{id:"water_intake",text:"How many glasses of water (8 oz) do you drink per day on average?",opts:[["1-3 glasses",0],["4-5 glasses",1],["6-8 glasses",2],["More than 8 glasses",3]]},
{id:"phq2_interest",text:"Over the past 2 weeks, how often have you been bothered by having little interest or pleasure in doing things?",opts:[["Not at all",0],["Several days",1],["More than half the days",2],["Nearly every day",3]]},
{id:"phq2_mood",text:"Over the past 2 weeks, how often have you been bothered by feeling down, depressed, or hopeless?",opts:[["Not at all",0],["Several days",1],["More than half the days",2],["Nearly every day",3]]},
{id:"symptom_triggers",text:"What activities tend to trigger your symptoms? Please select all that apply.",type:"multi",opts:[["Lifting or carrying","lifting"],["Running or jumping","running"],["Coughing or sneezing","coughing"],["Laughing","laughing"],["Getting up from sitting or lying down","standing"],["Climbing stairs","stairs"],["Other exercises","other_exercise"],["Sexual activity","sexual"],["None in particular","none"]]},
{id:"avoid_activities",text:"Are you avoiding activities because of pelvic symptoms? Select all that apply.",type:"multi",opts:[["Exercise or sports","exercise"],["Social events","social"],["Travel","travel"],["Sexual activity","sexual"],["Lifting (children, groceries, etc.)","lifting"],["None — symptoms don't limit my activities","none"]]},
{id:"medications",text:"Are you taking any medications that might affect your bladder? (e.g., diuretics, antihistamines, antidepressants)",type:"text",ph:"List medications or type 'None'"},
{id:"med_modify",text:"Are you changing how you take any prescribed medication because of urinary symptoms? (e.g., skipping doses, changing timing)",opts:[["No",0],["Yes",1],["Not sure",2]]},
{id:"prior_treatment",text:"Have you had any prior treatment for pelvic floor issues?",type:"multi",opts:[["None — this is my first time","none"],["Pelvic floor PT (in-person)","prior_pt"],["Pelvic Floor PT (telehealth)","prior_pt_tele"],["Kegel exercises on my own","self_kegel"],["Other exercise","other_exercise"],["Pessary","pessary"],["Biofeedback device","biofeedback"],["Medication","medication"],["Surgery","surgery"]]},
{id:"cue_preference",text:"Which instruction style helps you find and activate your pelvic floor muscles?",opts:[["Body function: \"Squeeze as if stopping yourself from peeing\" (⚠ Do not perform while urinating) or \"Squeeze as if stopping yourself from passing gas\" (don't squeeze your buttock muscles)","biologic"],["Imaginative: \"Imagine gently closing around and lifting a blueberry\"","imaginative"],["Breath-based: \"While you breathe out, draw in and lift your pelvic floor\"","breathing"],["Simple: \"Contract your pelvic floor muscles\"","simple_contract"],["Not sure yet — surprise me","default"]]},
{id:"pelvic_history",text:"Do you have a history of any of the following that may affect your pelvic floor symptoms? Select all that apply.",type:"multi",opts:[["Diastasis recti","diastasis_recti"],["Back pain or back injury","back_pain"],["Hip pain or hip injury","hip_pain"],["Knee pain or knee injury","knee_pain"],["Osteoarthritis","oa"],["Motor vehicle accident","mva"],["Pelvic or abdominal surgery","pelvic_surgery"],["Other injury affecting the pelvic region","other_pelvic"],["None of the above","none"]]},
{id:"patient_goal",text:"In your own words, what is the main thing you'd like to be able to do more comfortably?",type:"textarea",ph:"e.g., 'Exercise without leaking', 'Pick up my child without pain'"},
{id:"catchall_pelvic",text:"Is there anything else bothering you in the pelvic region that we haven't asked about?",type:"textarea",ph:"Describe any additional concerns, or leave blank if none."},
];

const REDFLAGS=[
{id:"rf_bleed",text:"Are you experiencing any unexplained vaginal bleeding?",type:"yn",rf:true,act:"physician",msg:"Unexplained bleeding requires physician evaluation before starting PT."},
{id:"rf_fever",text:"Do you currently have a fever — temperature above 100.4°F (38°C)?",type:"yn",rf:true,act:"er",msg:"A fever at this level may indicate infection or a serious condition requiring medical evaluation. If you are postpartum, this is especially urgent. Please call 911 or go to the ER immediately."},
{id:"rf_chest",text:"Are you experiencing any chest pain or difficulty breathing?",type:"yn",rf:true,act:"er",msg:"This requires immediate medical attention. Please call 911."},
{id:"rf_head",text:"Do you have a severe headache along with any changes in your vision?",type:"yn",rf:true,act:"er",msg:"A severe headache with vision changes may indicate a serious neurological or vascular condition. In postpartum patients, this could signal preeclampsia or eclampsia. Please call 911 immediately."},
{id:"rf_uti",text:"Are you experiencing burning during urination, blood in your urine, or frequent urination along with a fever?",type:"yn",rf:true,act:"physician",msg:"These may indicate a UTI. Please contact your physician before starting PT."},
];

// Exclusion screening — conditions outside platform scope (Section 3.7 Safe Harbor)
const EXCLUSIONS=[
{id:"ex_neuro",text:"Have you been diagnosed with a neurological condition that affects your bladder or pelvic floor? (e.g., multiple sclerosis, spinal cord injury, Parkinson's disease, stroke)",type:"yn",rf:true,act:"physician",msg:"Neurogenic bladder conditions require specialized in-person evaluation. This platform is not designed for neurological pelvic floor conditions. Please consult your physician or a specialist PT."},
{id:"ex_mesh",text:"Have you had pelvic mesh surgery or any other pelvic surgery that is still causing you problems?",type:"yn",rf:true,act:"physician",msg:"Post-surgical pelvic conditions — especially mesh complications — require in-person specialist evaluation. Please consult your physician or a pelvic floor surgeon."},
{id:"ex_prolapse",text:"Have you been told by a doctor that you have a significant pelvic organ prolapse (Grade 3 or higher)?",type:"yn",rf:true,act:"physician",msg:"Advanced pelvic organ prolapse requires in-person evaluation and may need treatment beyond home-based PT. Please consult your physician."},
{id:"ex_cancer",text:"Do you have a known or suspected cancer in your pelvic area (bladder, uterine, cervical, ovarian)?",type:"yn",rf:true,act:"physician",msg:"Suspected or confirmed pelvic malignancy requires physician-directed care. Please consult your oncology or gynecology team."},
{id:"ex_infection",text:"Do you currently have an active pelvic infection, fistula, or abscess?",type:"yn",rf:true,act:"physician",msg:"Active pelvic infections require medical treatment before starting a PT program. Please consult your physician."},
{id:"ex_ic_hunner",text:"Have you been diagnosed with interstitial cystitis with confirmed Hunner lesions?",type:"yn",rf:true,act:"physician",msg:"Interstitial cystitis with Hunner lesions requires specialized urological management beyond the scope of this platform. Please consult your urologist."},
{id:"ex_highrisk_preg",text:"Have you been told by your OB/GYN or midwife that you have a high-risk pregnancy or been advised to avoid exercise?",type:"yn",rf:true,act:"physician",msg:"Please consult your prenatal care team before starting any pelvic floor program. We're here when you get the green light.",conditional:a=>!!a.prenatal_flag},
];
// SCORING (unchanged references — GUPI items still named gupiXX, pain items still painXX)
function sICIQ(a){const t=(a.iciq1??0)+(a.iciq2??0)+(a.iciq3??0);const sv=t===0?"None":t<=5?"Slight":t<=12?"Moderate":t<=18?"Severe":"Very Severe";const ty=a.iciq4||[];const u=ty.includes("urgency"),s=ty.includes("stress_cough")||ty.includes("stress_exercise");const sub=u&&s?"Mixed UI":u?"Urge UI":s?"Stress UI":ty.includes("continuous")?"Continuous UI":"Unclassified";return{total:t,severity:sv,subtype:sub}}
function sFLUTS(a){const F=(a.fl2a??0)+(a.fl3a??0)+(a.fl5a??0);const V=(a.fl6a??0)+(a.fl7a??0)+(a.fl8a??0);return{F,V,total:F+V}}
function sFSEX(a){return{total:(a.fs2a??0)+(a.fs3a??0)+Math.min(a.fs4a??0,3)+Math.min(a.fs5a??0,3)}}
function sGUPI(a){const p=(a.gupi1a==="yes"?1:0)+(a.gupi1b==="yes"?1:0)+(a.gupi1c==="yes"?1:0)+(a.gupi1d==="yes"?1:0)+(a.gupi2a==="yes"?1:0)+(a.gupi2b==="yes"?1:0)+(a.gupi2c==="yes"?1:0)+(a.gupi2d==="yes"?1:0)+(a.gupi3??0)+(a.gupi4??0);const u=(a.gupi5??0)+(a.gupi6??0);const q=(a.gupi7??0)+(a.gupi8??0)+(a.gupi9??0);const t=p+u+q;return{total:t,pain:p,urinary:u,qol:q,severity:t<=14?"Mild":t<=29?"Moderate":"Severe"}}
// sPain: composite uses gupi4 (GUPI average pain) as the canonical "average pain" item — measure once, use twice
function sPain(a){const c=a.pain1??0,v=a.gupi4??0,f=a.pain3??0;const cm=v>0?Math.round((c+v)/2*10)/10:c;const locs=(a.symptoms_location||[]).filter(x=>x!=="none");const trigs=(a.symptoms_trigger||[]).filter(x=>x!=="none");return{current:c,average:v,composite:cm,functional:f,severity:cm===0?"None":cm<=3?"Mild":cm<=6?"Moderate":"Severe",locations:locs,triggers:trigs}}
// sPOPDI: Pelvic Organ Prolapse Distress Inventory — symptom screener (not diagnostic)
function sPOPDI(a){const ids=["popdi1","popdi2","popdi3","popdi4","popdi5","popdi6"];const pos=ids.filter(k=>a[k]==="yes");const bothers=pos.map(k=>a[k+"_bother"]??0).filter(b=>b>0);const mean=bothers.length>0?bothers.reduce((s,v)=>s+v,0)/bothers.length:0;const score=Math.round(mean*25);return{score,positiveCount:pos.length,bulge:a.popdi3==="yes"||a.popdi6==="yes",highBother:bothers.some(b=>b>=3)}}

// Expansion Library — shorthand-to-patient-friendly mappings (per MyCareplan Feature Spec §1.4)
const EXPANSION_LIB={
"biofeedback device":{n:"PF Biofeedback Device",type:"device",d:"Surface EMG home biofeedback (e.g., Pericoach, Elvie) for real-time PF contraction feedback.",rx:"Consider if patient does not progress with HEP alone by week 4.",patientText:"To confirm you are isolating the correct muscles, we recommend using an FDA-cleared biofeedback device. This small sensor connects to your phone and shows you in real time when you are squeezing correctly — like a Fitbit for your pelvic floor. Research shows women who use biofeedback progress faster. Your PT will recommend a specific device based on your needs.",badge:"library"},
"kegels":{n:"Pelvic Floor Exercises",type:"behavioral",d:"Pelvic floor muscle training (Kegels) — both quick-flick and endurance holds per prescribed HEP.",rx:"Follow prescribed exercise protocol.",patientText:"Pelvic floor muscle exercises (Kegels) involve squeezing and lifting the muscles that support your bladder, uterus, and rectum. Your PT has prescribed a specific combination of quick squeezes and longer holds tailored to your assessment results.",badge:"library"},
"bladder diary":{n:"Bladder Diary",type:"behavioral",d:"3-day voiding diary to establish baseline frequency, volume, and leak episodes.",rx:"Complete before next visit.",patientText:"Please keep a bladder diary for 3 days before your next visit. Record what you drink, when you urinate, how much you void, and any leaking episodes. This helps your PT understand your unique bladder pattern and tailor your program. You can use a paper diary (a sample is included in your care plan) or a bladder diary app such as Squeezy (by the NHS).",badge:"library"},
"urge suppression":{n:"Urge Suppression Training",type:"behavioral",d:"Freeze-and-squeeze technique for urge wave management. Normal bladder emptying is every 2-4 hours.",rx:"Practice with each urgency episode.",patientText:"Normal bladder emptying is every 2–4 hours. When you feel a strong, sudden urge to urinate before 2 hours, try urge suppression techniques: stop where you are, do 5 quick pelvic floor squeezes, take 3 slow breaths, wait for the urge to pass, then walk calmly to the bathroom.",badge:"library"},
"fluid intake":{n:"Fluid Intake Optimization",type:"behavioral",d:"Fluid management education — 6-8 glasses/day, reduce bladder irritants.",rx:"Begin immediately.",patientText:"Aim to drink 6–8 glasses (48–64 oz) of water per day, spread evenly. Reduce caffeine, alcohol, citrus, and carbonated drinks, which can irritate the bladder and worsen urgency and frequency. This can be particularly bothersome on an empty stomach. Drink water first.",badge:"library"},
"posture correction":{n:"Posture Correction",type:"behavioral",d:"Postural alignment education for optimal PF loading.",rx:"Integrate into daily habits.",patientText:"Good posture supports your pelvic floor. When sitting, keep feet flat on the floor, weight even on both sit bones, and gently lengthen your spine. Avoid slumping, which increases downward pressure on your pelvic floor. It may be helpful to use a cushion with a tailbone relief cutout for less pressure on the tailbone. Use enough pillow or padding for support at your back.",badge:"library"},
"bowel health":{n:"Bowel Health Program",type:"behavioral",d:"Toileting posture, fiber/fluid optimization, defecation dynamics.",rx:"Address constipation to reduce PF strain.",patientText:"Healthy bowel habits support pelvic floor recovery. Aim for regular, soft bowel movements by eating 25–30g of fiber daily, drinking plenty of water, and using a footstool to elevate your feet on the toilet. Adding electrolytes or magnesium citrate can help soften the stool and reduce straining.",badge:"library"},
"ice/heat":{n:"Ice/Heat Therapy",type:"device",d:"Cryotherapy or thermotherapy for pelvic pain management.",rx:"Apply as needed for pain flares.",patientText:"Apply ice to the impacted area for 10–15 minutes to reduce inflammation, or use a warm compress for 15–20 minutes to relax tight muscles. Alternate as directed by your PT.",badge:"library"},
"pessary":{n:"Internal Vaginal Support Device",type:"device",d:"Recommend internal vaginal device for light mechanical pelvic organ support.",rx:"If there is light leaking with activity or pressure symptoms persist at week 8.",patientText:"An internal vaginal support device is a small, flexible silicone or plastic device placed inside the vagina to provide support for pelvic organs and press on the urethra for light leaking. Your PT may recommend a device that can be trialed for light support with activities and upright activities (e.g., Impressa, Revive, or Uresta).",badge:"library"},
"tens":{n:"TENS Unit for Pain",type:"device",d:"Transcutaneous electrical nerve stimulation for pelvic/perineal pain.",rx:"Home TENS unit if pain persists above 4/10.",patientText:"A TENS unit is a small device that sends mild electrical pulses through skin pads for drug-free pain relief. Relief usually begins within 15-30 minutes. Available at pharmacies or online.",badge:"library"},
"dilator":{n:"Vaginal Dilator Therapy",type:"device",d:"Graduated plastic or silicone dilator set for desensitization and tissue mobility.",rx:"Start smallest size, progress per tolerance.",patientText:"Vaginal dilators are plastic or medical-grade silicone cylinders in graduated sizes for gently desensitizing vaginal tissue. You can use them on your own for pelvic floor stretching. If you use them regularly, it can teach the brain to do less guarding and help the tight muscles to relax at your own pace. Never rushed — you are always in control.",badge:"library"},
};
function matchExpansion(input){if(!input||input.trim().length<3)return null;const k=input.trim().toLowerCase();if(EXPANSION_LIB[k])return{...EXPANSION_LIB[k],matchType:"exact"};for(const[key,val]of Object.entries(EXPANSION_LIB)){if(key.includes(k)||k.includes(key))return{...val,matchType:"partial"}}return null}

// ============================================================
// PATIENT CONTENT LIBRARIES
// ============================================================
const PATIENT_EX={
"Supine PF Activation":{name:"Lying Down Pelvic Floor Wake-Up",why:"When your pelvic floor muscles are weak, it's easiest to start lying down. Gravity isn't working against you, so your muscles can focus on learning the right movement pattern.",howTo:["Lie on your back with knees bent, feet flat, hip-width apart.","Place one hand on your lower belly. Relax your jaw, shoulders, belly, buttocks.","Imagine stopping the flow of urine, or gently lifting your vaginal opening upward and inward.","Hold the squeeze gently for 3-5 seconds, then fully release and rest for 5 seconds.","Repeat 8 times. Rest 30 seconds. Do the whole set again (2 sets)."],mistakes:["Holding your breath — keep breathing normally","Squeezing buttocks or inner thighs — only your pelvic floor should work","Bearing down instead of lifting up","Gripping too hard — about 50% effort"],stop:"Stop if pain above 3/10 or any sharp/burning sensation.",tips:"Do this before bed or first thing in the morning. You can practice while nursing or feeding your baby."},
"Diaphragmatic Breathing + PF":{name:"Belly Breathing with Pelvic Floor",why:"Your diaphragm and pelvic floor move together. Learning to coordinate them helps your pelvic floor work automatically during daily life.",howTo:["Lie on your back with knees bent. One hand on chest, one on belly.","Breathe IN through nose for 4 seconds. Belly rises. Chest stays still. Pelvic floor relaxes.","Breathe OUT through pursed lips for 6 seconds. Gently lift your pelvic floor as you exhale.","EXHALE = gentle pelvic floor lift. INHALE = full pelvic floor release.","Do 5 full breath cycles. Rest 30 seconds. Repeat (2 sets)."],mistakes:["Breathing too fast — 4 seconds in, 6 seconds out","Only breathing into chest — make belly rise","Forgetting to fully relax on inhale","Tensing neck and shoulders"],stop:"Should never cause pain. If dizzy, return to normal breathing.",tips:"The most important exercise in your program. Practice while watching TV, before sleep, during feeding time."},
"Gentle Bridge":{name:"Bridge Lift with Pelvic Floor",why:"Bridges strengthen your glutes, core, and pelvic floor together. Your pelvic floor, transverse abdominals, diaphragm, and deep back muscles all work as a team here.",howTo:["Lie on your back, knees bent, feet flat and hip-width apart. Arms at sides. Keep your spine neutral — don't arch your back.","Inhale into your diaphragm to prepare.","As you exhale, gently engage your pelvic floor FIRST — then begin lifting your hips. The pelvic floor initiates before the hips rise.","Slowly lift hips until your body makes a straight line from shoulders to knees. Keep shoulders level.","Hold for 5 seconds at the top, breathing normally — do not hold your breath.","Slowly lower back down. Fully release your pelvic floor. Rest 5 seconds.","Repeat 10 times per set. Aim for 2 sets."],mistakes:["Lifting hips before engaging pelvic floor — PF engages FIRST","Arching lower back at the top — keep a straight line","Holding your breath at the top — breathe normally","Squeezing knees together — keep hip-width apart","Moving too fast — slow and controlled"],stop:"If your back starts to hurt, your core muscles are tiring — stop and rest immediately. Pelvic floor engagement matters more than how high you lift.",tips:"You can gently tuck your pelvis slightly to help initiate the movement from your hips, not your lower back. Build up to holding for 10 seconds."},
"Quick-Flick Kegels":{name:"Quick Squeeze Kegels",why:"These train the fast-twitch muscles — the ones that quickly tighten to prevent leaking when you cough, sneeze, laugh, or jump.",howTo:["Sit or lie comfortably.","Squeeze your pelvic floor as quickly and strongly as you can.","Immediately release completely.","Rest 2-3 seconds between each squeeze.","Do 8-10 squeezes per set, 2 sets."],mistakes:["Holding the squeeze too long — this is about speed","Not fully releasing between squeezes","Holding your breath","Using buttock or thigh muscles"],stop:"Stop if pain above 3/10.",tips:"Practice right before you cough, sneeze, or lift. This 'brace before you sneeze' technique (The Knack) is one of the most effective leak-prevention strategies."},
"Endurance Kegels":{name:"Long Hold Kegels",why:"These train the slow-twitch muscles — the ones providing ongoing support throughout the day, keeping organs in place and maintaining continence.",howTo:["Lie on your side with a pillow between knees.","Gently squeeze your pelvic floor to about 50-70% effort.","Hold for 5 seconds while breathing normally.","Fully release and rest for 5 seconds.","Repeat 8 times, 2 sets."],mistakes:["Holding your breath during the hold","Squeezing at maximum effort — moderate is better","Cutting the rest short","Substituting with abs or glutes"],stop:"Stop if fatigue causes form breakdown, or pain above 3/10.",tips:"Gradually increase hold time to 10 seconds. Quality matters more than quantity."},
"Pain De-Sensitization Breathing":{name:"Calming Breath for Pain Relief",why:"When in pain, your nervous system tightens pelvic floor muscles and makes pain worse. This breathing activates your calming response.",howTo:["Find a quiet, comfortable place. Lie down or sit supported.","Close your eyes. Place both hands on your belly.","Breathe in through nose for 4 seconds. Feel belly expand.","Breathe out through mouth for 8 seconds — as slowly as possible.","Continue for 2 full minutes.","Focus only on breathing. If your mind wanders, bring it back."],mistakes:["Making exhale too short","Getting frustrated if pain doesn't decrease immediately","Tensing jaw or shoulders"],stop:"Use as often as needed. No side effects.",tips:"Use before stressful situations, during pain flares, or before intimacy."},
"Bridge + PF":{name:"Bridge Lift with Pelvic Floor",why:"Bridges strengthen glutes and core while your pelvic floor works against gravity. PF, transverse abs, diaphragm, and deep back muscles work as a team.",howTo:["Lie on your back, knees bent, feet flat hip-width apart. Arms at sides. Spine neutral.","Inhale into your diaphragm to prepare.","Exhale — engage pelvic floor FIRST, then lift hips to a straight line from shoulders to knees.","Hold 5-10 seconds at top, breathing normally.","Slowly lower. Fully release pelvic floor.","Repeat 10 times, 2 sets."],mistakes:["Lifting before engaging PF","Arching lower back","Moving too fast","Forgetting the pelvic floor engagement","Not fully releasing at bottom"],stop:"Stop if low back pain or pelvic pressure. Back pain = core fatigue.",tips:"As this gets easier, try lifting one foot slightly at the top (marching bridge). Build to 10s holds."},
"Diaphragmatic Breathing":{name:"Belly Breathing",why:"Your diaphragm and pelvic floor move together. Proper breathing is the foundation of pelvic floor coordination.",howTo:["Lie or sit comfortably. One hand on chest, one on belly.","Breathe in through nose for 4 seconds — belly rises, chest still. Pelvic floor relaxes.","Breathe out through pursed lips for 6 seconds — belly falls. Pelvic floor lifts.","Do 5 full breath cycles, once daily."],mistakes:["Breathing only into chest","Forcing pelvic floor engagement","Breathing too fast"],stop:"Should never cause pain or dizziness.",tips:"Practice anytime — in the car, at your desk, before bed. Also helps with stress."},
"Incline PF Activation":{name:"Incline Pelvic Floor Wake-Up",prenatalMod:true,why:"This is your pelvic floor awareness exercise adapted for pregnancy. Using a supported incline instead of lying flat avoids compressing a major blood vessel (the vena cava), keeping blood flow safe for you and your baby.",howTo:["Prop yourself up at a 30–45° incline using pillows or a wedge. Knees bent, feet flat, hip-width apart.","Place one hand on your lower belly. Relax your jaw, shoulders, belly, buttocks.","Imagine gently lifting your vaginal opening upward and inward.","Hold the squeeze gently for 3-5 seconds, then fully release and rest for 5 seconds.","Repeat 8 times. Rest 30 seconds. Do the whole set again (2 sets)."],mistakes:["Holding your breath — keep breathing normally","Squeezing buttocks or inner thighs — only your pelvic floor should work","Bearing down instead of lifting up","Gripping too hard — about 50% effort"],stop:"Stop if pain above 3/10, any sharp/burning sensation, dizziness, or shortness of breath.",tips:"Do this before bed or first thing in the morning. A wedge pillow makes this very comfortable during pregnancy."},
"Incline Bridge + PF":{name:"Supported Bridge with Pelvic Floor (Prenatal)",prenatalMod:true,why:"Bridges strengthen glutes and core while your pelvic floor works against gravity. This version uses an incline to avoid lying flat during pregnancy.",howTo:["Prop your upper back and head on a wedge pillow or stack of pillows at a 30° incline. Knees bent, feet flat hip-width apart.","Place a rolled towel under your right hip to shift weight slightly left.","Inhale into your diaphragm to prepare.","Exhale — engage pelvic floor FIRST, then gently lift hips. Keep the lift moderate.","Hold 5 seconds at top, breathing normally.","Slowly lower. Fully release pelvic floor.","Repeat 8 times, 2 sets."],mistakes:["Lifting before engaging PF","Arching lower back","Holding your breath at the top","Lifting too high — moderate lift is sufficient during pregnancy"],stop:"Stop if low back pain, pelvic pressure, dizziness, or any discomfort. Do not continue if you feel lightheaded.",tips:"As your pregnancy progresses, reduce the height of your bridge lift. The pelvic floor engagement matters more than how high you lift."},
"Side-Lying PF Activation":{name:"Side-Lying Pelvic Floor Wake-Up",prenatalMod:true,why:"Side-lying is the safest position for pelvic floor exercises during pregnancy. There is no pressure on your back or blood vessels.",howTo:["Lie on your left side with a pillow between your knees for comfort.","Rest your head on a pillow. Keep your spine neutral.","Gently engage your pelvic floor — imagine lifting upward and inward.","Hold the squeeze gently for 3-5 seconds, then fully release and rest for 5 seconds.","Repeat 8 times. Rest 30 seconds. Do the whole set again (2 sets)."],mistakes:["Holding your breath","Squeezing buttocks or inner thighs","Bearing down instead of lifting up"],stop:"Stop if pain above 3/10 or any discomfort.",tips:"Left side-lying is ideal for blood flow during pregnancy. This position is also great for relaxation before sleep."},
"Diaphragmatic Breathing + PF (Prenatal)":{name:"Belly Breathing with Pelvic Floor (Prenatal)",prenatalMod:true,why:"Your diaphragm and pelvic floor move together. This version avoids the flat-on-back position to keep you and your baby comfortable.",howTo:["Prop yourself at a 30–45° incline with pillows, or sit comfortably in a supported chair. One hand on chest, one on belly.","Breathe IN through nose for 4 seconds. Belly rises. Chest stays still. Pelvic floor relaxes.","Breathe OUT through pursed lips for 6 seconds. Gently lift your pelvic floor as you exhale.","EXHALE = gentle pelvic floor lift. INHALE = full pelvic floor release.","Do 5 full breath cycles. Rest 30 seconds. Repeat (2 sets)."],mistakes:["Breathing too fast — 4 seconds in, 6 seconds out","Only breathing into chest — make belly rise","Forgetting to fully relax on inhale"],stop:"Should never cause pain. If dizzy, return to normal breathing and sit upright.",tips:"The most important exercise in your program. As your belly grows, you may find sitting more comfortable than incline lying."}
};
const PATIENT_ADJ={
"PF Biofeedback Device":{name:"Pelvic Floor Biofeedback Device",type:"device",what:"A small sensor that connects to your phone and shows exactly when you're squeezing correctly. Like a Fitbit for your pelvic floor.",why:"Research shows women who use biofeedback progress faster.",expect:"Improved awareness within the first week. Clear strength difference by week 4.",howToGet:"Elvie Trainer (~$200) or Pericoach (~$300). Some insurance covers with prescription.",note:"May be recommended if exercises alone aren't enough by week 4."},
"Pessary Evaluation":{name:"Internal Vaginal Support Device",type:"device",what:"A small, flexible silicone or plastic device placed inside the vagina to provide support for pelvic organs and press on the urethra for light leaking.",why:"Provides immediate support while you build strength through exercises.",expect:"Your PT may recommend a device that can be trialed for light support with activities and upright activities.",howToGet:"Over-the-counter options include Impressa, Revive, or Uresta. Traditional pessaries require fitting with a urogynecologist or OB/GYN.",note:"May be discussed if there is light leaking with activity or pressure symptoms persist at week 8."},
"Bladder Training Program":{name:"Bladder Retraining",type:"behavioral",what:"A structured program to retrain your bladder and reduce urgency. Normal bladder emptying is every 2–4 hours. Teaches your brain to override false signals.",why:"One of the most effective treatments for urge incontinence.",expect:"Most see improvement in 4-6 weeks.",howToGet:"Your PT creates a personalized schedule with a bladder diary. You can also use a bladder diary app such as Squeezy (by the NHS).",note:"When you feel a strong, sudden urge before 2 hours: STOP, do 5 quick squeezes, take 3 slow breaths, wait for the urge to pass, then walk calmly to the bathroom."},
"Vaginal Dilator Therapy":{name:"Vaginal Dilator Therapy",type:"device",what:"Plastic or medical-grade silicone cylinders in graduated sizes for gently desensitizing vaginal tissue and pelvic floor stretching.",why:"If used regularly, it can teach the brain to do less guarding and help tight muscles to relax. Your nervous system learns to stop interpreting touch as pain.",expect:"Most work through the set over 6-12 weeks at your own pace.",howToGet:"Intimate Rose or Soul Source (~$50-90). Use with water-based lubricant.",note:"Never rushed. You are always in control."},
"Bowel Management Program":{name:"Bowel Health Program",type:"behavioral",what:"Simple changes to how you sit, eat, and go — designed to reduce straining.",why:"Straining puts enormous pressure on your pelvic floor — directly against the muscles you're strengthening.",expect:"Most notice easier bowel movements within 1-2 weeks.",howToGet:"Start today.",note:"Use a footstool on the toilet, get 25-30g fiber daily, drink 6-8 glasses water. Adding electrolytes or magnesium citrate can help soften the stool. Never strain."},
"Lifestyle Modifications":{name:"Lifestyle Changes That Help",type:"behavioral",what:"Simple daily habits that reduce symptoms alongside exercises.",why:"Certain habits directly stress your pelvic floor. Changing them helps even before exercises kick in.",expect:"Many notice fewer urgency episodes within 1-2 weeks.",howToGet:"Start with whichever feels easiest.",note:"Reduce caffeine, drink water throughout day, exhale before lifting, sit tall."},
"In-Person PT Evaluation":{name:"In-Person PT Visit (If Needed)",type:"referral",what:"A hands-on evaluation for direct muscle assessment through internal exam.",why:"Some patients benefit from hands-on assessment if telehealth progress slows.",expect:"Involves a vaginal/rectal exam (with consent).",howToGet:"Discussed at week 4 check-in if scores haven't improved enough.",note:"Not a sign of failure — may benefit from hands-on techniques alongside exercises."},
"TENS Unit for Pain":{name:"TENS Unit for Pain",type:"device",what:"A small device sending mild electrical pulses through skin pads for drug-free pain relief.",why:"Your pain scores are significant. TENS provides relief you control at home.",expect:"Relief usually begins within 15-30 min.",howToGet:"Available at pharmacies/online ($30-60).",note:"May be recommended if pain hasn't improved by week 2."}
};
const SCORE_EXP={
iciq:{"None":"Your bladder leakage score is 0 — you're not currently experiencing leaking.","Slight":"Your score is in the mild range. Many patients see significant improvement within 4-6 weeks.","Moderate":"Your score is in the moderate range. Patients respond well to exercises, bladder training, and lifestyle changes.","Severe":"Your score is in the severe range. This IS treatable. Your program will be more intensive with frequent check-ins.","Very Severe":"Your score is in the very severe range. Your program will be comprehensive with close monitoring."},
pain:{"None":"No current pain reported.","Mild":"Mild pain — typically improves well with breathing and relaxation exercises.","Moderate":"Moderate pain. Your program includes pain management. Don't push through pain above 3/10.","Severe":"Significant pain level. Pain reduction will be a primary focus."}};

const PSI_RESOURCES={
crisis:[
{name:"988 Suicide & Crisis Lifeline",phone:"988",desc:"Call or text 988, or go to your nearest emergency room."},
{name:"Huntsman Mental Health Institute",phone:"(801) 587-3000",desc:"Mobile crisis team that can come to you — available 24/7."}
],
support:[
{name:"PSI HelpLine",phone:"(800) 944-4773",desc:"Call or text. PSI volunteers are trained moms who've dealt with anxiety or depression. Support, resources, and information are free and confidential. Messages returned within 24 hours."},
{name:"PSI Online Peer Support",url:"https://www.postpartum.net/get-help/psi-online-support-meetings/",desc:"Free virtual support meetings — no registration required."},
{name:"Utah Maternal Mental Health Referral Network",url:"https://maternalmentalhealth.dhhs.utah.gov",desc:"Find providers across Utah trained specifically in postpartum mental health."},
{name:"PSI Utah",url:"https://www.psiutah.org",desc:"Browse all Utah local resources — support groups, providers, and community programs."}
],
disclaimer:"All resources above come directly from PSI Utah and PSI National. No data is shared — this is a passive display of links only.",
followUpMsg:"Were you able to connect with any of the Postpartum Support International resources we shared? We're here for you."
};

function genPlan(iciq,pain,gupi,intake){
  const p={id:`TP-${Date.now()}`,at:new Date().toISOString(),status:"pending_review",risk:"green",dx:[],goals:[],ex:[],adjuncts:[],freq:"",dur:"",prec:[],prog:[],cpt:[]};
  if(iciq.subtype.includes("Stress"))p.dx.push({c:"N39.3",d:"Stress incontinence"});
  else if(iciq.subtype.includes("Urge"))p.dx.push({c:"N39.41",d:"Urge incontinence"});
  else if(iciq.subtype.includes("Mixed"))p.dx.push({c:"N39.46",d:"Mixed incontinence"});
  if(pain.composite>=1)p.dx.push({c:"N94.89",d:"Pelvic pain condition"});
  if(pain.triggers.includes("dyspareunia"))p.dx.push({c:"N94.10",d:"Dyspareunia"});
  // GUPI total is displayed for PT review but does not auto-assign a dx code
  // Constipation composite: straining ≥2 OR frequency <3x/week (bowel_frequency 0-1) OR Bristol type 1-2
  const constipationFlag=(intake.bowel_constipation??0)>=2||(intake.bowel_frequency??3)<=1||(intake.bristol_stool??4)<=2;
  if(constipationFlag)p.dx.push({c:"K59.00",d:"Constipation, unspecified"});
  // Pudendal neuralgia flag: sitting_long trigger + pain > 6/10
  const triggers=pain.triggers||[];
  const pudendalFlag=triggers.includes("sitting_long")&&pain.composite>6;
  if(pudendalFlag){p.risk="yellow";p.dx.push({c:"G57.91",d:"Pudendal neuralgia (suspected) — PT review required"})}
  // Avoidance scoring
  const avoid=intake.avoid_activities||[];
  const avoidCount=avoid.filter(x=>x!=="none").length;
  const avoidImpact=avoidCount>=3;
  if(pain.current>3||iciq.severity==="Very Severe"||avoidImpact)p.risk="yellow";
  // Goals
  p.goals=[`Reduce ICIQ from ${iciq.total} by ≥3 pts in 8 wks`,`Improve bladder control confidence`];
  if(pain.composite>0)p.goals.push(`Reduce pain from ${pain.average}/10 to ≤${Math.max(0,pain.average-3)}/10`);
  if(avoidImpact)p.goals.push(`Resume ${avoidCount} avoided activity categories`);
  if(intake.patient_goal)p.goals.push(`Patient goal: "${intake.patient_goal}"`);
  // 3-tier exercise system per Klovning severity bands
  const tier=iciq.total>=13?"beginner":iciq.total>=6?"moderate":"advanced";
  if(tier==="beginner"){
    p.ex=[{n:"Supine PF Activation",s:2,r:8,h:"3-5s",f:"daily",d:"Gravity-eliminated pelvic floor awareness."},{n:"Diaphragmatic Breathing + PF",s:2,r:5,h:"full cycle",f:"2x/day",d:"Coordinated breathing for PF connection."},{n:"Gentle Bridge",s:2,r:10,h:"5s",f:"daily",d:"Supported bridge with PF engagement — PF activates FIRST, then hips lift."},{n:"Quick-Flick Kegels",s:2,r:8,h:"1s on/1s off",f:"daily",d:"Fast-twitch activation. Squeeze 1 second, release 1 second."},{n:"Endurance Kegels",s:2,r:8,h:"5s",f:"daily",d:"Side-lying sustained hold at 50-70% effort."}];
    p.freq="Daily HEP + PT review q3 days";p.dur="12 wks (reassess wk 2,4,8)";
  } else if(tier==="moderate"){
    p.ex=[{n:"Quick-Flick Kegels",s:3,r:10,h:"1s on/1s off",f:"daily",d:"Rapid PF contractions — 1s squeeze, 1s release."},{n:"Endurance Kegels",s:3,r:10,h:"5-10s",f:"daily",d:"Sustained PF contractions at 50-70% effort."},{n:"Bridge + PF",s:2,r:10,h:"5-10s",f:"3x/wk",d:"Exhale + PF first, then hips rise."},{n:"Diaphragmatic Breathing + PF",s:1,r:5,h:"full cycle",f:"daily",d:"PF relax on inhale, engage on exhale."}];
    p.freq="Daily HEP + weekly check-in";p.dur="8 wks (reassess wk 4,8)";
  } else {
    p.ex=[{n:"Quick-Flick Kegels",s:3,r:12,h:"1s on/1s off",f:"daily",d:"Rapid PF contractions — high volume."},{n:"Endurance Kegels",s:3,r:12,h:"8-10s",f:"daily",d:"Sustained PF contractions — advanced."},{n:"Bridge + PF",s:3,r:12,h:"10s",f:"4x/wk",d:"Exhale + PF first, then hips rise. Build to marching bridge."},{n:"Diaphragmatic Breathing",s:1,r:5,h:"full cycle",f:"daily",d:"PF relax on inhale, engage on exhale."}];
    p.freq="Daily HEP + bi-weekly check-in";p.dur="6 wks (reassess wk 3,6)";
  }
  if(pain.composite>=4)p.ex.unshift({n:"Pain De-Sensitization Breathing",s:1,r:3,h:"2 min",f:"as needed",d:"Prolonged diaphragmatic breathing for pain modulation."});
  // Adjunct recommendations
  if(iciq.subtype.includes("Stress")&&iciq.total>=10)p.adjuncts.push({type:"device",n:"PF Biofeedback Device",d:"Surface EMG home biofeedback (e.g., Pericoach, Elvie) for real-time PF contraction feedback.",rx:"Consider if patient does not progress with HEP alone by week 4."});
  if(iciq.subtype.includes("Stress")&&iciq.total>=13)p.adjuncts.push({type:"device",n:"Pessary Evaluation",d:"Recommend internal vaginal device for light mechanical pelvic organ support.",rx:"If light leaking with activity or pressure symptoms persist at week 8. OTC options: Impressa, Revive, Uresta."});
  if(iciq.subtype.includes("Urge")||iciq.subtype.includes("Mixed"))p.adjuncts.push({type:"behavioral",n:"Bladder Training Program",d:"Timed voiding schedule with progressive interval increases. Start with current voiding interval, increase by 15 min every 1-2 weeks. Include urge suppression techniques.",rx:"Begin immediately alongside exercise program."});
  if(pain.composite>=5||pain.triggers.includes("dyspareunia"))p.adjuncts.push({type:"device",n:"Vaginal Dilator Therapy",d:"Graduated plastic or silicone dilator set for desensitization and tissue mobility.",rx:"Start smallest size, progress per tolerance."});
  if(constipationFlag)p.adjuncts.push({type:"behavioral",n:"Bowel Management Program",d:"Toileting posture (squatty potty), fiber/fluid optimization, defecation dynamics training.",rx:"Address constipation — straining worsens PF dysfunction."});
  // Medication modification trigger
  if((intake.med_modify??0)===1)p.adjuncts.push({type:"behavioral",n:"Medication Review Referral",d:"Patient reports modifying prescribed medication due to urinary symptoms. Refer back to prescribing provider for medication review before altering dosing. DIAPPERS framework — drugs are a reversible cause of UI.",rx:"Urgent: contact prescribing provider."});
  p.adjuncts.push({type:"behavioral",n:"Lifestyle Modifications",d:"Caffeine reduction, fluid management (1.5-2L/day), lifting mechanics education, weight management if applicable.",rx:"Standard behavioral component of PF PT."});
  if(tier==="beginner")p.adjuncts.push({type:"referral",n:"In-Person PT Evaluation",d:"If telehealth-only progress stalls, refer for in-person manual therapy assessment including internal PF exam.",rx:"Reassess at week 4. Refer if ICIQ improvement <3 pts."});
  if(pain.composite>=6)p.adjuncts.push({type:"device",n:"TENS Unit for Pain",d:"Transcutaneous electrical nerve stimulation for pelvic/perineal pain management.",rx:"Home TENS unit if pain persists above 4/10 at week 2."});
  // Bladder retraining prioritization when "bladder fills" trigger selected
  if(triggers.includes("bladder_fills")&&!p.adjuncts.some(a=>a.n==="Bladder Training Program"))p.adjuncts.push({type:"behavioral",n:"Bladder Training Program",d:"Timed voiding schedule with progressive interval increases. Start with current voiding interval, increase by 15 min every 1-2 weeks. Include urge suppression techniques.",rx:"Begin immediately alongside exercise program."});
  p.prec=["Stop if pain >3/10","Report bleeding/fever/UTI immediately","No lifting >15 lbs first 4 wks"];
  if(pudendalFlag)p.prec.push("Suspected pudendal neuralgia — avoid prolonged sitting exercises; evaluate nerve involvement before progressing");
  if(intake.pregnancy_status==="pp_early")p.prec.push("Postpartum <6wk: gentle PF only");
  if(intake.prenatal_flag){
    p.prenatal=true;
    const prenatalSubs={"Supine PF Activation":"Incline PF Activation","Gentle Bridge":"Incline Bridge + PF","Bridge + PF":"Incline Bridge + PF","Diaphragmatic Breathing + PF":"Diaphragmatic Breathing + PF (Prenatal)","Diaphragmatic Breathing":"Diaphragmatic Breathing + PF (Prenatal)"};
    p.ex=p.ex.map(ex=>{const sub=prenatalSubs[ex.n];if(sub)return{...ex,n:sub,prenatalModified:true,originalName:ex.n};return ex});
    p.prec.unshift("Your exercises have been adapted for pregnancy. Avoid lying flat on your back — use a wedge pillow or rolled towel under your right hip for any floor exercises. Stop any exercise that causes discomfort and contact your OB/GYN or midwife.");
    p.ptNote="Patient is currently pregnant. Exercise modifications for supine positioning have been automatically applied. Please review for trimester appropriateness.";
    L("PRENATAL_PROTOCOL_APPLIED",{context:"EXERCISE_MODIFICATIONS_GENERATED",substitutions:Object.keys(prenatalSubs).filter(k=>p.ex.some(e=>e.originalName===k))});
  }
  p.prog=["ICIQ ↓≥2 → increase hold +2s","Pain ≤2 × 2wk → add standing PF","Adherence ≥80% × 2wk → add functional progressions"];
  p.cpt=[{c:"97161",d:"PT Eval — Low Complexity",u:1}];
  // Review flags — always-review (Phase 2: mandatory PT review) + triggered (Phase 2: discretionary)
  const phq2=calcPHQ2(intake);
  p.review_flags=[];
  if(iciq.total>=13)p.review_flags.push({id:"HIGH_SEVERITY_ICIQ",type:"always",label:"High Severity ICIQ"});
  if(phq2>=3){p.review_flags.push({id:"DEPRESSION_RISK",type:"always",label:"Depression Risk"});p.risk="yellow"}
  if(intake.prenatal_flag){p.review_flags.push({id:"PRENATAL",type:"always",label:"Prenatal"});p.risk="yellow"}
  if(intake._safety_answer_changed){p.review_flags.push({id:"SAFETY_ANSWER_CHANGED",type:"always",label:"Safety Answer Changed"});p.risk="yellow"}
  if(pudendalFlag)p.review_flags.push({id:"PUDENDAL_SUSPECTED",type:"always",label:"Pudendal Suspected"});
  // PROLAPSE SCREENING — POPDI-6
  const popdi=sPOPDI(intake);
  if(popdi.positiveCount>0){
    p.dx.push({c:"N81.9",d:"Pelvic organ prolapse, unspecified (suspected — exam confirmation recommended)"});
    if(popdi.bulge||popdi.highBother){
      p.risk="yellow";
      p.review_flags.push({id:"PROLAPSE_REVIEW",type:"always",label:"Prolapse — Clinician Review"});
      p.prec.push("Suspected symptomatic prolapse — pelvic exam recommended for staging. Consider pessary evaluation.");
      if(popdi.bulge&&popdi.highBother){p.prec.push("Vaginal bulge/protrusion with significant bother — consider expedited urogynecology referral.")}
    } else {
      p.review_flags.push({id:"PROLAPSE_MILD",type:"always",label:"Prolapse — Mild Symptoms"});
    }
    if(!p.adjuncts.some(x=>x.n.includes("Pessary")))p.adjuncts.push({type:"device",n:"Pessary Evaluation",d:"Consider vaginal pessary for symptomatic prolapse support.",rx:"Discuss with PT at review. Refer to urogynecology if symptoms persist or worsen."});
  }
  L("plan_generated",{planId:p.id,risk:p.risk,iciq:iciq.total,tier,prenatal:!!intake.prenatal_flag,review_flags:p.review_flags.map(f=>f.id)});return p;
}

const DPTS=[
  {id:"P001",nm:"Sarah M.",age:32,ref:"OB/GYN",iciq:[{d:"01/15",s:14},{d:"01/29",s:11},{d:"02/12",s:8}],pain:[{d:"01/15",s:5},{d:"01/29",s:3.5},{d:"02/12",s:2}],adh:87,ps:"approved",nra:"02/26",msgs:[{fr:"pt",tx:"Great progress! ICIQ dropped 3 pts.",t:"2/12 10:30am"}],planApprovedDate:"2026-01-15",intake:{iciq:14,pain:6,phq2:2,fsex:3,constipation:true,avoid:["exercise","lifting","sexual"]},week8:{iciq:8,pain:3,phq2:1,fsex:1,bowel:"better",avoid_resumed:["exercise","lifting"],nps:9,date:"03/12",submitted:true},review_flags:[{id:"HIGH_SEVERITY_ICIQ",type:"always",label:"High Severity ICIQ"}]},
  {id:"P002",nm:"Maria L.",age:28,ref:"Self",iciq:[{d:"01/22",s:9},{d:"02/05",s:7}],pain:[{d:"01/22",s:2},{d:"02/05",s:1}],adh:93,ps:"approved",nra:"02/19",msgs:[],review_flags:[]},
  {id:"P003",nm:"Jennifer K.",age:35,ref:"Medicaid",iciq:[{d:"02/10",s:18}],pain:[{d:"02/10",s:6}],adh:0,ps:"pending_review",nra:"02/24",msgs:[],review_flags:[{id:"HIGH_SEVERITY_ICIQ",type:"always",label:"High Severity ICIQ"}]},
];
const DEMO_ADHERENCE_LOG=[{date:"2026-02-10",status:"yes"},{date:"2026-02-11",status:"yes"},{date:"2026-02-12",status:"yes"},{date:"2026-02-13",status:"partial",note:"hip pain after bridges"},{date:"2026-02-14",status:"yes"},{date:"2026-02-15",status:"yes"},{date:"2026-02-16",status:"no",note:"traveling"},{date:"2026-02-17",status:"yes"},{date:"2026-02-18",status:"yes"},{date:"2026-02-19",status:"yes"},{date:"2026-02-20",status:"partial",note:"only did breathing"},{date:"2026-02-21",status:"yes"},{date:"2026-02-22",status:"yes"},{date:"2026-02-23",status:"yes"},{date:"2026-02-24",status:"no",note:"sick"},{date:"2026-02-25",status:"yes"},{date:"2026-02-26",status:"yes"},{date:"2026-02-27",status:"partial",note:"shortened session"},{date:"2026-02-28",status:"yes"},{date:"2026-03-01",status:"yes"},{date:"2026-03-02",status:"yes"},{date:"2026-03-03",status:"partial",note:"knee discomfort"},{date:"2026-03-04",status:"yes"},{date:"2026-03-05",status:"yes"},{date:"2026-03-06",status:"yes"},{date:"2026-03-07",status:"yes"},{date:"2026-03-08",status:"yes"},{date:"2026-03-09",status:"yes"},{date:"2026-03-10",status:"yes"},{date:"2026-03-11",status:"yes"}];
const RTM_CODES={"98975":{name:"Initial Setup",desc:"Device/software setup + patient education",threshold:null},"98977":{name:"MSK Data Monitoring",desc:"≥16 days of data in calendar month",threshold:16},"98980":{name:"Treatment Management (20min)",desc:"Interactive communication ≥20min/month",threshold:20},"98981":{name:"Treatment Management (40min)",desc:"Interactive communication ≥40min/month",threshold:40}};
// STYLES
const css=`@font-face{font-family:'Inter';font-style:normal;font-weight:400 700;font-display:swap;src:url('/fonts/inter.woff2') format('woff2')}
@font-face{font-family:'DM Sans';font-style:normal;font-weight:400 700;font-display:swap;src:url('/fonts/dmsans.woff2') format('woff2')}
@font-face{font-family:'DM Serif Display';font-style:normal;font-weight:400;font-display:swap;src:url('/fonts/dmserifdisplay.woff2') format('woff2')}
*{margin:0;padding:0;box-sizing:border-box}body{background:#F8F7FC;color:#252238;font-family:'Helvetica Neue',Helvetica,'Inter',sans-serif;font-size:14px;-webkit-font-smoothing:antialiased}
.topnav{background:linear-gradient(135deg,#4C2C84 0%,#3A1F68 100%);padding:0 32px;display:flex;align-items:center;height:56px;gap:24px;position:sticky;top:0;z-index:100}
.topnav-logo{font-size:22px;font-weight:700;color:white;letter-spacing:3px}
.topnav-tabs{display:flex;gap:0;margin-left:24px}
.tt{padding:16px 20px;font-size:13px;font-weight:500;color:rgba(255,255,255,.55);cursor:pointer;border-bottom:3px solid transparent;transition:all .2s}
.tt:hover{color:rgba(255,255,255,.85)}.tt.a{color:white;border-bottom-color:#FC228A;font-weight:600}
.mn{max-width:860px;margin:0 auto;padding:28px 24px}
.mnw{max-width:1100px;margin:0 auto;padding:28px 24px}
.h1{font-size:26px;font-weight:700;color:#4C2C84;margin-bottom:4px;letter-spacing:-.3px}
.h2{font-size:18px;font-weight:600;color:#4C2C84;margin-bottom:8px}
.sub{font-size:13px;color:#6E6887;margin-bottom:20px}
.card{background:white;border:1px solid #E2E0EC;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(76,44,132,.04)}
.chd{font-size:15px;font-weight:600;color:#4C2C84;margin-bottom:12px}
.btn{padding:10px 20px;border-radius:8px;border:none;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:6px}
.bpk{background:#FC228A;color:white}.bpk:hover{background:#C91A6E}
.bpu{background:#4C2C84;color:white}.bpu:hover{background:#6B45A8}
.bbl{background:#008AFC;color:white}
.byl{background:#D7FC51;color:#3A1F68;font-weight:700}
.bo{background:white;border:1.5px solid #E2E0EC;color:#524D66}.bo:hover{border-color:#4C2C84;color:#4C2C84}
.brd{background:#EF4444;color:white}
.bsm{padding:6px 14px;font-size:12px}
.qc{background:white;border:1px solid #E2E0EC;border-radius:12px;padding:18px 22px;margin-bottom:12px}
.qt{font-size:14px;font-weight:500;color:#252238;margin-bottom:12px;line-height:1.5}
.ob{display:block;width:100%;text-align:left;padding:11px 16px;margin-bottom:5px;background:#FAFAFD;border:1.5px solid #E2E0EC;border-radius:8px;color:#3A3650;font-size:13px;cursor:pointer;transition:all .15s;font-family:inherit}
.ob:hover{border-color:#6B45A8;background:white}.ob.s{border-color:#FC228A;background:rgba(252,34,138,.05);color:#C91A6E;font-weight:600}
.mo{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;margin:0 6px 6px 0;background:#FAFAFD;border:1.5px solid #E2E0EC;border-radius:24px;font-size:12px;cursor:pointer;color:#524D66;transition:all .15s}
.mo:hover{border-color:#008AFC}.mo.s{border-color:#008AFC;color:#0066BE;background:rgba(0,138,252,.05);font-weight:600}
.inp{width:100%;padding:10px 14px;background:#FAFAFD;border:1.5px solid #E2E0EC;border-radius:8px;color:#252238;font-family:inherit;font-size:13px;outline:none}
.inp:focus{border-color:#4C2C84;background:white}
.il{font-size:12px;color:#6E6887;margin-bottom:5px;font-weight:500}
textarea.inp{min-height:80px;resize:vertical}
.slr{width:100%;appearance:none;height:6px;border-radius:3px;background:#E2E0EC;outline:none;margin:8px 0}
.slr::-webkit-slider-thumb{appearance:none;width:22px;height:22px;border-radius:50%;background:#FC228A;cursor:pointer;border:3px solid white;box-shadow:0 2px 8px rgba(252,34,138,.3)}
.scv{text-align:center;font-size:36px;font-weight:700;color:#FC228A;margin:6px 0}
.scl{display:flex;justify-content:space-between;font-size:11px;color:#9994AD}
.bdg{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
.ra{padding:14px 18px;border-radius:10px;border-left:4px solid;margin:12px 0;font-size:13px;line-height:1.5}
.dx{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:rgba(0,138,252,.05);border:1.5px solid rgba(0,138,252,.2);border-radius:8px;font-size:12px;color:#0066BE;margin:0 6px 6px 0}
.exc{background:#FAFAFD;border:1px solid #E2E0EC;border-radius:10px;padding:14px 18px;margin-bottom:8px}
.exn{font-weight:600;font-size:13px;color:#4C2C84;margin-bottom:3px}
.exr{font-size:11px;color:#008AFC;font-weight:500;margin-bottom:3px}
.exd{font-size:12px;color:#6E6887}
.ck{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #F0EFF5;cursor:pointer}.ck:last-child{border-bottom:none}
.cb{width:22px;height:22px;border-radius:6px;border:2px solid #C9C6D6;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;color:white;transition:all .15s}
.cb.on{background:#008AFC;border-color:#008AFC}
.aw{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(252,34,138,.05);border:1.5px solid rgba(252,34,138,.2);border-radius:6px;font-size:10px;color:#FC228A;font-weight:600}
.enote{background:#FAFAFD;border:1px solid #E2E0EC;border-radius:8px;padding:18px 22px;font-size:12px;color:#524D66;white-space:pre-wrap;line-height:1.6;font-family:'Courier New',monospace}
.enl{color:#4C2C84;font-weight:700}
.tmr{font-size:28px;font-weight:700;color:#008AFC;letter-spacing:1px}
.four{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.sc{background:white;border:1px solid #E2E0EC;border-radius:12px;padding:16px 18px}
.scl2{font-size:11px;color:#6E6887;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-weight:500}
.scv2{font-size:28px;font-weight:700;letter-spacing:-.5px}
.scs{font-size:11px;color:#9994AD;margin-top:2px}
.plr{display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;align-items:center;padding:12px 16px;border-bottom:1px solid #F0EFF5;font-size:12px;cursor:pointer;transition:background .1s}
.plr:hover{background:#FAFAFD}
.plh{font-size:10px;color:#9994AD;text-transform:uppercase;letter-spacing:1px;font-weight:600;cursor:default;background:#FAFAFD}
.pb{height:5px;border-radius:3px;background:#E2E0EC;overflow:hidden}.pf{height:100%;border-radius:3px}
.msg{max-width:80%;padding:10px 16px;border-radius:14px;font-size:13px;margin-bottom:8px;line-height:1.4}
.mpt{background:#4C2C84;color:white;margin-left:auto;border-bottom-right-radius:4px}
.mpa{background:#F0EFF5;color:#252238;border-bottom-left-radius:4px}
@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fi .3s ease-out}
@keyframes pu{0%,100%{opacity:1}50%{opacity:.5}}.pu{animation:pu 1.5s infinite}
`;
// COMPONENTS
function Bdg({sev,sc}){const c={None:C.gn,Slight:C.gn,Mild:C.or,Moderate:C.or,Severe:C.pink,"Very Severe":C.rd}[sev]||C.g400;return<span className="bdg"style={{background:`${c}12`,color:c}}>{sc!==undefined&&<b>{sc}</b>} {sev}</span>}
function AW(){return<span className="aw">AI-Generated · Requires PT Review</span>}

function NPILookup({q,ans,set}){
  const[npiFirst,setNpiFirst]=useState("");const[npiLast,setNpiLast]=useState("");const[npiState,setNpiState]=useState("UT");
  const[npiResults,setNpiResults]=useState(null);const[npiLoading,setNpiLoading]=useState(false);const[npiErr,setNpiErr]=useState(null);
  const selected=ans.physician_npi_selected;
  const doSearch=async()=>{
    if(!npiFirst.trim()||!npiLast.trim()){setNpiErr("Enter first and last name.");return}
    setNpiLoading(true);setNpiErr(null);setNpiResults(null);
    try{
      const qs=`version=2.1&first_name=${encodeURIComponent(npiFirst)}&last_name=${encodeURIComponent(npiLast)}&state=${npiState}&enumeration_type=NPI-1&limit=10`;
      const apiUrl=location.protocol==="file:"?`https://npiregistry.cms.hhs.gov/api/?${qs}`:`/api/npi?${qs}`;
      let data;
      const res=await fetch(apiUrl);if(!res.ok)throw new Error("NPI lookup failed");data=await res.json();
      if(data.result_count>0){
        const providers=data.results.map(r=>{
          const basic=r.basic||{};const addr=(r.addresses||[]).find(a=>a.address_purpose==="LOCATION")||(r.addresses||[])[0]||{};
          const taxonomy=(r.taxonomies||[]).find(t=>t.primary)||{};
          return{npi:r.number,name:`${basic.first_name||""} ${basic.last_name||""}`.trim(),credential:basic.credential||"",specialty:taxonomy.desc||"",practice:basic.organization_name||addr.organization_name||"",city:addr.city||"",state:addr.state||"",fax:addr.fax_number||"",phone:addr.telephone_number||""};
        });
        setNpiResults(providers);
      }else{setNpiErr("No providers found. Try different spelling or state.")}
    }catch(e){setNpiErr("NPI lookup unavailable. Please enter provider info manually below.")}
    setNpiLoading(false);
  };
  const selectProvider=(p)=>{set("physician_name",p.name+(p.credential?`, ${p.credential}`:""));const demoFax=DEMO_NPI_FAXES[p.npi];const fax=demoFax||p.fax?.replace(/[^\d]/g,"")||"";if(fax){set("physician_fax",fax);set("physician_fax_verified",!!demoFax||!!fax);set("physician_fax_default","")}else{const def=getDefaultFax({practice:p.practice,specialty:p.specialty});if(def){set("physician_fax",def.fax);set("physician_fax_default",def.label);set("physician_fax_verified",false)}else{set("physician_fax","");set("physician_fax_default","");set("physician_fax_verified",false)}}set("physician_npi_id",p.npi);set("physician_npi_selected",p)};
  return<div className="qc fi"><div className="qt">{q.text}</div>
    <div style={{fontSize:12,color:C.g500,marginBottom:10}}>Search the CMS NPI Registry to find your physician. This ensures accurate provider information for your care team.</div>
    {!selected?<>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:120}}><div className="il">First Name</div><input className="inp"value={npiFirst}onChange={e=>setNpiFirst(e.target.value)}placeholder="Sarah"/></div>
        <div style={{flex:1,minWidth:120}}><div className="il">Last Name</div><input className="inp"value={npiLast}onChange={e=>setNpiLast(e.target.value)}placeholder="Smith"/></div>
        <div style={{width:80}}><div className="il">State</div><select className="inp"value={npiState}onChange={e=>setNpiState(e.target.value)}>{["UT","AZ","CA","CO","ID","NV","NM","WY","Other"].map(s=><option key={s}value={s}>{s}</option>)}</select></div>
      </div>
      <button className="btn bpu bsm"onClick={doSearch}disabled={npiLoading}style={{marginBottom:10}}>{npiLoading?"Searching NPI Registry...":"Search NPI Registry"}</button>
      {npiErr&&<div style={{color:C.or,fontSize:12,marginBottom:8}}>{npiErr}</div>}
      {npiResults&&<div style={{maxHeight:200,overflowY:"auto",border:`1px solid ${C.g200}`,borderRadius:8}}>
        {npiResults.map((p,i)=><div key={i}onClick={()=>selectProvider(p)}style={{padding:"10px 14px",borderBottom:`1px solid ${C.g100}`,cursor:"pointer",fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",background:i%2?"#FAFAFA":"white"}}
          onMouseOver={e=>e.currentTarget.style.background="#EDE9FE"}onMouseOut={e=>e.currentTarget.style.background=i%2?"#FAFAFA":"white"}>
          <div><div style={{fontWeight:600,color:C.g800}}>{p.name}{p.credential?`, ${p.credential}`:""}</div><div style={{color:C.g500,fontSize:11}}>{p.specialty} {p.city?`· ${p.city}, ${p.state}`:""}</div></div>
          <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:10,color:C.g400}}>NPI: {p.npi}</div>{p.fax&&<div style={{fontSize:10,color:C.blue}}>Fax: {p.fax}</div>}</div>
        </div>)}
      </div>}
      <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.g100}`}}>
        <div style={{fontSize:11,color:C.g400,marginBottom:6}}>Can't find your provider? Enter manually:</div>
        <div style={{display:"flex",gap:8}}><div style={{flex:1}}><div className="il">Doctor Name</div><input className="inp"value={ans.physician_name||""}onChange={e=>set("physician_name",e.target.value)}placeholder="Dr. Smith"/></div>
        <div style={{flex:1}}><div className="il">Fax Number</div><input className="inp"value={ans.physician_fax||""}onChange={e=>set("physician_fax",e.target.value)}placeholder="(801) 555-0100"/></div></div>
      </div>
    </>:<div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:10,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div><div style={{fontWeight:700,color:"#166534",fontSize:13}}>✓ {selected.name}{selected.credential?`, ${selected.credential}`:""}</div>
          <div style={{fontSize:11,color:"#4B5563",marginTop:2}}>{selected.specialty} · NPI: {selected.npi}</div>
          {selected.fax&&<div style={{fontSize:11,color:C.blue,marginTop:1}}>Fax: {selected.fax}</div>}
        </div>
        <button className="btn bo bsm"onClick={()=>{set("physician_npi_selected",null);set("physician_name","");set("physician_fax","");set("physician_npi_id","")}}>Change</button>
      </div>
    </div>}
  </div>;
}
function Q({q,ans,set,togM,rfs,setRfs,safetyTriggered,setSafetyTriggered,showSafetyModal,setShowSafetyModal}){
  if(q.conditional&&!q.conditional(ans))return null;
  if(q.type==="date"){
    const raw=ans[q.id+"_raw"]||"";
    const formatDate=(v)=>{
      let d=v.replace(/[^\d]/g,"");
      if(d.length>8)d=d.slice(0,8);
      let display="";
      if(d.length>0)display=d.slice(0,2);
      if(d.length>2)display+="/"+d.slice(2,4);
      if(d.length>4)display+="/"+d.slice(4,8);
      return display;
    };
    const validate=(v)=>{
      const parts=v.split("/");
      if(parts.length!==3||parts[2].length!==4)return null;
      const m=parseInt(parts[0]),d=parseInt(parts[1]),y=parseInt(parts[2]);
      if(m<1||m>12||d<1||y<1900||y>2099)return null;
      const maxDay=new Date(y,m,0).getDate();
      if(d>maxDay)return null;
      return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    };
    const err=(()=>{
      if(!raw||raw.length<10)return null;
      const parts=raw.split("/");
      if(parts.length!==3)return null;
      const m=parseInt(parts[0]),d=parseInt(parts[1]),y=parseInt(parts[2]);
      if(parts[2].length===4&&(m<1||m>12))return "Month must be 1–12";
      if(parts[2].length===4&&m>=1&&m<=12){const maxDay=new Date(y,m,0).getDate();if(d<1||d>maxDay)return `Day must be 1–${maxDay} for month ${m}`}
      if(parts[2].length===4&&(y<1900||y>2099))return "Year must be between 1900–2099";
      return null;
    })();
    return<div className="qc fi"><div className="qt">{q.text}</div>
      <input className="inp" value={raw} placeholder="MM/DD/YYYY" maxLength={10} style={{width:200,fontFamily:"'DM Sans',sans-serif",fontSize:14}}
        onChange={e=>{
          const display=formatDate(e.target.value);
          set(q.id+"_raw",display);
          const iso=validate(display);
          set(q.id,iso||"");
        }}/>
      {err&&<div style={{color:C.rd,fontSize:11,marginTop:4}}>{err}</div>}
    </div>;
  }
  if(q.type==="number")return<div className="qc fi"><div className="qt">{q.text}</div><input className="inp"type="number"min={q.min}max={q.max}value={ans[q.id]??""}onChange={e=>set(q.id,e.target.value===""?"":parseInt(e.target.value))}style={{width:120}}/></div>;
  if(q.type==="phone"){
    const raw=ans[q.id+"_raw"]||"";
    const formatPhone=(v)=>{
      const d=v.replace(/[^\d]/g,"").slice(0,10);
      if(d.length===0)return"";
      if(d.length<=3)return"("+d;
      if(d.length<=6)return"("+d.slice(0,3)+") "+d.slice(3);
      return"("+d.slice(0,3)+") "+d.slice(3,6)+"-"+d.slice(6);
    };
    const digits=(raw.match(/\d/g)||[]).length;
    const err=raw.length>0&&digits>0&&digits<10?"Enter a 10-digit phone number":null;
    return<div className="qc fi"><div className="qt">{q.text}</div>
      <input className="inp" value={raw} placeholder={q.ph||"(XXX) XXX-XXXX"} maxLength={14} style={{width:200,fontFamily:"monospace"}}
        onKeyDown={e=>{if(e.key==="Backspace"&&raw.length>0){e.preventDefault();const d=raw.replace(/[^\d]/g,"");const shorter=d.slice(0,-1);const display=formatPhone(shorter);set(q.id+"_raw",display);set(q.id,shorter.length===10?shorter:"")}}}
        onChange={e=>{
          const display=formatPhone(e.target.value);
          set(q.id+"_raw",display);
          const digs=(display.match(/\d/g)||[]).join("");
          set(q.id,digs.length===10?digs:"");
        }}/>
      {err&&<div style={{color:C.rd,fontSize:11,marginTop:4}}>{err}</div>}
    </div>;
  }
  if(q.type==="npi_lookup")return<NPILookup q={q} ans={ans} set={set}/>;
  if(q.type==="concierge_search")return<ConciergeSearch ans={ans} set={set}/>;
  if(q.type==="email"){const raw=ans[q.id+"_raw"]||ans[q.id]||"";const valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);const err=raw&&!valid?"Please enter a valid email address":null;return<div className="qc fi"><div className="qt">{q.text}</div><input className="inp"type="email"value={raw}onChange={e=>{set(q.id+"_raw",e.target.value);set(q.id,/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)?e.target.value:"")}}placeholder={q.ph||""}/>{err&&<div style={{color:C.rd,fontSize:11,marginTop:4}}>{err}</div>}</div>}
  if(q.type==="text")return<div className="qc fi"><div className="qt">{q.text}</div><input className="inp"spellCheck={true}value={ans[q.id]||""}onChange={e=>set(q.id,e.target.value)}placeholder={q.ph||""}/></div>;
  if(q.type==="textarea")return<div className="qc fi"><div className="qt">{q.text}</div><textarea className="inp"spellCheck={true}value={ans[q.id]||""}onChange={e=>set(q.id,e.target.value)}placeholder={q.ph||""}/></div>;
  if(q.type==="twotext")return<div className="qc fi"><div className="qt">{q.text}</div><div style={{display:"flex",gap:10}}><div style={{flex:1}}><div className="il">First name</div><input className="inp"value={ans[q.id+"_first"]||""}onChange={e=>set(q.id+"_first",e.target.value)}/></div><div style={{flex:1}}><div className="il">Last name</div><input className="inp"value={ans[q.id+"_last"]||""}onChange={e=>set(q.id+"_last",e.target.value)}/></div></div></div>;
  if(q.type==="yn_table")return<div className="qc fi"><div className="qt">{q.text}</div>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
      <thead><tr><th style={{textAlign:"left",padding:"8px 12px",borderBottom:`2px solid ${C.g200}`,color:C.g500,fontWeight:600,fontSize:12}}></th><th style={{width:60,textAlign:"center",padding:"8px 6px",borderBottom:`2px solid ${C.g200}`,color:C.g500,fontWeight:600,fontSize:12}}>No</th><th style={{width:60,textAlign:"center",padding:"8px 6px",borderBottom:`2px solid ${C.g200}`,color:C.g500,fontWeight:600,fontSize:12}}>Yes</th></tr></thead>
      <tbody>{q.rows.map((row,i)=><tr key={row.id}style={{background:i%2?"#FAFAFA":"white"}}>
        <td style={{padding:"10px 12px",borderBottom:`1px solid ${C.g100}`,color:C.g700,lineHeight:1.5}}>{row.label}</td>
        {["no","yes"].map(v=><td key={v}style={{textAlign:"center",padding:"10px 6px",borderBottom:`1px solid ${C.g100}`}}>
          <div onClick={()=>set(row.id,v)} style={{width:24,height:24,borderRadius:12,border:`2px solid ${ans[row.id]===v?(v==="yes"?C.pink:C.g400):C.g300}`,background:ans[row.id]===v?(v==="yes"?C.pink:C.g400):"white",margin:"0 auto",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
            {ans[row.id]===v&&<div style={{width:8,height:8,borderRadius:4,background:"white"}}/>}
          </div>
        </td>)}
      </tr>)}</tbody>
    </table></div>;
  if(q.type==="yn_bother_table"){const hs={textAlign:"left",padding:"8px 12px",borderBottom:`2px solid ${C.g200}`,color:C.g500,fontWeight:600,fontSize:12};const cs={padding:"10px 12px",borderBottom:`1px solid ${C.g100}`,color:C.g700};const rs={width:24,height:24,borderRadius:12,border:`2px solid ${C.g300}`,background:"white",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"all .15s"};return<div className="qc fi"><div className="qt">{q.text}</div>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
      <thead><tr><th style={{width:28,...hs}}>#</th><th style={hs}>Symptom</th><th style={{width:120,textAlign:"center",...hs}}>Response</th></tr></thead>
      <tbody>{q.rows.map((row,ri)=>{const isYes=ans[row.id]==="yes";return<React.Fragment key={row.id}>
        <tr style={{background:ri%2?"#FAFAFA":"white"}}>
          <td style={{...cs,textAlign:"center",fontWeight:600,color:C.g400}}>{ri+1}</td>
          <td style={{...cs,lineHeight:1.5}}>{row.label}</td>
          <td style={{...cs,textAlign:"center"}}>
            <div style={{display:"flex",gap:8,justifyContent:"center",alignItems:"center"}}>
              {["No","Yes"].map(v=><div key={v}style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}onClick={()=>set(row.id,v.toLowerCase())}>
                <div style={{...rs,borderColor:ans[row.id]===v.toLowerCase()?(v==="Yes"?C.pink:C.g400):C.g300,background:ans[row.id]===v.toLowerCase()?(v==="Yes"?C.pink:C.g400):"white"}}>
                  {ans[row.id]===v.toLowerCase()&&<div style={{width:8,height:8,borderRadius:4,background:"white"}}/>}
                </div>
                <span style={{fontSize:12,color:ans[row.id]===v.toLowerCase()?C.g700:C.g400}}>{v}</span>
              </div>)}
            </div>
          </td>
        </tr>
        {isYes&&<tr style={{background:ri%2?"#FAFAFA":"white"}}>
          <td/>
          <td colSpan={2}style={{padding:"4px 12px 10px",borderBottom:`1px solid ${C.g100}`}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span style={{fontSize:11,fontWeight:600,color:C.purp}}>Bother:</span>
              {q.botherOpts.map(([l,v])=><div key={v}onClick={()=>set(row.id+"_bother",v)}style={{padding:"4px 10px",borderRadius:16,cursor:"pointer",transition:"all .15s",fontSize:12,border:`1.5px solid ${ans[row.id+"_bother"]===v?C.pink:C.g200}`,background:ans[row.id+"_bother"]===v?"rgba(252,34,138,.06)":"white",color:ans[row.id+"_bother"]===v?C.pink:C.g600,fontWeight:ans[row.id+"_bother"]===v?600:400}}>{l}</div>)}
            </div>
          </td>
        </tr>}
      </React.Fragment>})}</tbody>
    </table></div>}
  if(q.type==="yn")return<div className="qc fi"><div className="qt">{q.text}</div><div style={{display:"flex",gap:8}}>{["No","Yes"].map(o=><button key={o}className={`ob ${ans[q.id]===o.toLowerCase()?"s":""}`}style={{flex:1,textAlign:"center"}}onClick={()=>{
    if(q.rf&&o==="No"&&safetyTriggered[q.id]){setShowSafetyModal(q.id);return}
    set(q.id,o.toLowerCase());
    if(q.rf&&o==="Yes"){setRfs(p=>[...p.filter(f=>f.id!==q.id),{id:q.id,act:q.act,msg:q.msg}]);setSafetyTriggered(p=>({...p,[q.id]:true}));L("SAFETY_TRIGGER",{question:q.id,text:q.text})}
    else if(q.rf)setRfs(p=>p.filter(f=>f.id!==q.id));
  }}>{o}</button>)}</div>
    {rfs?.find(f=>f.id===q.id)&&<div className="ra"style={{background:q.act==="er"?"#FEE2E2":"#FFF7ED",borderColor:q.act==="er"?C.rd:C.or,color:q.act==="er"?"#991B1B":"#92400E"}}>{q.act==="er"?"!!":"!"} {q.msg}</div>}
    {showSafetyModal===q.id&&<div style={{background:"#FEF3C7",border:"2px solid #D97706",borderRadius:12,padding:16,marginTop:10}}>
      <div style={{fontWeight:700,color:"#92400E",fontSize:14,marginBottom:6}}>⚠ Safety Confirmation Required</div>
      <div style={{fontSize:12,color:"#78350F",lineHeight:1.6,marginBottom:10}}>You previously indicated a medical safety concern for this question. Please confirm you are intentionally changing this answer.</div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn brd bsm"onClick={()=>{set(q.id,"no");setRfs(p=>p.filter(f=>f.id!==q.id));set("_safety_answer_changed",true);set("_safety_changes",[...(ans._safety_changes||[]),{id:q.id,text:q.text,ts:new Date().toISOString()}]);L("SAFETY_ANSWER_CHANGED",{question:q.id,text:q.text});setShowSafetyModal(null)}}>Yes, I'm changing my answer</button>
        <button className="btn bo bsm"onClick={()=>setShowSafetyModal(null)}>Cancel</button>
      </div>
    </div>}
  </div>;
  if(q.type==="scale")return<div className="qc fi"><div className="qt">{q.text}</div><div className="scv">{ans[q.id]??q.min}</div><input className="slr"type="range"min={q.min}max={q.max}value={ans[q.id]??q.min}onChange={e=>set(q.id,parseInt(e.target.value))}/><div className="scl"><span>{q.lo}</span><span>{q.hi}</span></div></div>;
  if(q.type==="multi")return<div className="qc fi"><div className="qt">{q.text}</div><div style={{display:"flex",flexWrap:"wrap"}}>{q.opts.map(([l,v])=><div key={v}className={`mo ${(ans[q.id]||[]).includes(v)?"s":""}`}onClick={()=>togM(q.id,v)}>{(ans[q.id]||[]).includes(v)?"✓":"○"} {l}</div>)}</div></div>;
  return<div className="qc fi"><div className="qt">{q.text}</div>{q.opts.map(([l,v])=><button key={v}className={`ob ${ans[q.id]===v?"s":""}`}onClick={()=>set(q.id,v)}>{l}</button>)}</div>;
}

// Consistency Checker — flags contradictions in real-time
function getInconsistencies(ans){
  const flags=[];
  // Says "never leaks" in ICIQ but selects leak triggers
  if(ans.iciq1===0&&Array.isArray(ans.iciq4)&&ans.iciq4.length>0&&!ans.iciq4.includes("never"))flags.push({field:"iciq4",msg:"You said you never leak, but selected circumstances when urine leaks. Please review."});
  // Reports leaking (iciq1>0) but says "never" on circumstances
  if(ans.iciq1>=1&&Array.isArray(ans.iciq4)&&ans.iciq4.includes("never"))flags.push({field:"iciq4",msg:"You reported leaking urine earlier, but selected 'Never — urine does not leak' here. Please review your answers."});
  // Says "none" for leak amount but reports high interference
  if(ans.iciq2===0&&ans.iciq3>=5)flags.push({field:"iciq3",msg:"You said no urine leaks, but rated high interference with daily life. Please confirm."});
  // Reports no pain anywhere but high pain score
  if(Array.isArray(ans.symptoms_location)&&ans.symptoms_location.includes("none")&&(ans.pain1>=3||(ans.gupi4??0)>=3))flags.push({field:"symptoms_location",msg:"You selected 'no pain locations' but reported moderate-to-high pain scores. Please review."});
  // Reports high pain but says no effect on activities
  if((ans.pain1>=5||(ans.gupi4??0)>=5)&&ans.pain3===0)flags.push({field:"pain3",msg:"You reported significant pain but said it has no effect on daily activities. Please confirm."});
  // Says never has urgency but reports urgency-type leaking
  if(ans.fl3a===0&&Array.isArray(ans.iciq4)&&ans.iciq4.includes("urgency"))flags.push({field:"fl3a",msg:"You said you never rush to the toilet, but reported leaking before reaching it. Please review."});
  // PHQ-2 positive — not a contradiction but a clinical flag
  if((ans.phq2_interest||0)+(ans.phq2_mood||0)>=3)flags.push({field:"phq2_mood",msg:"Your responses suggest you may be experiencing some depression symptoms. Your Physical Therapist will review this before approving your plan and has included this in the report to your doctor.",severity:"warn"});
  return flags;
}

function ConsistencyAlerts({ans,currentQIds}){
  const flags=getInconsistencies(ans);
  const relevant=flags.filter(f=>currentQIds.includes(f.field));
  if(relevant.length===0)return null;
  return<div>{relevant.map((f,i)=><div key={i}style={{background:f.severity==="info"?"#EFF6FF":"#FFF7ED",borderLeft:`4px solid ${f.severity==="info"?"#3B82F6":"#F59E0B"}`,borderRadius:10,padding:"10px 14px",margin:"8px 0",fontSize:12,color:f.severity==="info"?"#1E40AF":"#92400E",lineHeight:1.5,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{fontSize:16,flexShrink:0}}>{f.severity==="info"?"ℹ️":"⚠️"}</span><span>{f.msg}</span></div>)}</div>;
}


// Mock provider database for Concierge Search
// DEMO DATA — mock providers for sandbox pilot demonstration only
// Demo-only NPI-specific fax overrides (pre-populated for demo walkthrough)
const DEMO_NPI_FAXES={"1932669694":"8015855146"};
// Default fax routing — org name substring match, then specialty fallback
const DEFAULT_ORG_FAXES=[
  {match:"intermountain",fax:"8015072500",label:"Intermountain Health Central Fax"},
  {match:"university of utah",fax:"8015855146",label:"U of U Health Referral Fax"},
  {match:"steward",fax:"8012682500",label:"Steward Health Referral Fax"},
];
const DEFAULT_SPECIALTY_FAXES={"OB/GYN":"8015072500","Urogynecology":"8015855146","Urology":"8015855146","Family Medicine":"8015072500"};
function getDefaultFax(provider){
  if(!provider)return null;
  const practice=(provider.practice||"").toLowerCase();
  for(const rule of DEFAULT_ORG_FAXES){if(practice.includes(rule.match))return{fax:rule.fax,label:rule.label}}
  if(provider.specialty&&DEFAULT_SPECIALTY_FAXES[provider.specialty])return{fax:DEFAULT_SPECIALTY_FAXES[provider.specialty],label:provider.specialty+" default fax"};
  return null;
}
const MOCK_PROVIDERS=[
  {id:"P100",first:"Kristen",last:"Miller",specialty:"OB/GYN",practice:"Women's Health Associates",city:"Salt Lake City",state:"UT",npi:"1234567890",fax:"8015550100",demo:true},
  {id:"P101",first:"Sarah",last:"Johnson",specialty:"Urogynecology",practice:"Utah Pelvic Health Center",city:"Provo",state:"UT",npi:"1234567891",fax:"8015550101",demo:true},
  {id:"P102",first:"Michael",last:"Chen",specialty:"OB/GYN",practice:"Mountain View OB/GYN",city:"Ogden",state:"UT",npi:"1234567892",fax:"8015550102",demo:true},
  {id:"P103",first:"Jessica",last:"Williams",specialty:"Midwife, CNM",practice:"Wasatch Midwifery",city:"Salt Lake City",state:"UT",npi:"1234567893",fax:"8015550103",demo:true},
  {id:"P104",first:"David",last:"Thompson",specialty:"Family Medicine",practice:"Community Health Partners",city:"St. George",state:"UT",npi:"1234567894",fax:"8015550104",demo:true},
  {id:"P105",first:"Emily",last:"Davis",specialty:"OB/GYN",practice:"Intermountain Women's Care",city:"Murray",state:"UT",npi:"1234567895",fax:"8015550105",demo:true},
  {id:"P106",first:"Robert",last:"Garcia",specialty:"Urology",practice:"Utah Urology Associates",city:"Salt Lake City",state:"UT",npi:"1234567896",fax:"8015550106",demo:true},
];
function typoMatch(input,target){
  if(!input)return true;
  const a=input.toLowerCase(),b=target.toLowerCase();
  if(b.includes(a)||a.includes(b))return true;
  // Levenshtein distance — require min 3 chars to avoid false positives
  if(a.length<3)return false;
  if(Math.abs(a.length-b.length)>2)return false;
  const m=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){const cost=a[i-1]===b[j-1]?0:1;m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+cost)}
  return m[a.length][b.length]<=2;
}

function ConciergeSearch({ans,set}){
  const[searchFirst,setSearchFirst]=useState("");
  const[searchLast,setSearchLast]=useState("");
  const[searchCity,setSearchCity]=useState("");
  const[searchPractice,setSearchPractice]=useState("");
  const[results,setResults]=useState(null);
  const[npiResults,setNpiResults]=useState(null);
  const[npiLoading,setNpiLoading]=useState(false);const[npiErr,setNpiErr]=useState(null);
  const[showConcierge,setShowConcierge]=useState(false);
  const[conciergeName,setConciergeName]=useState("");
  const[conciergeCity,setConciergeCity]=useState("");
  const[conciergeSubmitted,setConciergeSubmitted]=useState(!!ans.concierge_pending);
  const selected=ans.concierge_provider;

  const doSearch=async()=>{
    if(!searchLast.trim())return;
    // Local mock search
    const found=MOCK_PROVIDERS.filter(p=>typoMatch(searchLast,p.last)&&(!searchCity.trim()||typoMatch(searchCity,p.city))&&(!searchFirst.trim()||typoMatch(searchFirst,p.first))&&(!searchPractice.trim()||typoMatch(searchPractice,p.practice)));
    setResults(found);
    // CMS NPI Registry search with CORS proxy fallback
    setNpiLoading(true);setNpiErr(null);setNpiResults(null);
    let npiCount=0;
    try{
      const params=new URLSearchParams({version:"2.1",last_name:searchLast.trim(),enumeration_type:"NPI-1",limit:"10"});
      if(searchFirst.trim())params.set("first_name",searchFirst.trim());
      if(searchCity.trim())params.set("city",searchCity.trim());
      params.set("state","UT");
      const mapNpi=(r)=>{const b=r.basic||{};const addr=(r.addresses||[]).find(a=>a.address_purpose==="LOCATION")||(r.addresses||[])[0]||{};const tax=(r.taxonomies||[]).find(t=>t.primary)||{};return{id:`NPI-${r.number}`,first:b.first_name||"",last:b.last_name||"",specialty:tax.desc||"",practice:b.organization_name||addr.organization_name||"",city:addr.city||"",state:addr.state||"",npi:r.number,fax:(addr.fax_number||"").replace(/[^\d]/g,""),credential:b.credential||""}};
      const baseUrl=location.protocol==="file:"?"https://npiregistry.cms.hhs.gov/api/?":"api/npi?";
      let res=await fetch(baseUrl+params);if(!res.ok)throw new Error("NPI lookup failed");let data=await res.json();
      // If city was specified but no results, retry without city
      if(data.result_count===0&&searchCity.trim()){params.delete("city");res=await fetch(baseUrl+params);if(res.ok)data=await res.json()}
      if(data.result_count>0){const mapped=data.results.map(mapNpi);setNpiResults(mapped);npiCount=mapped.length}else{setNpiErr("No providers found in NPI Registry. Try different spelling or use the concierge option below.")}
    }catch(e){setNpiErr("NPI Registry lookup unavailable. You can search our demo providers or use the concierge option below.")}
    setNpiLoading(false);
    L("CONCIERGE_SEARCH",{first:searchFirst,last:searchLast,city:searchCity,practice:searchPractice,mockCount:found.length,npiCount});
  };
  const fmtName=(p)=>{const md=["OB/GYN","Urogynecology","Urology","Family Medicine"].includes(p.specialty);return md?`Dr. ${p.first} ${p.last}`:`${p.first} ${p.last}`};
  const selectProvider=(p)=>{set("concierge_provider",p);set("physician_name",fmtName(p));set("physician_npi_id",p.npi);
    const demoFax=DEMO_NPI_FAXES[p.npi];
    if(demoFax){set("physician_fax",demoFax);set("physician_fax_verified",false);set("physician_fax_default","Demo pre-populated")}
    else if(!p.demo&&p.fax){set("physician_fax",p.fax);set("physician_fax_verified",true);set("physician_fax_default",false)}
    else{const def=getDefaultFax(p);if(def){set("physician_fax",def.fax);set("physician_fax_default",def.label)}else{set("physician_fax",p.fax||"")}set("physician_fax_verified",false)}
    L("CONCIERGE_PROVIDER_SELECTED",{provider:`${p.first} ${p.last}`,npi:p.npi})};
  const submitConcierge=()=>{
    if(!conciergeName.trim()||!conciergeCity.trim())return;
    setConciergeSubmitted(true);
    set("concierge_pending",{practice:conciergeName,city:conciergeCity,ts:new Date().toISOString()});
    set("physician_name",conciergeName+" (Pending Verification)");
    set("physician_fax","");set("physician_npi_id","");set("physician_fax_verified",false);set("concierge_provider",null);
    L("CONCIERGE_VERIFICATION_REQUEST",{practice:conciergeName,city:conciergeCity});
  };

  if(selected)return<div className="qc fi">
    <div className="qt">Your Referring Provider</div>
    <div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:10,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontWeight:700,color:"#166534",fontSize:14}}>{fmtName(selected)}{selected.credential?`, ${selected.credential}`:""}</span>
            {selected.demo?<span style={{background:"#F59E0B",color:"white",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700}}>DEMO DATA</span>
              :<span style={{background:C.gn,color:"white",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700}}>✓ VERIFIED</span>}
          </div>
          <div style={{fontSize:12,color:"#4B5563",marginTop:3}}>{selected.specialty}{selected.practice?` · ${selected.practice}`:""}</div>
          <div style={{fontSize:11,color:"#6B7280",marginTop:1}}>{selected.city?`${selected.city}, ${selected.state} · `:""}NPI: {selected.npi}</div>
        </div>
        <button className="btn bo bsm"onClick={()=>{set("concierge_provider",null);set("physician_name","");set("physician_npi_id","");set("physician_fax","");set("physician_fax_verified",false);setResults(null);setNpiResults(null)}}>Change</button>
      </div>
    </div>
    <div style={{fontSize:12,color:C.g500,marginTop:10,lineHeight:1.5}}>Note: We will coordinate your care by sharing your assessment results and treatment plan with the provider you select above.</div>
  </div>;

  if(conciergeSubmitted||ans.concierge_pending){const pending=ans.concierge_pending||{practice:conciergeName,city:conciergeCity};return<div className="qc fi">
    <div className="qt">Provider Verification Requested</div>
    <div style={{background:"#EFF6FF",border:"1px solid #93C5FD",borderRadius:10,padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontWeight:700,color:"#1E40AF",fontSize:14,marginBottom:4}}>✓ Request Received</div>
          <div style={{fontSize:13,color:"#1E3A5F",lineHeight:1.6}}>Your plan is ready. We will verify <strong>{pending.practice}</strong> in <strong>{pending.city}</strong> in the background and transmit their copy once confirmed.</div>
          {pending.ts&&<div style={{fontSize:11,color:"#6B7280",marginTop:8}}>Submitted {new Date(pending.ts).toLocaleString()}</div>}
        </div>
        <button className="btn bo bsm"onClick={()=>{setConciergeSubmitted(false);set("concierge_pending",null);set("physician_name","");set("physician_fax","");set("physician_npi_id","");set("physician_fax_verified",false);setConciergeName("");setConciergeCity("");setShowConcierge(false);setResults(null);setNpiResults(null)}}>Start Over</button>
      </div>
    </div>
  </div>;}

  return<div className="qc fi">
    <div className="qt">Find Your Provider</div>
    <div style={{fontSize:12,color:C.g500,marginBottom:10}}>Search the CMS NPI Registry and our provider network to connect your Utah-based clinician to your care plan.</div>
    <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:100}}><div className="il">First Name (Optional)</div><input className="inp"value={searchFirst}onChange={e=>setSearchFirst(e.target.value)}placeholder="e.g. Kristen"/></div>
      <div style={{flex:1,minWidth:120}}><div className="il">Last Name *</div><input className="inp"value={searchLast}onChange={e=>setSearchLast(e.target.value)}placeholder="e.g. Miller"/></div>
      <div style={{flex:1,minWidth:120}}><div className="il">City (Optional)</div><input className="inp"value={searchCity}onChange={e=>setSearchCity(e.target.value)}placeholder="e.g. Salt Lake City"/></div>
    </div>
    <div style={{marginBottom:8}}>
      <div className="il">Clinic / Practice Name (Optional — filters demo data)</div>
      <input className="inp"value={searchPractice}onChange={e=>setSearchPractice(e.target.value)}placeholder="e.g. Women's Health Associates"/>
    </div>
    <button className="btn bpu bsm"onClick={doSearch}disabled={!searchLast.trim()||npiLoading}style={{marginBottom:10,opacity:!searchLast.trim()?0.4:1}}>{npiLoading?"Searching...":"Search Providers"}</button>

    {npiResults!==null&&npiResults.length>0&&<div style={{marginBottom:10}}>
      <div style={{fontSize:11,fontWeight:600,color:C.gn,marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>✓ Verified Providers</div>
      <div style={{border:`1px solid ${C.g200}`,borderRadius:8,overflow:"hidden",maxHeight:240,overflowY:"auto"}}>
        {npiResults.map(p=><div key={p.id}onClick={()=>selectProvider(p)}style={{padding:"12px 16px",borderBottom:`1px solid ${C.g100}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",background:"white",transition:"background .15s"}}
          onMouseOver={e=>e.currentTarget.style.background="#F0FDF4"}onMouseOut={e=>e.currentTarget.style.background="white"}>
          <div>
            <div style={{fontWeight:600,fontSize:13,color:C.g800}}>{fmtName(p)}{p.credential?`, ${p.credential}`:""}</div>
            <div style={{fontSize:11,color:C.g500}}>{p.specialty}{p.practice?` · ${p.practice}`:""}{p.city?` · ${p.city}, ${p.state}`:""}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:10,color:C.g400}}>NPI: {p.npi}</div>
          </div>
        </div>)}
      </div>
    </div>}

    {results!==null&&results.length>0&&<div style={{marginBottom:10}}>
      <div style={{fontSize:11,fontWeight:600,color:C.or,marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Demo Providers</div>
      <div style={{border:`1px solid ${C.g200}`,borderRadius:8,overflow:"hidden"}}>
        {results.map(p=><div key={p.id}onClick={()=>selectProvider(p)}style={{padding:"12px 16px",borderBottom:`1px solid ${C.g100}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",background:"white",transition:"background .15s"}}
          onMouseOver={e=>e.currentTarget.style.background="#F0FDF4"}onMouseOut={e=>e.currentTarget.style.background="white"}>
          <div>
            <div style={{fontWeight:600,fontSize:13,color:C.g800}}>{fmtName(p)}</div>
            <div style={{fontSize:11,color:C.g500}}>{p.specialty} · {p.practice} · {p.city}, {p.state}</div>
          </div>
          <span style={{background:"#F59E0B",color:"white",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,flexShrink:0}}>DEMO DATA</span>
        </div>)}
      </div>
    </div>}

    {npiErr&&!npiLoading&&<div style={{color:C.or,fontSize:12,marginBottom:8}}>{npiErr}</div>}
    {results!==null&&results.length===0&&!npiResults?.length&&npiErr&&!npiLoading&&<div style={{fontSize:12,color:C.g500,marginBottom:8}}>No providers found matching your search.</div>}

    <div style={{marginTop:8,paddingTop:10,borderTop:`1px solid ${C.g100}`}}>
      <button className="btn bo bsm"onClick={()=>setShowConcierge(true)}style={{fontSize:12}}>I can't find my doctor</button>
    </div>

    {showConcierge&&<div style={{background:"#FEFBF3",border:"1px solid #FCD34D",borderRadius:10,padding:16,marginTop:8}}>
      <div style={{fontWeight:700,color:"#92400E",fontSize:14,marginBottom:8}}>Request Provider Verification</div>
      <div style={{fontSize:12,color:"#78350F",lineHeight:1.5,marginBottom:12}}>Tell us about your provider and our clinical team will verify their contact details.</div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <div style={{flex:1}}><div className="il">Practice / Doctor Name *</div><input className="inp"value={conciergeName}onChange={e=>setConciergeName(e.target.value)}placeholder="e.g. Mountain View Women's Health"/></div>
        <div style={{flex:1}}><div className="il">City *</div><input className="inp"value={conciergeCity}onChange={e=>setConciergeCity(e.target.value)}placeholder="e.g. Provo"/></div>
      </div>
      <button className="btn bpk bsm"onClick={submitConcierge}disabled={!conciergeName.trim()||!conciergeCity.trim()}style={{opacity:(!conciergeName.trim()||!conciergeCity.trim())?0.4:1}}>Request Verification</button>
    </div>}
  </div>;
}

// Shared state for intake data flowing to PT view
let sharedIntake = null;
let _flagVer=0;const flagListeners=new Set();
function notifyFlagChange(){_flagVer++;flagListeners.forEach(fn=>fn(_flagVer))}
function useFlagSync(){const[,setV]=useState(0);useEffect(()=>{flagListeners.add(setV);return()=>flagListeners.delete(setV)},[]);}

// SESSION TIMEOUT (15 min idle → 60s warning → auto-logout)
function useSessionTimeout(onTimeout){
  const lastAct=useRef(Date.now());const[warn,setWarn]=useState(false);const[cd,setCd]=useState(60);const[rem,setRem]=useState(null);
  useEffect(()=>{
    const reset=()=>{lastAct.current=Date.now();if(warn){setWarn(false);setCd(60)}};
    const evts=["click","keypress","touchstart","scroll"];
    evts.forEach(e=>window.addEventListener(e,reset,{passive:true}));
    const iv=setInterval(()=>{
      if(!authSession){setRem(null);return}
      const elapsed=Date.now()-lastAct.current;const left=15*60*1000-elapsed;
      if(left<=0&&!warn){setWarn(true);setCd(60);setRem(null)}
      else if(left<=2*60*1000&&left>0)setRem(Math.ceil(left/1000));
      else setRem(null);
      if(warn){const wElapsed=elapsed-15*60*1000;const sLeft=60-Math.floor(wElapsed/1000);
        if(sLeft<=0){L("session_timeout",{userId:authSession?.userId,email:authSession?.email});try{const tok=localStorage.getItem("expect_session");if(tok)db("deleteSession",{sessionToken:tok});localStorage.removeItem("expect_session")}catch(e){}authSession=null;sharedIntake=null;setWarn(false);onTimeout()}
        else setCd(sLeft)}
    },1000);
    return()=>{evts.forEach(e=>window.removeEventListener(e,reset));clearInterval(iv)};
  },[warn]);
  return{warn,cd,rem,dismiss:()=>{lastAct.current=Date.now();setWarn(false);setCd(60)}};
}
function SessionWarningModal({cd,onDismiss}){
  return<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div className="card fi"style={{maxWidth:420,textAlign:"center",padding:32}}>
      <div style={{fontSize:28,color:C.or,marginBottom:12,fontWeight:700}}>Session Expiring</div>
      <p style={{fontSize:14,color:C.g600,lineHeight:1.6,marginBottom:16}}>Your session will expire in <b style={{color:C.rd,fontSize:22}}>{cd}</b> seconds due to inactivity.</p>
      <p style={{fontSize:12,color:C.g400,marginBottom:20}}>Click below or interact with the page to stay logged in.</p>
      <button className="btn bbl"onClick={onDismiss}style={{width:"100%",justifyContent:"center"}}>I'm Still Here</button>
    </div>
  </div>;
}

// LANDING PAGE (Step 1 — Welcome)
function LandingPage({onDone}){
  const sub=PILOT_PHASE===1
    ?"Get a personalized pelvic floor care plan created by AI and reviewed by a licensed Utah Physical Therapist."
    :`Get a personalized pelvic floor care plan created by AI and clinically supervised by licensed Utah Physical Therapists — validated through ${PILOT_CASES_VALIDATED}+ supervised cases.`;
  const disc=PILOT_PHASE===1
    ?"This service utilizes AI to assist licensed professionals in care planning. All treatment decisions are finalized by a human clinician."
    :"This service utilizes AI validated through extensive clinical supervision to generate care plans. Complex cases receive direct PT review; all plans are audited for safety.";
  return<div className="fi"style={{maxWidth:600,margin:"0 auto"}}>
    <div style={{textAlign:"center",marginBottom:24}}>
      <div className="h1"style={{fontSize:28}}>AI-Augmented Pelvic Floor Physical Therapy</div>
      <div className="sub"style={{fontSize:15,maxWidth:480,margin:"8px auto 0",lineHeight:1.7}}>{sub}</div>
    </div>
    <div className="card"style={{borderColor:C.purp}}>
      <div style={{background:"rgba(76,44,132,.04)",border:`1px solid ${C.g200}`,borderRadius:8,padding:"12px 16px",marginBottom:16,fontSize:12,color:C.g600,lineHeight:1.6}}>
        {disc}
      </div>
      <div className="chd">Get Started</div>
      <p style={{fontSize:13,color:C.g500,marginBottom:14,lineHeight:1.6}}>Complete a quick intake assessment and get a personalized care plan. You'll be asked to review informed consent and verify your email before starting.</p>
      <button className="btn bpk"style={{width:"100%",justifyContent:"center"}}onClick={onDone}>Begin Assessment →</button>
    </div>
    <div style={{textAlign:"center",marginTop:16}}>
      <div style={{fontSize:11,color:C.g400}}>Utah OAIP Regulatory Sandbox Pilot · Expect Health Inc.</div>
    </div>
  </div>;
}

// CONSENT
// Spanish-language consent version needed for Phase 2 commitment
function Consent({onDone,onBack,ck,setCk}){
  const items=[
    // AI & Clinical Oversight
    {id:"ai",tx:PILOT_PHASE===1
      ?"I understand this platform uses AI to assist in my care. A licensed Physical Therapist oversees all AI-generated treatment plans. The level of clinical review may vary based on clinical complexity and program phase."
      :`I understand this platform uses AI — validated through ${PILOT_CASES_VALIDATED}+ supervised cases — to generate my care plan. Complex cases receive direct PT review. All plans are subject to clinical audit.`},
    {id:"pt",tx:"I understand a licensed Utah PT maintains clinical oversight of AI recommendations. The AI supports — but never replaces — clinical judgment."},
    ...(PILOT_PHASE>=2?[{id:"auto",tx:"I understand that lower-complexity plans may be delivered without individual PT review, based on protocols validated during supervised care. Higher-complexity plans continue to receive direct PT review. All plans are subject to a 10% random clinical audit."}]:[]),
    {id:"rest",tx:"I understand that if I report a concern about AI-supported care, Expect Health will provide a no-cost clinical review and, if clinically appropriate, corrective pelvic floor PT follow-up (telehealth or in-person, as available), subject to program terms."},
    // Data & Communications
    {id:"coll",tx:"Data collected includes: intake responses, scores, adherence, chat interactions, and outcomes — all in HIPAA-compliant encrypted systems."},
    {id:"data",tx:"I consent to de-identified data sharing with: (1) Utah OAIP for oversight, (2) researchers under IRB protocols, (3) external auditors, (4) anonymized public dashboards."},
    {id:"coord",tx:"I authorize Expect Health to share my assessment results, treatment plan, and progress reports with the medical provider I identify for care coordination purposes."},
    {id:"enotify",tx:"I consent to receive electronic notifications about my care plan. I understand these notifications will link to a secure portal and will not contain sensitive health details directly."},
    // Program & Eligibility
    {id:"pilot",tx:"I understand this is a pilot under a Regulatory Mitigation Agreement with the Utah Office of AI Policy."},
    {id:"utah",tx:"I confirm that I am currently located in the state of Utah."},
    {id:"age",tx:"I confirm I am at least 18 years old and provide this consent voluntarily."},
  ];
  const ok=items.every(i=>ck[i.id]);
  return<div className="fi"><div className="h1">Informed Consent</div><div className="sub">AI-Augmented Pelvic Floor Physical Therapy · Utah OAIP Pilot</div>
    <div className="card"style={{borderColor:C.blue}}>
      <p style={{fontSize:13,color:C.g600,marginBottom:16,lineHeight:1.7}}>Please read each statement and check the box to confirm you understand.</p>
      {items.map(i=><div key={i.id}className="ck"onClick={()=>setCk(p=>({...p,[i.id]:!p[i.id]}))}><div className={`cb ${ck[i.id]?"on":""}`}>{ck[i.id]?"✓":""}</div><div style={{fontSize:13,color:ck[i.id]?C.g800:C.g500,lineHeight:1.6}}>{i.tx}</div></div>)}
    </div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>{onBack&&<button className="btn"onClick={onBack}style={{fontSize:12,color:C.g500}}>← Back</button>}<span style={{fontSize:10,color:C.g400}}>Consent v1.2 · Mar 2026</span></div>
      <button className="btn bpk"disabled={!ok}onClick={()=>{L("consent_signed",{version:"1.2",items:Object.keys(ck).filter(k=>ck[k])});onDone()}}style={{opacity:ok?1:.4}}>I Agree — Continue →</button>
    </div></div>;
}

// EMAIL VERIFICATION — confirms patient controls the email they provided
// Photo ID verification (Persona) available if OAIP requires additional identity assurance
function IdentityVerify({onDone,onBack}){
  const[st,setSt]=useState("input");
  const[addr,setAddr]=useState("");
  const[code,setCode]=useState("");
  const[sentCode,setSentCode]=useState(null);
  const[err,setErr]=useState(null);
  const genCode=()=>{const arr=new Uint32Array(1);crypto.getRandomValues(arr);return String(100000+(arr[0]%900000))};
  const sendCode=()=>{
    const em=addr.trim().toLowerCase();
    if(!em||!em.includes("@")){setErr("Please enter a valid email address.");return}
    const c=genCode();setSentCode(c);setSt("sent");setErr(null);
    // In production, this sends via a server-side email API (Resend/SendGrid).
    // For the pilot, the code is displayed to the user for demo purposes.
    L("email_verification_sent",{email:em});
  };
  const checkCode=()=>{
    if(code===sentCode){setSt("verified");L("identity_verified",{mode:"email",email:addr.trim().toLowerCase()});setTimeout(()=>onDone(addr.trim().toLowerCase()),1200)}
    else{setErr("Incorrect code. Please try again.")}
  };
  return<div className="fi"style={{maxWidth:520,margin:"0 auto"}}>
    <div className="h1">Verify Your Email</div>
    <div className="sub">We need to confirm your email address before starting the intake</div>
    <div className="card"style={{borderColor:C.blue,padding:32}}>
      {st==="input"&&<div>
        <p style={{fontSize:13,color:C.g600,marginBottom:16,lineHeight:1.7}}>Your email address is used for account creation, care plan delivery, and secure communication with your physical therapist. Your identity will be clinically verified by your PT during care plan review.</p>
        <input type="email"value={addr}onChange={e=>setAddr(e.target.value)}placeholder="you@email.com"style={{width:"100%",padding:"10px 14px",fontSize:14,border:`1px solid ${C.g300}`,borderRadius:8,marginBottom:12,boxSizing:"border-box"}}/>
        {err&&<div style={{fontSize:12,color:C.rd,marginBottom:8}}>{err}</div>}
        <button className="btn bbl"onClick={sendCode}style={{width:"100%"}}>Send Verification Code</button>
      </div>}
      {st==="sent"&&<div style={{textAlign:"center"}}>
        <div style={{fontSize:14,color:C.g600,marginBottom:16}}>We sent a 6-digit code to <strong>{addr}</strong></div>
        <div style={{background:"#FEF3C7",border:"1px solid #D97706",borderRadius:8,padding:12,marginBottom:16,fontSize:12,color:"#78350F"}}>Demo mode: Your code is <strong>{sentCode}</strong><br/><span style={{fontSize:11,color:"#92400E"}}>In production, this code is sent via email only.</span></div>
        <input type="text"value={code}onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}placeholder="000000"maxLength={6}style={{width:160,padding:"10px 14px",fontSize:24,textAlign:"center",letterSpacing:8,border:`1px solid ${C.g300}`,borderRadius:8,marginBottom:12}}/>
        {err&&<div style={{fontSize:12,color:C.rd,marginBottom:8}}>{err}</div>}
        <div><button className="btn bbl"onClick={checkCode}disabled={code.length!==6}style={{opacity:code.length===6?1:.4}}>Verify</button></div>
        <div style={{marginTop:12}}><button className="btn"onClick={()=>{setSt("input");setCode("");setSentCode(null);setErr(null)}}style={{fontSize:12,color:C.g500}}>Change email or resend</button></div>
      </div>}
      {st==="verified"&&<div style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12,color:C.gn}}>Email Verified</div>
        <div style={{fontSize:14,color:C.gn,fontWeight:600}}>Proceeding to intake...</div>
      </div>}
    </div>
    {onBack&&(st==="input"||st==="sent")&&<div style={{textAlign:"center",marginTop:12}}><button className="btn"onClick={onBack}style={{fontSize:12,color:C.g500}}>← Back to Consent</button></div>}
  </div>;
}

// INTAKE
function Intake({onDone,mainRef,initialEmail}){
  const[step,setStep]=useState(0);const[ans,setAns]=useState(initialEmail?{email:initialEmail}:{});const[rfs,setRfs]=useState([]);
  const[safetyTriggered,setSafetyTriggered]=useState({});const[showSafetyModal,setShowSafetyModal]=useState(null);
  const[triedNext,setTriedNext]=useState(false);
  const[acctPw,setAcctPw]=useState("");const[acctPwC,setAcctPwC]=useState("");const[acctErr,setAcctErr]=useState(null);const doneRef=useRef(false);
  const set=(k,v)=>{setAns(p=>{const next={...p,[k]:v};if(k==="pregnancy_status"){next.prenatal_flag=v==="pregnant";if(v==="pregnant")L("PRENATAL_PROTOCOL_APPLIED",{context:"PATIENT_INDICATED_ACTIVE_PREGNANCY"});if(v!=="pregnant"){delete next.ex_highrisk_preg;setRfs(r=>r.filter(f=>f.id!=="ex_highrisk_preg"));setSafetyTriggered(s=>{const n={...s};delete n.ex_highrisk_preg;return n})}}if(k==="screen_pain"&&v==="no"){["gupi1a","gupi1b","gupi1c","gupi1d","gupi2a","gupi2b","gupi2c","gupi2d","gupi3","gupi4","pain1","pain3","symptoms_location","symptoms_trigger"].forEach(key=>delete next[key])}if(k==="screen_sexual"&&v==="no"){["fs2a","fs2b","fs3a","fs3b","fs4a","fs4b","fs5a","fs5b"].forEach(key=>delete next[key])}if(k.startsWith("popdi")&&!k.includes("_bother")&&v==="no"){delete next[k+"_bother"]}return next})};
  const togM=(k,v)=>setAns(p=>{
    const cur=p[k]||[];
    if(cur.includes(v)){const next=cur.filter(x=>x!==v);
      if(k==="symptoms_location"&&next.filter(x=>x!=="none").length===0)return{...p,[k]:next,symptoms_trigger:[]};
      return{...p,[k]:next};}
    // Mutual exclusivity: "never"/"none" vs everything else
    if(v==="never"||v==="none"){
      if(k==="symptoms_location")return{...p,[k]:[v],symptoms_trigger:[]};
      return{...p,[k]:[v]};}
    return{...p,[k]:[...cur.filter(x=>x!=="never"&&x!=="none"),v]};
  });
  const goStep=(s)=>{setStep(s);setTriedNext(false);if(mainRef?.current)mainRef.current.scrollTop=0};
  const demo=[
    {id:"name",text:"What is your name?",type:"twotext"},
    {id:"dob",text:"What is your date of birth?",type:"date"},
    {id:"pregnancy_status",text:"What is your current pregnancy status?",opts:[["Currently pregnant","pregnant"],["Postpartum (0–6 weeks)","pp_early"],["Postpartum (6 weeks – 6 months)","pp_mid"],["Postpartum (6+ months)","pp_late"],["Not recently pregnant","not_pregnant"]]},
    {id:"delivery_type",text:"What was your most recent type of delivery?",conditional:a=>a.pregnancy_status&&!["not_pregnant","pregnant"].includes(a.pregnancy_status),opts:[["Vaginal delivery","vaginal"],["Vaginal with forceps or vacuum","assisted"],["Planned C-section","csection_planned"],["Emergency C-section","csection_emergency"]]},
    {id:"delivery_date",text:"Approximately when did you deliver?",type:"date",conditional:a=>a.pregnancy_status&&!["not_pregnant","pregnant"].includes(a.pregnancy_status)},
    {id:"num_deliveries",text:"How many total deliveries have you had? (Enter 0 if none)",type:"number",min:0,max:20},
    {id:"email",text:"What is your email address?",type:"email",ph:"email@example.com"},
    {id:"phone",text:"What is your phone number?",type:"phone",ph:"(801) 555-0100"},
    {id:"referral_source",text:"How did you hear about us?",opts:[["My OB/GYN or midwife referred me","obgyn"],["I found you on my own","self"],["My insurance plan referred me","insurance_referral"],["Through the Expect Fitness app","expect_app"]]},
    {id:"physician_npi",text:"Find your physician",type:"concierge_search"},
    {id:"insurance_type",text:"What type of insurance do you have?",opts:[["Utah Medicaid","medicaid"],["Commercial insurance","commercial"],["Self-pay","self_pay"],["Uninsured","uninsured"]]},
    {id:"insurance_id",text:"What is your insurance member ID?",type:"text",ph:"Member ID",conditional:a=>a.insurance_type&&!["self_pay","uninsured"].includes(a.insurance_type)},
  ];
  const steps=[
    {t:"Let's Get to Know You",s:"Some basic information to get started.",qs:demo},
    {t:"Safety Check",s:"We need to make sure you're safe to proceed.",qs:REDFLAGS},
    {t:"Eligibility Screening",s:"A few questions to confirm this program is right for you.",qs:EXCLUSIONS},
    {t:"Symptom Screening",s:"A few quick questions to tailor your assessment.",qs:SCREENER},
    {t:"Bladder Leakage",s:"ICIQ-UI Short Form — thinking about the past 4 weeks.",qs:[...ICIQ]},
    {t:"Urinary Symptoms",s:"How your urinary function has been over the past 4 weeks.",qs:[...FLUTS,...GUPI_URINARY]},
    {t:"Bowel Health",s:"A few questions about your bowel habits.",qs:BOWEL},
    {t:"Prolapse Screening",s:"POPDI-6 — pelvic organ prolapse symptom screening.",qs:POPDI},
    {t:"Pain & Discomfort",s:"Genitourinary pain + current pain assessment. Over the past week.",qs:GUPI_PAIN,cond:a=>a.screen_pain==="yes"},
    {t:"Sexual Health",s:"ICIQ-FLUTSsex — over the past 4 weeks. All answers are confidential.",qs:FLUTSSEX,cond:a=>a.screen_sexual==="yes"},
    {t:"Quality of Life",s:"How your symptoms have affected your life over the past week.",qs:QOL_IMPACT},
    {t:"Your History & Goals",s:"A few more questions to help your PT create the best plan for you.",qs:CLINICAL_EXTRA},
    {t:"Create Your Account",s:"Set up your account to securely access your care plan.",qs:[],custom:"account"},
  ];
  const hasER=rfs.some(f=>f.act==="er");
  const hasAnyRF=rfs.length>0;
  const hasExclusion=EXCLUSIONS.some(e=>ans[e.id]==="yes");
  // DOB age calculation
  const dobAge=(()=>{if(!ans.dob)return null;const b=new Date(ans.dob);const t=new Date();let a=t.getFullYear()-b.getFullYear();const m=t.getMonth()-b.getMonth();if(m<0||(m===0&&t.getDate()<b.getDate()))a--;return a})();
  const isUnder18=dobAge!==null&&dobAge<18;
  const isOver115=dobAge!==null&&dobAge>115;
  // PHQ-2 depression risk (clinical threshold: score ≥ 3 out of 6; resource threshold: ≥ 2)
  const phq2Score=calcPHQ2(ans);
  const phq2ResourceRef=useRef(false);
  useEffect(()=>{if(phq2Score>=2&&!phq2ResourceRef.current&&ans.phq2_interest!==undefined&&ans.phq2_mood!==undefined){phq2ResourceRef.current=true;L("phq2_resource_card_shown",{score:phq2Score,patient:(ans.name_first||"")+" "+(ans.name_last||"")})}},[phq2Score]);
  const phq2Positive=phq2Score>=3;
  // Step visibility — skip gated steps when screener answer is "no"
  const isStepVisible=(i)=>!steps[i].cond||steps[i].cond(ans);
  const nextVisibleStep=(from)=>{for(let i=from+1;i<steps.length;i++)if(isStepVisible(i))return i;return steps.length;};
  const prevVisibleStep=(from)=>{for(let i=from-1;i>=0;i--)if(isStepVisible(i))return i;return 0;};
  const visibleSteps=steps.map((_,i)=>i).filter(i=>isStepVisible(i));
  const visibleIdx=visibleSteps.indexOf(step);
  // Block on demographics (step 0): under 18 OR required fields incomplete
  const page1Incomplete=step===0&&(!ans.name_first||!ans.name_last||!ans.dob||!ans.pregnancy_status||!ans.insurance_type||!ans.email);
  // Block on screener step: require all 4 screener answers
  const screenerIncomplete=step===3&&(!ans.screen_urinary||!ans.screen_bowel||!ans.screen_pain||!ans.screen_sexual);
  // Block on POPDI-6 step: require all 6 yes/no answers + bother for each "yes"
  const popdiIncomplete=steps[step]?.qs===POPDI&&(POPDI[0].rows.some(r=>ans[r.id]===undefined)||POPDI[0].rows.some(r=>ans[r.id]==="yes"&&ans[r.id+"_bother"]===undefined));
  // Block on safety (step 1) for ANY red flag, block on exclusions (step 2) for ANY exclusion
  const blocked=(step===0&&(isUnder18||page1Incomplete))||(step===1&&hasAnyRF)||(step===2&&hasExclusion)||screenerIncomplete||popdiIncomplete;
  useEffect(()=>{
    if(step!==steps.length||doneRef.current)return;doneRef.current=true;
    const iciq=sICIQ(ans),pain=sPain(ans),gupi=sGUPI(ans),fluts=sFLUTS(ans),fsex=sFSEX(ans),popdi=sPOPDI(ans),plan=genPlan(iciq,pain,gupi,ans);
    L("intake_done",{iciq:iciq.total,pain:pain.composite,gupi:gupi.total});
    const phq2Total=calcPHQ2(ans);
    const depressionFlag=phq2Total>=3?{positive:true,score:phq2Total,maxScore:6,interest:ans.phq2_interest||0,mood:ans.phq2_mood||0,threshold:3,recommendation:"PHQ-9 full screening recommended. Consider mental health resource referral.",oaip_report:{flagType:"DEPRESSION_RISK",severity:phq2Total>=5?"HIGH":"MODERATE",score:phq2Total,maxScore:6,timestamp:new Date().toISOString()}}:{positive:false,score:phq2Total};
    sharedIntake={ans,iciq,pain,gupi,fluts,fsex,popdi,plan,depressionFlag,prenatalFlag:!!ans.prenatal_flag,name:(ans.name_first||"")+" "+(ans.name_last||""),physicianName:ans.physician_name,physicianFax:ans.physician_fax,physicianNPI:ans.physician_npi_id,safetyAnswerChanged:ans._safety_answer_changed||false,safetyChanges:ans._safety_changes||[],userId:authSession?.userId,screeners:{urinary:ans.screen_urinary,bowel:ans.screen_bowel,pain:ans.screen_pain,sexual:ans.screen_sexual},pelvicHistory:ans.pelvic_history||[]};
    if(depressionFlag.positive)L("depression_screen_positive",{score:phq2Total,severity:phq2Total>=5?"HIGH":"MODERATE",patient:(ans.name_first||"")+" "+(ans.name_last||"")});
    if(authSession){db("upsertPatient",{userId:authSession.userId,email:authSession.email,name:sharedIntake.name,ans,iciq,pain,gupi,fluts,fsex,popdi,plan,depressionFlag,prenatalFlag:!!ans.prenatal_flag,physicianName:ans.physician_name||"",physicianFax:ans.physician_fax||"",physicianNPI:ans.physician_npi_id||"",safetyAnswerChanged:ans._safety_answer_changed||false,safetyChanges:ans._safety_changes||[],status:"pending_review",createdAt:new Date().toISOString()})}
    if(onDone)onDone();
  },[step]);
  if(step===steps.length)return null;
  return<div className="fi">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
      <div><div className="h1">{steps[step].t}</div><div className="sub"style={{maxWidth:600}}>{steps[step].s}</div></div>
      <div style={{background:C.purp,color:C.white,padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:600,flexShrink:0}}>{visibleIdx+1} / {visibleSteps.length}</div>
    </div>
    <div style={{display:"flex",gap:3,marginBottom:20}}>{visibleSteps.map((si,vi)=><div key={si}style={{flex:1,height:4,borderRadius:2,background:si<=step?`linear-gradient(90deg,${C.pink},${C.purp})`:C.g200,transition:"all .3s"}}/>)}</div>
    {triedNext&&page1Incomplete&&step===0&&!isUnder18&&<div className="ra"style={{background:"#F0EFF5",borderColor:C.g300,color:C.g600,fontSize:14,fontWeight:500,marginBottom:14}}>Please complete the required fields — name, email, date of birth, pregnancy status, and insurance type — to continue.</div>}
    {isUnder18&&step===0&&<div className="ra"style={{background:"#FEE2E2",borderColor:C.rd,color:"#991B1B",fontSize:14,fontWeight:600,marginBottom:14}}>⛔ This program is designed for adults 18 years and older. Based on the date of birth you entered, you are under 18. If you believe this is an error, please correct your date of birth above.</div>}
    {isOver115&&step===0&&<div className="ra"style={{background:"#FEF3C7",borderColor:C.or,color:"#92400E",fontSize:14,fontWeight:600,marginBottom:14}}>🤔 The date of birth you entered would make you over 115 years old. Could you double-check that your birth date is correct? Typos in the year are common.</div>}
    {hasER&&step===1&&<div className="ra"style={{background:"#FEE2E2",borderColor:C.rd,color:"#991B1B",fontSize:15,fontWeight:600,marginBottom:14}}>⛔ STOP — Please call 911 or go to the nearest emergency room immediately.</div>}
    {hasAnyRF&&!hasER&&step===1&&<div className="ra"style={{background:"#FEF3C7",borderColor:C.or,color:"#92400E",fontSize:14,fontWeight:600,marginBottom:14}}>⚠ Based on your responses, you need to see your physician before starting this program. Please contact your doctor for evaluation.</div>}
    {hasExclusion&&step===2&&<div className="ra"style={{background:"#FEF3C7",borderColor:C.or,color:"#92400E",fontSize:14,fontWeight:600,marginBottom:14}}>⚠ Based on your responses, this program may not be appropriate for your condition. Please consult your physician or a specialist PT for in-person evaluation.</div>}
    {triedNext&&screenerIncomplete&&step===3&&<div className="ra"style={{background:"#F0EFF5",borderColor:C.g300,color:C.g600,fontSize:14,fontWeight:500,marginBottom:14}}>Please answer all four screening questions to continue.</div>}
    {steps[step].custom==="account"?<div className="card"style={{borderColor:C.purp}}>
      <div className="chd">Your Login Credentials</div>
      <div style={{marginBottom:14}}><div className="il">Email</div><input className="inp"type="email"value={ans.email||""}readOnly style={{background:C.g50,color:C.g500}}/><div style={{fontSize:10,color:C.g400,marginTop:2}}>Email from your intake — cannot be changed here</div></div>
      <div style={{marginBottom:14}}><div className="il">Create Password</div><input className="inp"type="password"value={acctPw}onChange={e=>{setAcctPw(e.target.value);setAcctErr(null)}}placeholder="8+ characters, 1 uppercase, 1 number"/></div>
      <div style={{marginBottom:14}}><div className="il">Confirm Password</div><input className="inp"type="password"value={acctPwC}onChange={e=>{setAcctPwC(e.target.value);setAcctErr(null)}}placeholder="Re-enter password"/></div>
      {acctErr&&<div style={{color:C.rd,fontSize:12,marginBottom:8,padding:"6px 10px",background:`${C.rd}10`,borderRadius:6}}>{acctErr}</div>}
      <div style={{fontSize:11,color:C.g400,lineHeight:1.5}}>Your password must be at least 8 characters with at least 1 uppercase letter and 1 number. This account will be used to access your care plan securely.</div>
    </div>:steps[step].qs.map(q=><Q key={q.id}q={q}ans={ans}set={set}togM={togM}rfs={rfs}setRfs={setRfs}safetyTriggered={safetyTriggered}setSafetyTriggered={setSafetyTriggered}showSafetyModal={showSafetyModal}setShowSafetyModal={setShowSafetyModal}/>)}
    {step===0&&ans.prenatal_flag&&<div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:10,padding:"12px 16px",margin:"8px 0 12px",fontSize:13,color:"#166534",lineHeight:1.6}}>We'll tailor your care plan with prenatal-safe modifications so you can safely support your pelvic floor throughout your pregnancy.</div>}
    <ConsistencyAlerts ans={ans} currentQIds={steps[step].qs.map(q=>q.id)}/>
    {steps[step].qs.some(q=>q.id==="phq2_mood")&&phq2Score>=2&&<div style={{margin:"16px 0"}}><PsiResourceCard/></div>}
    <div style={{display:"flex",justifyContent:"space-between",marginTop:20}}>
      <button className="btn bo"onClick={()=>step>0&&goStep(prevVisibleStep(step))}disabled={step===0}>← Back</button>
      <button className="btn bpk"onClick={()=>{if(steps[step].custom==="account"){const email=ans.email||"";if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setAcctErr("Please enter a valid email in the demographics step.");return}if(acctPw.length<8){setAcctErr("Password must be at least 8 characters.");return}if(!/[A-Z]/.test(acctPw)){setAcctErr("Password must contain at least 1 uppercase letter.");return}if(!/[0-9]/.test(acctPw)){setAcctErr("Password must contain at least 1 number.");return}if(acctPw!==acctPwC){setAcctErr("Passwords do not match.");return}const _uuid=()=>typeof crypto.randomUUID==="function"?crypto.randomUUID():([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^(crypto.getRandomValues(new Uint8Array(1))[0]&(15>>c/4))).toString(16));authSession={userId:"usr_"+_uuid(),email,sessionToken:"tok_"+_uuid(),expiresAt:Date.now()+30*60*1000,createdAt:new Date().toISOString()};L("account_created",{email,userId:authSession.userId});db("createSession",{userId:authSession.userId,email:authSession.email,sessionToken:authSession.sessionToken,expiresAt:authSession.expiresAt,createdAt:authSession.createdAt});try{localStorage.setItem("expect_session",authSession.sessionToken)}catch(e){}setAcctErr(null);goStep(nextVisibleStep(step))}else if(blocked){setTriedNext(true)}else{goStep(nextVisibleStep(step))}}}style={{opacity:blocked?0.4:1}}>{steps[step].custom==="account"?"Create Account & Submit →":step===steps.length-1?"Submit Assessment →":"Continue →"}</button>
    </div></div>;
}

function PatientWaiting({name}){
  return<div className="fi"style={{textAlign:"center",padding:"60px 20px"}}>
    <div style={{fontSize:48,marginBottom:16}}>✨</div>
    <div className="h1"style={{fontSize:28}}>Thank you{name?`, ${name}`:""}</div>
    <p style={{fontSize:15,color:C.g500,maxWidth:480,margin:"12px auto 0",lineHeight:1.7}}>Your assessment is complete. A licensed Physical Therapist will review your responses and create a personalized treatment plan.</p>
    <div style={{marginTop:24,padding:16,background:C.g50,borderRadius:12,display:"inline-block"}}>
      <div style={{fontSize:12,color:C.g400,marginBottom:4}}>What happens next</div>
      <div style={{fontSize:13,color:C.g700}}>PT review within 24 hours → Your care plan will appear here</div>
    </div>
  </div>;
}
function Week8CheckIn({baseline,onComplete}){
  const[step,setStep]=useState(0);const[ans,setAns]=useState({});const[done,setDone]=useState(false);
  const set=(k,v)=>setAns(a=>({...a,[k]:v}));
  const togM=(k,v)=>setAns(a=>{const cur=a[k]||[];return{...a,[k]:cur.includes(v)?cur.filter(x=>x!==v):[...cur,v]}});
  // Score helpers
  const c8ICIQ=(a)=>(a.c8_iciq1??0)+(a.c8_iciq2??0)+(a.c8_iciq3??0);
  const c8Pain=(a)=>Math.round(((a.c8_pain1??0)+(a.c8_pain2??0))/2*10)/10;
  const c8PHQ2=(a)=>(a.c8_phq2_interest??0)+(a.c8_phq2_mood??0);
  const c8FSEX=(a)=>(a.c8_fs2a??0)+(a.c8_fs3a??0)+Math.min(a.c8_fs4a??0,3)+Math.min(a.c8_fs5a??0,3);

  // Build conditional steps
  const steps=[];
  // Step 0: ICIQ
  steps.push({id:"iciq",title:"Bladder Leakage Check-In",qs:ICIQ.map(q=>({...q,id:"c8_"+q.id,conditional:q.conditional?a=>q.conditional(Object.fromEntries(Object.entries(a).map(([k,v])=>[k.replace("c8_",""),v]))):undefined}))});
  // Step 1: Pain (conditional)
  if(baseline.pain>0)steps.push({id:"pain",title:"Pain Check-In",qs:[
    {id:"c8_pain1",text:"What is your pelvic pain level right now? (0 = no pain, 10 = worst pain imaginable)",type:"scale",min:0,max:10,lo:"No pain",hi:"Worst pain imaginable"},
    {id:"c8_pain2",text:"What has your average pelvic pain been over the past week? (0 = no pain, 10 = worst pain imaginable)",type:"scale",min:0,max:10,lo:"No pain",hi:"Worst pain imaginable"},
    {id:"c8_pain3",text:"How much has pain affected your daily activities this week? (0 = not at all, 10 = severely limited)",type:"scale",min:0,max:10,lo:"Not at all",hi:"Severely limited"}
  ]});
  // Step 2: PHQ-2
  steps.push({id:"phq2",title:"Emotional Well-Being",qs:[
    {id:"c8_phq2_interest",text:"Over the past 2 weeks, how often have you been bothered by having little interest or pleasure in doing things?",opts:[["Not at all",0],["Several days",1],["More than half the days",2],["Nearly every day",3]]},
    {id:"c8_phq2_mood",text:"Over the past 2 weeks, how often have you been bothered by feeling down, depressed, or hopeless?",opts:[["Not at all",0],["Several days",1],["More than half the days",2],["Nearly every day",3]]}
  ]});
  // Step 3: FLUTSsex (conditional)
  if(baseline.fsex>0)steps.push({id:"fsex",title:"Sexual Symptom Check-In",qs:FLUTSSEX.filter(q=>q.id.endsWith("a")).map(q=>({...q,id:"c8_"+q.id}))});
  // Step 4: Bowel (conditional)
  if(baseline.constipation)steps.push({id:"bowel",title:"Bowel Symptom Check-In",qs:[{id:"c8_bowel",text:"Have your bowel symptoms changed since starting the program?",opts:[["Better","better"],["About the same","same"],["Worse","worse"]]}]});
  // Step 5: Prolapse follow-up (conditional on positive POPDI-6 at intake)
  if(baseline.popdi_positive)steps.push({id:"prolapse",title:"Prolapse Follow-Up",qs:[{id:"c8_prolapse_followup",text:"At your intake, you reported prolapse symptoms. Did you follow up with a provider for a pelvic exam or pessary evaluation?",opts:[["Yes","yes"],["Not yet","not_yet"],["Not applicable","na"]]}]});
  // Step 6: Avoided activities
  if(baseline.avoid&&baseline.avoid.length>0)steps.push({id:"activities",title:"Return to Activities",custom:true});
  // Step 6: NPS
  steps.push({id:"nps",title:"Program Satisfaction",qs:[{id:"c8_nps",text:"How likely are you to recommend this program to a friend or family member?",type:"scale",min:0,max:10,lo:"Not at all likely",hi:"Extremely likely"}]});

  const curStep=steps[step];
  const canNext=()=>{
    if(!curStep)return false;
    if(curStep.custom)return ans.c8_activities_status!==undefined;
    return curStep.qs.every(q=>{
      if(q.conditional&&!q.conditional(ans))return true;
      return ans[q.id]!==undefined;
    });
  };

  const finish=()=>{
    const iciqScore=c8ICIQ(ans);const painScore=c8Pain(ans);const phq2Score=c8PHQ2(ans);const fsexScore=c8FSEX(ans);
    const results={iciq:iciqScore,pain:painScore,phq2:phq2Score,fsex:fsexScore,bowel:ans.c8_bowel,prolapse_followup:ans.c8_prolapse_followup,nps:ans.c8_nps,activities_status:ans.c8_activities_status,activities_note:ans.c8_activities_note,date:new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"}),submitted:true};
    // Audit events
    L("checkin_week8_complete",{iciq_intake:baseline.iciq,iciq_week8:iciqScore,iciq_delta:baseline.iciq-iciqScore,phq2:phq2Score,nps:ans.c8_nps});
    if(baseline.iciq-iciqScore<1)L("PT_ALERT_NO_ICIQ_PROGRESS",{iciq_intake:baseline.iciq,iciq_week8:iciqScore,note:"ICIQ improvement <1 point at Week 8"});
    if(phq2Score>=3)L("depression_screen_positive",{score:phq2Score,severity:phq2Score>=5?"HIGH":"MODERATE",context:"week8_checkin"});
    if(baseline.pain>0&&painScore-baseline.pain>=2)L("CLINICAL_REGRESSION_FLAG",{symptomType:"pain_worsened",intake:baseline.pain,week8:painScore,delta:painScore-baseline.pain});
    if(ans.c8_bowel==="worse")L("BOWEL_REGRESSION",{note:"Patient reports bowel symptoms worse at Week 8"});
    if(ans.c8_prolapse_followup)L("prolapse_followup_week8",{status:ans.c8_prolapse_followup,note:ans.c8_prolapse_followup==="yes"?"Patient followed up with provider for prolapse evaluation":ans.c8_prolapse_followup==="not_yet"?"Patient has not yet followed up for prolapse evaluation":"Patient reports prolapse follow-up not applicable"});
    if(baseline.fsex>0){const fDelta=baseline.fsex-fsexScore;if(fDelta>0)L("flutsex_improvement",{intake:baseline.fsex,week8:fsexScore,delta:fDelta});else if(fDelta<0)L("flutsex_regression",{intake:baseline.fsex,week8:fsexScore,delta:fDelta})}
    if(baseline.avoid&&baseline.avoid.length>0){results.avoid_resumed=ans.c8_activities_status==="yes"||ans.c8_activities_status==="partially"?baseline.avoid:[];results.avoid_resumed_status=ans.c8_activities_status;results.avoid_resumed_note=ans.c8_activities_note||""}
    // Triggered review flags (Phase 2: discretionary PT review)
    if(sharedIntake?.plan?.review_flags){
      if(baseline.iciq-iciqScore<=-3&&!sharedIntake.plan.review_flags.some(f=>f.id==="CLINICAL_REGRESSION")){sharedIntake.plan.review_flags.push({id:"CLINICAL_REGRESSION",type:"triggered",label:"ICIQ Worsened \u22653"});notifyFlagChange()}
      if(phq2Score>(baseline.phq2||0)&&!sharedIntake.plan.review_flags.some(f=>f.id==="PHQ2_WORSENING")){sharedIntake.plan.review_flags.push({id:"PHQ2_WORSENING",type:"triggered",label:"PHQ-2 Worsened"});notifyFlagChange()}
    }
    setDone(true);onComplete(results);
  };

  // Render question helper (reuses Q pattern)
  const renderQ=(q)=>{
    if(q.conditional&&!q.conditional(ans))return null;
    return<div key={q.id}className="qc">
      <div className="qt">{q.text}</div>
      {q.type==="scale"&&<div>
        <div className="scv">{ans[q.id]??q.min}</div>
        <input type="range"className="slr"min={q.min}max={q.max}value={ans[q.id]??q.min}onChange={e=>set(q.id,+e.target.value)}/>
        <div className="scl"><span>{q.lo}</span><span>{q.hi}</span></div>
      </div>}
      {q.opts&&!q.type&&q.opts.map(([l,v])=><button key={v}className={`ob ${ans[q.id]===v?"s":""}`}onClick={()=>set(q.id,v)}>{l}</button>)}
      {q.type==="multi"&&q.opts.map(([l,v])=><button key={v}className={`mo ${(ans[q.id]||[]).includes(v)?"s":""}`}onClick={()=>togM(q.id,v)}>{l}</button>)}
    </div>;
  };

  if(done){
    const iciqDelta=baseline.iciq-c8ICIQ(ans);const painDelta=baseline.pain-c8Pain(ans);const phq2Score=c8PHQ2(ans);const fsexDelta=baseline.fsex-(baseline.fsex>0?c8FSEX(ans):0);
    const deltaColor=(d)=>d>0?C.gn:d<0?C.rd:C.or;
    const deltaArrow=(d)=>d>0?"↓":d<0?"↑":"→";
    return<div className="fi"style={{textAlign:"center",paddingTop:40}}>
      <div style={{fontSize:48,marginBottom:16}}>🎉</div>
      <div className="h1"style={{fontSize:24,marginBottom:8}}>Week 8 Check-In Complete</div>
      <p style={{fontSize:14,color:C.g500,maxWidth:500,margin:"0 auto 24px",lineHeight:1.6}}>Thank you for completing your check-in! Your PT will review your progress.</p>
      <div style={{maxWidth:500,margin:"0 auto",textAlign:"left"}}>
        <div className="card">
          <div className="chd">Your Progress</div>
          <div style={{display:"grid",gap:10}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.g100}`}}>
              <span style={{fontSize:13,color:C.g600}}>ICIQ Score</span>
              <span style={{fontSize:13,fontWeight:700,color:deltaColor(iciqDelta)}}>{baseline.iciq} → {c8ICIQ(ans)} <span>{deltaArrow(iciqDelta)} {Math.abs(iciqDelta)} pts</span></span>
            </div>
            {iciqDelta>=3&&<div style={{background:"#D1FAE5",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#065F46",fontWeight:600}}>This level of improvement is clinically significant.</div>}
            {baseline.pain>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.g100}`}}>
              <span style={{fontSize:13,color:C.g600}}>Pain Composite</span>
              <span style={{fontSize:13,fontWeight:700,color:deltaColor(painDelta)}}>{baseline.pain} → {c8Pain(ans)} <span>{deltaArrow(painDelta)}</span></span>
            </div>}
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.g100}`}}>
              <span style={{fontSize:13,color:C.g600}}>PHQ-2</span>
              <span style={{fontSize:13,fontWeight:700,color:phq2Score>=3?C.rd:C.gn}}>{phq2Score}/6 {phq2Score>=3?"— Positive":"— Negative"}</span>
            </div>
            {baseline.fsex>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.g100}`}}>
              <span style={{fontSize:13,color:C.g600}}>FLUTSsex</span>
              <span style={{fontSize:13,fontWeight:700,color:deltaColor(fsexDelta)}}>{baseline.fsex} → {c8FSEX(ans)} <span>{deltaArrow(fsexDelta)}</span></span>
            </div>}
            {ans.c8_bowel&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.g100}`}}>
              <span style={{fontSize:13,color:C.g600}}>Bowel Symptoms</span>
              <span style={{fontSize:13,fontWeight:700,color:ans.c8_bowel==="better"?C.gn:ans.c8_bowel==="worse"?C.rd:C.or}}>{ans.c8_bowel.charAt(0).toUpperCase()+ans.c8_bowel.slice(1)}</span>
            </div>}
            {ans.c8_prolapse_followup&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.g100}`}}>
              <span style={{fontSize:13,color:C.g600}}>Prolapse Follow-Up</span>
              <span style={{fontSize:13,fontWeight:700,color:ans.c8_prolapse_followup==="yes"?C.gn:ans.c8_prolapse_followup==="not_yet"?C.or:C.g400}}>{ans.c8_prolapse_followup==="yes"?"Yes — saw provider":ans.c8_prolapse_followup==="not_yet"?"Not yet":"N/A"}</span>
            </div>}
            {ans.c8_nps!==undefined&&<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0"}}>
              <span style={{fontSize:13,color:C.g600}}>NPS Score</span>
              <span style={{fontSize:13,fontWeight:700,color:ans.c8_nps>=9?C.gn:ans.c8_nps>=7?C.or:C.rd}}>{ans.c8_nps}/10</span>
            </div>}
          </div>
        </div>
        {phq2Score>=2&&<div className="card"style={{borderLeft:"4px solid #D97706",background:"#FFFBEB"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#92400E",marginBottom:8}}>Support Resources</div>
          <div style={{fontSize:12,color:"#78350F",marginBottom:6}}>Based on your responses, we want to make sure you have access to these resources:</div>
          {PSI_RESOURCES.crisis.map((r,i)=><div key={i}style={{fontSize:12,color:"#7F1D1D",marginBottom:4}}><strong>{r.name}:</strong> <a href={"tel:"+r.phone.replace(/[^0-9]/g,"")}style={{color:"#DC2626"}}>{r.phone}</a> — {r.desc}</div>)}
          {PSI_RESOURCES.support.map((r,i)=><div key={i}style={{fontSize:12,color:"#4B5563",marginBottom:4}}><strong>{r.name}</strong>{r.phone?" — "+r.phone:""}{r.url?<span> — <a href={r.url}target="_blank"rel="noopener noreferrer"style={{color:"#6D28D9"}}>{r.url.replace(/https?:\/\/(www\.)?/,"")}</a></span>:null}</div>)}
        </div>}
      </div>
    </div>;
  }

  return<div className="fi">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div><div className="h1"style={{fontSize:20}}>Week 8 Check-In</div><div className="sub">Step {step+1} of {steps.length}</div></div>
      <div style={{fontSize:12,color:C.g400}}>Takes about 4-5 minutes</div>
    </div>
    <div style={{height:4,background:C.g200,borderRadius:2,marginBottom:20}}><div style={{height:4,background:C.pink,borderRadius:2,width:`${((step+1)/steps.length)*100}%`,transition:"width .3s"}}/></div>
    <div className="card">
      <div className="chd">{curStep.title}</div>
      {curStep.custom?<div>
        <div className="qt">At intake, you told us you were avoiding <strong>{baseline.avoid.join(", ")}</strong> because of your symptoms. Are you able to do any of these now?</div>
        {[["Yes, I've resumed these activities","yes"],["Partially — some but not all","partially"],["Not yet","no"]].map(([l,v])=><button key={v}className={`ob ${ans.c8_activities_status===v?"s":""}`}onClick={()=>set("c8_activities_status",v)}>{l}</button>)}
        <div style={{marginTop:10}}><div className="il">Tell us more (optional)</div><textarea className="inp"value={ans.c8_activities_note||""}onChange={e=>set("c8_activities_note",e.target.value)}placeholder="Which activities have you resumed? Any challenges?"/></div>
      </div>:curStep.qs.map(q=>renderQ(q))}
      {curStep.id==="phq2"&&c8PHQ2(ans)>=2&&ans.c8_phq2_interest!==undefined&&ans.c8_phq2_mood!==undefined&&<PsiResourceCard compact/>}
      {baseline.pain===0&&curStep.id==="pain"&&<div style={{marginTop:10,padding:"10px 14px",background:"#F0FDF4",borderRadius:8,fontSize:12,color:"#065F46"}}>You reported no pain at intake — if that has changed, please message your PT.</div>}
    </div>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:16}}>
      {step>0?<button className="btn bo"onClick={()=>setStep(s=>s-1)}>← Back</button>:<div/>}
      {step<steps.length-1?<button className="btn bpk"disabled={!canNext()}onClick={()=>setStep(s=>s+1)}style={{opacity:canNext()?1:.5}}>Next →</button>:
      <button className="btn bpk"disabled={!canNext()}onClick={finish}style={{opacity:canNext()?1:.5}}>Complete Check-In</button>}
    </div>
  </div>;
}

function Month12CheckIn(){
  const[ans,setAns]=useState({});
  const set=(k,v)=>setAns(a=>({...a,[k]:v}));
  const allAnswered=ans.m12_er!==undefined&&ans.m12_surgery!==undefined&&ans.m12_additional!==undefined;
  const[submitted,setSubmitted]=useState(false);
  const submit=()=>{
    L("month12_checkin_complete",{er_visit:ans.m12_er,surgery:ans.m12_surgery,additional_care:ans.m12_additional});
    if(ans.m12_surgery==="yes")L("CLINICAL_ESCALATION",{type:"surgical_referral",procedure:ans.m12_surgery_detail||"not specified",context:"month12_checkin"});
    if(ans.m12_er==="no"&&ans.m12_surgery==="no"&&ans.m12_additional==="no")L("surgical_avoidance_confirmed",{note:"Patient reports no ER visits, no surgery, no additional pelvic care at Month 12"});
    setSubmitted(true);
  };
  if(submitted)return<div style={{textAlign:"center",padding:40}}>
    <div style={{fontSize:48,marginBottom:16}}>🎉</div>
    <div className="h1"style={{fontSize:22}}>Thank You!</div>
    <p style={{fontSize:14,color:C.g500,maxWidth:480,margin:"12px auto",lineHeight:1.6}}>Your responses have been recorded. A $10 Amazon gift card will be sent to your email within 3 business days.</p>
  </div>;
  return<div>
    <div style={{background:"#FEF3C7",border:"2px dashed #D97706",borderRadius:10,padding:"10px 14px",marginBottom:16,textAlign:"center"}}>
      <strong style={{color:"#D97706",fontSize:13}}>Future State — Month 12 Utilization Check-In</strong>
      <p style={{fontSize:11,color:"#4B5563",marginTop:2}}>This questionnaire will be administered 12 months after program enrollment.</p>
    </div>
    <div className="card">
      <div className="chd">Month 12 Utilization Questions</div>
      <div className="qc"><div className="qt">Since completing the Expect program, have you visited an emergency room or urgent care clinic for pelvic floor symptoms?</div>
        {[["No","no"],["Yes","yes"]].map(([l,v])=><button key={v}className={`ob ${ans.m12_er===v?"s":""}`}onClick={()=>set("m12_er",v)}>{l}</button>)}</div>
      <div className="qc"><div className="qt">Since completing the Expect program, have you been referred for or undergone pelvic floor surgery?</div>
        {[["No","no"],["Yes","yes"]].map(([l,v])=><button key={v}className={`ob ${ans.m12_surgery===v?"s":""}`}onClick={()=>set("m12_surgery",v)}>{l}</button>)}
        {ans.m12_surgery==="yes"&&<div style={{marginTop:8}}><div className="il">What procedure?</div><input className="inp"value={ans.m12_surgery_detail||""}onChange={e=>set("m12_surgery_detail",e.target.value)}placeholder="e.g., sling procedure, prolapse repair"/></div>}</div>
      <div className="qc"><div className="qt">Since completing the Expect program, have you sought additional pelvic floor care from another provider?</div>
        {[["No","no"],["Yes","yes"]].map(([l,v])=><button key={v}className={`ob ${ans.m12_additional===v?"s":""}`}onClick={()=>set("m12_additional",v)}>{l}</button>)}
        {ans.m12_additional==="yes"&&<div style={{marginTop:8}}><div className="il">What type of provider?</div><input className="inp"value={ans.m12_additional_detail||""}onChange={e=>set("m12_additional_detail",e.target.value)}placeholder="e.g., urogynecologist, another PT"/></div>}</div>
      <button className="btn bpk"disabled={!allAnswered}onClick={submit}style={{marginTop:12,opacity:allAnswered?1:.5}}>Submit Check-In</button>
    </div>
  </div>;
}

function MyCareplan({data}){
  const{ans,iciq,pain,gupi,fluts,fsex,popdi:_popdiC,plan}=data;const popdi=_popdiC||sPOPDI(ans);
  const[tab,setTab]=useState("scores");
  const[expanded,setExpanded]=useState({});
  const toggle=(id)=>setExpanded(p=>({...p,[id]:!p[id]}));
  const fullName=(ans.name_first||"")+" "+(ans.name_last||"");
  const tier=iciq.total>=13?"Beginner":iciq.total>=6?"Moderate":"Advanced";
  const tierWks=iciq.total>=13?"12":iciq.total>=6?"8":"6";
  const cueLbl={biologic:"Body function",imaginative:'Imaginative ("blueberry" cue per Crane & Dugan, 2025)',breathing:"Breath-based",simple_contract:"Simple contraction",default:"Default"}[ans.cue_preference]||"Default";
  const avF=(ans.avoid_activities||[]).filter(x=>x!=="none");
  const phq2=calcPHQ2(ans);
  const dateStr=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  // Adherence state
  const[adherenceLog,setAdherenceLog]=useState(DEMO_ADHERENCE_LOG);
  const[todayLogged,setTodayLogged]=useState(false);
  const[adhStatus,setAdhStatus]=useState(null);
  const[adhNote,setAdhNote]=useState("");
  const[showCheckin,setShowCheckin]=useState(false);
  const[showExport,setShowExport]=useState(false);
  const[exportDone,setExportDone]=useState(false);
  const cpRef=useRef(null);
  useEffect(()=>{document.body.style.overflow=showExport?"hidden":"";return()=>{document.body.style.overflow=""}},[showExport]);
  useEffect(()=>{if(exportDone){const t=setTimeout(()=>setExportDone(false),8000);return()=>clearTimeout(t)}},[exportDone]);
  const[showProgress,setShowProgress]=useState(false);
  const[week8Results,setWeek8Results]=useState(data.week8||null);
  const logAdherence=()=>{
    const entry={date:new Date().toISOString().split("T")[0],status:adhStatus,note:adhNote||undefined};
    setAdherenceLog(p=>{const updated=[...p,entry];const recent=updated.slice(-14);if(recent.length>=14){const yesCount=recent.filter(e=>e.status==="yes").length;if(yesCount/recent.length<0.5&&sharedIntake?.plan?.review_flags&&!sharedIntake.plan.review_flags.some(f=>f.id==="ADHERENCE_CONCERN"))sharedIntake.plan.review_flags.push({id:"ADHERENCE_CONCERN",type:"triggered",label:"Adherence <50%"});notifyFlagChange()}return updated});setTodayLogged(true);setAdhStatus(null);setAdhNote("");
    L("daily_adherence_entry",{date:entry.date,status:entry.status,note:entry.note});
  };
  // Streak calculation
  const streak=(()=>{let c=0;for(let i=adherenceLog.length-1;i>=0;i--){if(adherenceLog[i].status==="yes")c++;else break}return c})();
  // Month adherence days
  const monthDays=adherenceLog.filter(e=>{const d=new Date(e.date);const now=new Date();return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).length;
  // Baseline for Week 8
  const baseline={iciq:iciq.total,pain:pain.composite,phq2,fsex:fsex.total,constipation:(ans.bowel_constipation??0)>=2||(ans.bowel_frequency??3)<=1||(ans.bristol_stool??4)<=2,avoid:avF,popdi_positive:(popdi?.positiveCount||0)>0};
  const onCheckinComplete=(results)=>{setWeek8Results(results);setShowCheckin(false);if(sharedIntake){sharedIntake.week8=results;if(sharedIntake.userId)db("updatePatientWeek8",{userId:sharedIntake.userId,week8:results});if(sharedIntake.outcomeRecordId){const adhRate=adherenceLog.length>0?Math.round(adherenceLog.filter(e=>e.status==="yes").length/adherenceLog.length*100):0;const orec=completeOutcomeRecord(sharedIntake.outcomeRecordId,baseline,{...results,adherence_rate:adhRate});if(orec&&orec.outcome)db("completeOutcomeRecord",{recordId:sharedIntake.outcomeRecordId,outcome:orec.outcome})}}};
  // Polished care plan CSS (from sample-patient-care-plan design)
  const cpCSS=`
  .cp-shell{max-width:820px;margin:0 auto;font-family:'DM Sans',sans-serif;color:#1F2937;line-height:1.6}
  .cp-hdr{background:linear-gradient(135deg,#4C1D95 0%,#6D28D9 50%,#DB2777 100%);border-radius:14px;padding:32px;color:#fff;margin-bottom:20px;position:relative;overflow:hidden}
  .cp-hdr::after{content:'';position:absolute;top:-40%;right:-10%;width:300px;height:300px;background:radial-gradient(circle,rgba(255,255,255,.08) 0%,transparent 70%);pointer-events:none}
  .cp-hdr .cp-logo{font-size:14px;font-weight:700;letter-spacing:4px;opacity:.8;margin-bottom:8px;background:transparent}.cp-hdr .cp-logo img{background:transparent;border-radius:4px}
  .cp-hdr .cp-sub{font-size:13px;opacity:.75;margin-bottom:16px}
  .cp-hdr .cp-name{font-size:22px;font-weight:700;margin-bottom:2px}
  .cp-hdr .cp-meta{font-size:12px;opacity:.7}
  .cp-hdr .cp-badge{display:inline-block;background:rgba(255,255,255,.15);backdrop-filter:blur(4px);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;margin-top:12px;margin-right:8px}
  .cp-sample{background:#FEF3C7;border:2px dashed #D97706;border-radius:10px;padding:12px 16px;margin-bottom:16px;text-align:center}
  .cp-sample strong{color:#D97706;font-size:13px}
  .cp-sample p{font-size:11px;color:#4B5563;margin-top:2px}
  .cp-tabs{display:flex;gap:0;border-bottom:2px solid #E5E7EB;margin-bottom:20px;overflow-x:auto}
  .cp-tab{padding:12px 18px;font-size:13px;font-weight:500;color:#9CA3AF;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:.2s}
  .cp-tab:hover{color:#4B5563}
  .cp-tab.on{color:#6D28D9;border-bottom-color:#DB2777;font-weight:600}
  .cp-card{background:#fff;border-radius:14px;padding:24px;margin-bottom:16px;border:1px solid #E5E7EB;box-shadow:0 2px 8px rgba(0,0,0,.03)}
  .cp-card-title{font-family:'DM Serif Display',serif;font-size:18px;color:#111827;margin-bottom:12px}
  .cp-card-sub{font-size:12px;color:#9CA3AF;margin-bottom:16px}
  .cp-scores-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
  .cp-score-chip{background:#F3F4F6;border-radius:12px;padding:16px;text-align:center;overflow:hidden;word-wrap:break-word}
  .cp-score-chip .cp-sv{font-size:28px;font-weight:700;color:#6D28D9;overflow-wrap:break-word;word-break:break-word}
  .cp-score-chip .cp-sl{font-size:11px;color:#9CA3AF;margin-top:2px;text-transform:uppercase;letter-spacing:.5px}
  .cp-score-chip .cp-sd{font-size:12px;color:#4B5563;margin-top:4px;font-weight:500}
  .cp-score-chip.warn{background:#FEF3C7}.cp-score-chip.warn .cp-sv{color:#D97706}
  .cp-score-chip.good{background:#D1FAE5}.cp-score-chip.good .cp-sv{color:#059669}
  .cp-bar-wrap{margin:20px 0}
  .cp-bar-label{display:flex;justify-content:space-between;font-size:11px;color:#9CA3AF;margin-bottom:4px}
  .cp-bar{height:8px;background:#E5E7EB;border-radius:4px;overflow:hidden}
  .cp-bar-fill{height:100%;border-radius:4px;transition:width .6s ease}
  .cp-exc{border:1px solid #E5E7EB;border-radius:12px;margin-bottom:14px;overflow:hidden}
  .cp-exh{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;cursor:pointer;background:#fff;transition:.2s}
  .cp-exh:hover{background:#F3F4F6}
  .cp-exh .cp-exn{font-weight:600;font-size:14px;color:#111827}
  .cp-exh .cp-exr{font-size:12px;color:#6D28D9;font-weight:500}
  .cp-exb{padding:0 20px 20px;display:none;border-top:1px solid #E5E7EB}
  .cp-exb.open{display:block;padding-top:16px}
  .cp-exstep{margin-bottom:10px;display:flex;gap:8px;align-items:flex-start}
  .cp-exstep .cp-num{display:inline-flex;width:22px;height:22px;border-radius:50%;background:#EDE9FE;color:#6D28D9;font-size:11px;font-weight:700;align-items:center;justify-content:center;flex-shrink:0}
  .cp-exstep .cp-txt{font-size:13px;color:#4B5563}
  .cp-exwarn{background:#FEF3C7;border-radius:8px;padding:10px 14px;font-size:12px;color:#78350F;margin-top:10px;line-height:1.5}
  .cp-exstop{background:#FEE2E2;border-radius:8px;padding:10px 14px;font-size:12px;color:#991B1B;margin-top:8px;line-height:1.5}
  .cp-adj-item{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #F3F4F6}
  .cp-adj-item:last-child{border-bottom:none}
  .cp-adj-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
  .cp-strat-section{margin-bottom:24px}
  .cp-strat-h{font-family:'DM Serif Display',serif;font-size:16px;color:#111827;margin-bottom:8px}
  .cp-strat-body{font-size:13px;color:#4B5563;line-height:1.7}
  .cp-strat-body ol,.cp-strat-body ul{padding-left:20px;margin:8px 0}
  .cp-strat-body li{margin-bottom:6px}
  .cp-tl{border-left:3px solid #E5E7EB;padding-left:20px;margin-top:16px}
  .cp-tl-item{margin-bottom:16px;position:relative}
  .cp-tl-item::before{content:'';position:absolute;left:-26px;top:4px;width:12px;height:12px;border-radius:50%;background:#6D28D9;border:2px solid #fff;box-shadow:0 0 0 2px #6D28D9}
  .cp-tl-wk{font-size:12px;font-weight:700;color:#6D28D9;margin-bottom:2px}
  .cp-tl-desc{font-size:13px;color:#4B5563;line-height:1.6}
  .cp-rpt-section{margin-bottom:20px}
  .cp-rpt-h{font-family:'DM Serif Display',serif;font-size:15px;color:#111827;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB}
  .cp-rpt-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #F3F4F6;font-size:12px}
  .cp-rpt-row:last-child{border-bottom:none}
  .cp-rpt-row .cp-rl{color:#6B7280}.cp-rpt-row .cp-rv{color:#111827;font-weight:500;text-align:right;max-width:60%}
  .cp-att{background:#EDE9FE;border-radius:12px;padding:16px;margin-top:20px;font-size:12px;color:#4C1D95;line-height:1.6}
  .cp-att-h{font-family:'DM Serif Display',serif;font-size:14px;color:#4C1D95;margin-bottom:6px}
  .cp-prn{background:#fff;border:1.5px solid #E5E7EB;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;color:#4B5563;font-family:inherit}
  .cp-prn:hover{border-color:#6D28D9;color:#6D28D9}
  .cp-footer{text-align:center;padding:20px 0;font-size:11px;color:#9CA3AF}
  .cp-footer a{color:#6D28D9;text-decoration:none}
  .cp-export-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 22px;background:#fff;border:1.5px solid #6D28D9;border-radius:10px;color:#6D28D9;font-size:13px;font-weight:600;cursor:pointer;transition:.2s;font-family:inherit}
  .cp-export-btn:hover{background:#6D28D9;color:#fff}
  `;
  // If showing checkin, render that instead
  if(showCheckin)return<div className="fi"><style>{cpCSS}</style><div className="cp-shell"><Week8CheckIn baseline={baseline} onComplete={onCheckinComplete}/></div></div>;

  const ScoresTab=()=><div>
    <div className="cp-card">
      <div className="cp-card-title">Your Assessment Results</div>
      <div className="cp-card-sub">These scores come from validated clinical instruments used worldwide. They help your PT understand your symptoms and track your progress.</div>
      <div className="cp-scores-grid">
        <div className={`cp-score-chip ${iciq.total>=6?"warn":""}`}><div className="cp-sv">{iciq.total}</div><div className="cp-sl">ICIQ Score</div><div className="cp-sd">{iciq.severity} (out of 21)</div></div>
        <div className="cp-score-chip"><div className="cp-sv">{iciq.subtype.replace(" UI","")}</div><div className="cp-sl">Leakage Type</div><div className="cp-sd">{iciq.subtype.includes("Mixed")?"Stress + Urge":iciq.subtype}</div></div>
        <div className="cp-score-chip"><div className="cp-sv">{pain.composite}/10</div><div className="cp-sl">Pain Level</div><div className="cp-sd">{pain.severity}</div></div>
        <div className="cp-score-chip"><div className="cp-sv">{gupi.total}</div><div className="cp-sl">GUPI Score</div><div className="cp-sd">{gupi.severity} (out of 45)</div></div>
        <div className="cp-score-chip good"><div className="cp-sv" style={{fontSize:18}}>{tier}</div><div className="cp-sl">Program Tier</div><div className="cp-sd">{tierWks}-week program</div></div>
        {avF.length>0&&<div className="cp-score-chip"><div className="cp-sv">{avF.length}</div><div className="cp-sl">Avoided Activities</div><div className="cp-sd">{avF.join(", ")}</div></div>}
      </div>
      <div className="cp-bar-wrap">
        <div className="cp-bar-label"><span>Less Severe</span><span>ICIQ: {iciq.total}/21</span><span>More Severe</span></div>
        <div className="cp-bar"><div className="cp-bar-fill"style={{width:`${iciq.total/21*100}%`,background:`linear-gradient(90deg,#059669,#D97706${iciq.total>15?",#DC2626":""})`}}/></div>
      </div>
    </div>
    <div className="cp-card">
      <div className="cp-card-title">What Your Scores Mean</div>
      <p style={{fontSize:13,color:"#4B5563",lineHeight:1.7}}>
        We assessed your symptoms using the International Consultation on Incontinence Questionnaire (ICIQ), the global gold standard used by doctors to measure pelvic health. Your ICIQ score of <strong>{iciq.total}</strong> places you in the <strong>{iciq.severity.toLowerCase()} severity</strong> range. {iciq.subtype==="Mixed UI"?"Your leakage is mixed type — a combination of stress incontinence (leaking during coughing, sneezing, or activity) and urge incontinence (sudden strong need to urinate). This is the most common pattern and responds well to the combination approach in your program.":iciq.subtype==="Stress UI"?"Your leakage is stress type — leaking during physical activity, coughing, or sneezing. This responds very well to pelvic floor strengthening.":iciq.subtype==="Urge UI"?"Your leakage is urge type — a sudden, strong need to urinate that's hard to control. This responds well to bladder retraining combined with exercises.":"Your PT has identified your specific pattern and built your program accordingly."}
      </p>
      {ans.patient_goal&&<p style={{fontSize:13,color:"#4B5563",lineHeight:1.7,marginTop:10}}>Your goal: <em>"{ans.patient_goal}"</em> Your program is designed specifically around this.</p>}
    </div>
  </div>;

  // Cueing phrase based on patient preference
  const cueMap={
    biologic:{phrase:"Squeeze as if stopping the flow of urine",short:"stop urine flow"},
    imaginative:{phrase:"Imagine gently closing around and lifting a blueberry",short:"lift a blueberry"},
    breathing:{phrase:"As you breathe out, draw in and lift your pelvic floor",short:"exhale and lift"},
    simple_contract:{phrase:"Contract your pelvic floor muscles",short:"contract PF"},
    default:{phrase:"Gently squeeze and lift your pelvic floor",short:"squeeze and lift"}
  };
  const cue=cueMap[ans.cue_preference]||cueMap.default;
  // Replace generic PF cues in howTo text with patient's preferred cue
  function applyCue(text){
    return text
      .replace(/Squeeze your pelvic floor/gi,cue.phrase)
      .replace(/engage your pelvic floor/gi,cue.phrase.charAt(0).toLowerCase()+cue.phrase.slice(1))
      .replace(/gently squeeze your pelvic floor/gi,cue.phrase)
      .replace(/Imagine stopping the flow of urine/gi,cue.phrase)
      .replace(/stopping the flow of urine/gi,cue.short)
      .replace(/pelvic floor FIRST/gi,"pelvic floor FIRST — "+cue.short);
  }

  const ExTab=()=><div>
    <div className="cp-card">
      <div className="cp-card-title">Your Exercise Program</div>
      <div className="cp-card-sub">{tier} Tier · {tierWks} weeks · {plan.freq} · Cueing style: {cueLbl.split("(")[0].trim()}</div>
      {plan.prenatal&&<div style={{background:"#ECFDF5",border:"1px solid #86EFAC",borderRadius:10,padding:"14px 18px",marginBottom:14,fontSize:13,color:"#065F46",lineHeight:1.6}}><strong>Prenatal Pelvic Floor Protocol</strong> — Your exercises have been adapted for pregnancy. Avoid lying flat on your back — use a wedge pillow or rolled towel under your right hip for any floor exercises. Stop any exercise that causes discomfort and contact your OB/GYN or midwife.</div>}
      {ans.cue_preference==="biologic"&&<div className="cp-exwarn"style={{marginBottom:14}}>⚠ <strong>Important:</strong> Your exercises use the "stop the flow of urine" cue to help you find the right muscles. <strong>Never practice pelvic floor exercises during actual urination.</strong> Use the cue as a mental image only.</div>}
      {/* Cueing reminder */}
      <div style={{background:ans.cue_preference==="imaginative"?"#EDE9FE":ans.cue_preference==="breathing"?"#E0F2FE":"#FEF3C7",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,lineHeight:1.5,color:ans.cue_preference==="imaginative"?"#4C1D95":ans.cue_preference==="breathing"?"#0C4A6E":"#78350F"}}>
        <strong>Your cueing style:</strong> When instructions say to engage your pelvic floor, use this cue: <em>"{cue.phrase}"</em>
      </div>
      {plan.ex.map((ex,i)=>{const lib=PATIENT_EX[ex.n];const open=expanded["ex_"+i];return<div key={i}className="cp-exc">
        <div className="cp-exh"onClick={()=>toggle("ex_"+i)}>
          <div><div className="cp-exn">{i+1}. {lib?lib.name:ex.n}{ex.prenatalModified&&<span style={{background:"#D1FAE5",color:"#065F46",fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:10,marginLeft:8}}>Prenatal-adapted</span>}</div><div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{ex.f}</div></div>
          <div className="cp-exr">{ex.s}×{ex.r} · {ex.h} hold</div>
        </div>
        <div className={`cp-exb ${open?"open":""}`}>
          {ex.prenatalModified&&<div style={{background:"#ECFDF5",border:"1px solid #A7F3D0",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#065F46",lineHeight:1.5,marginBottom:12}}><strong>Modified for pregnancy</strong> — lying flat on your back after the first trimester can compress a major blood vessel. This exercise has been adjusted to a supported incline or side-lying position.</div>}
          {lib?.howTo?.map((s,j)=>{const cued=applyCue(s);const hasCue=cued!==s;return<div key={j}className="cp-exstep"><span className="cp-num">{j+1}</span><span className="cp-txt">{hasCue?cued.split(cue.phrase).map((part,pi,arr)=>pi<arr.length-1?<React.Fragment key={pi}>{part}<strong style={{color:"#6D28D9",background:"#EDE9FE",padding:"1px 4px",borderRadius:4}}>{cue.phrase}</strong></React.Fragment>:<React.Fragment key={pi}>{part}</React.Fragment>):cued}</span></div>;})}
          {lib?.mistakes&&<div className="cp-exwarn">⚠ <strong>Common mistake{lib.mistakes.length>1?"s":""}:</strong> {lib.mistakes.join(". ")}.</div>}
          {lib?.stop&&<div className="cp-exstop">🛑 <strong>Stop if:</strong> {lib.stop}</div>}
          {lib?.tips&&<div style={{fontSize:12,color:"#0369A1",lineHeight:1.5,fontStyle:"italic",marginTop:8}}>💡 {lib.tips}</div>}
        </div>
      </div>;})}
    </div>
  </div>;

  const AdjTab=()=><div>
    {phq2>=2&&<div className="cp-card" style={{borderLeft:"4px solid #D97706",background:"#FFFBEB"}}>
      <div className="cp-card-title" style={{color:"#92400E"}}>Support Resources</div>
      <div className="cp-card-sub" style={{color:"#78350F"}}>Based on your responses, your PT wants to make sure you have access to these support resources.</div>
      <div style={{background:"#FEF2F2",borderRadius:10,padding:14,marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:"#991B1B",marginBottom:8}}>If you are in immediate danger or experiencing a crisis:</div>
        {PSI_RESOURCES.crisis.map((r,i)=><div key={i}style={{fontSize:12,color:"#7F1D1D",marginBottom:4}}>
          <strong>{r.name}:</strong> <a href={"tel:"+r.phone.replace(/[^0-9]/g,"")}style={{color:"#DC2626"}}>{r.phone}</a> — {r.desc}
        </div>)}
      </div>
      {PSI_RESOURCES.support.map((r,i)=><div key={i}className="cp-adj-item">
        <div className="cp-adj-icon"style={{background:"#FEF3C7"}}>{r.url?"🔗":"📞"}</div>
        <div><div style={{fontWeight:600,fontSize:13,color:"#111827"}}>{r.name}{r.phone?<span> — <a href={"tel:"+r.phone.replace(/[^0-9]/g,"")}style={{color:"#D97706"}}>{r.phone}</a></span>:null}</div>
        <div style={{fontSize:12,color:"#4B5563",marginTop:2,lineHeight:1.5}}>{r.desc}{r.url?<span> <a href={r.url}target="_blank"rel="noopener noreferrer"style={{color:"#6D28D9"}}>{r.url.replace(/https?:\/\/(www\.)?/,"")}</a></span>:null}</div></div>
      </div>)}
      <div style={{fontSize:10,color:"#9CA3AF",marginTop:12,lineHeight:1.5}}>{PSI_RESOURCES.disclaimer}</div>
    </div>}
    <div className="cp-card">
      <div className="cp-card-title">Your Personalized Recommendations</div>
      <div className="cp-card-sub">Based on your assessment, your PT recommends the following additional support alongside your exercises.</div>
      {plan.adjuncts.map((adj,i)=>{const lib=PATIENT_ADJ[adj.n];const icons={"behavioral":"🔄","device":"📊","referral":"🏥"};const bgs={"behavioral":"#E0F2FE","device":"#EDE9FE","referral":"#F3F4F6"};const displayText=adj.patientText||(lib?`${lib.what}${lib.why?` ${lib.why}`:""}`:(adj.d||""));return<div key={i}className="cp-adj-item">
        <div className="cp-adj-icon"style={{background:bgs[adj.type]||"#F3F4F6"}}>{icons[adj.type]||"📋"}</div>
        <div><div style={{fontWeight:600,fontSize:13,color:"#111827"}}>{lib?lib.name:adj.n}</div><div style={{fontSize:12,color:"#4B5563",marginTop:2,lineHeight:1.5}}>{displayText}</div></div>
      </div>;})}
    </div>
  </div>;

  const StrategiesTab=()=><div>
    <div className="cp-card">
      <div className="cp-card-title">Behavioral Strategies & Education</div>
      <div className="cp-strat-section"><div className="cp-strat-h">Understanding Your Pattern: {iciq.subtype}</div>
        <div className="cp-strat-body">{iciq.subtype==="Mixed UI"||iciq.subtype==="Mixed"?<>You have <strong>mixed incontinence</strong> — a combination of stress leaking (during coughing, sneezing, jumping) and urge leaking (sudden strong need to go). This is the most common pattern and responds very well to the combination of pelvic floor strengthening + bladder retraining in your program.</>:iciq.subtype==="Stress UI"||iciq.subtype==="Stress"?<>You have <strong>stress incontinence</strong> — leaking happens during physical activities. This responds well to pelvic floor strengthening.</>:iciq.subtype==="Urge UI"||iciq.subtype==="Urge"?<>You have <strong>urge incontinence</strong> — a sudden, strong need to urinate. This responds well to bladder retraining combined with exercises.</>:"Your PT has identified your specific pattern and built your program accordingly."}</div>
      </div>
      {(iciq.subtype.includes("Urge")||iciq.subtype.includes("Mixed"))&&<div className="cp-strat-section"><div className="cp-strat-h">The "Freeze and Squeeze" — Bladder Retraining</div>
        <div className="cp-strat-body">Normal bladder emptying is every 2–4 hours. When you feel a strong, sudden urge to urinate before 2 hours:<ol><li><strong>STOP</strong> where you are. Do not rush to the bathroom.</li><li>Do <strong>5 quick pelvic floor squeezes</strong> (1 second each).</li><li>Take <strong>3 slow breaths</strong> (in for 4, out for 6).</li><li><strong>Wait</strong> until the urge wave passes (usually 30–60 seconds).</li><li>Then walk <strong>calmly</strong> to the bathroom.</li></ol>This retrains your bladder to respond to your brain, not the other way around.</div>
      </div>}
      <div className="cp-strat-section"><div className="cp-strat-h">"The Knack" — Pre-Emptive Protection</div>
        <div className="cp-strat-body">Before any activity that might cause a leak (coughing, sneezing, lifting, jumping):<ol><li><strong>Exhale</strong> and simultaneously <strong>squeeze your pelvic floor</strong>.</li><li>Maintain the squeeze <strong>during</strong> the cough/sneeze/lift.</li><li>Release after the effort.</li></ol>This is the single most effective technique for preventing stress leaks and is backed by strong evidence.</div>
      </div>
      <div className="cp-strat-section"><div className="cp-strat-h">Daily Habits That Help</div>
        <div className="cp-strat-body"><ul><li><strong>Caffeine:</strong> Reduce to 1 cup/day or switch to half-caf. Caffeine irritates the bladder.</li><li><strong>Water:</strong> Drink steadily throughout the day (not all at once). 6–8 glasses is ideal.</li><li><strong>Fiber:</strong> Aim for 25–30g/day. Constipation increases pelvic floor strain.</li><li><strong>Exhale before exertion:</strong> Always breathe out when lifting, pushing, or straining.</li></ul></div>
      </div>
      <div className="cp-strat-section"><div className="cp-strat-h">What to Expect: Your Timeline</div>
        <div className="cp-tl">
          {[["Weeks 1–2","Building awareness. Learning to find and engage the right muscles. Exercises may feel awkward — that's completely normal."],["Weeks 3–4","First improvements. Many women notice fewer \"close calls\" and better ability to hold. Urgency episodes may start to reduce."],["Weeks 5–6","Noticeable changes. Begin reintroducing avoided activities with The Knack. PT will help with graduated activity plan."],["Weeks 7–8","Consolidation. Exercises become automatic. Most women see significant improvement by this point. Re-assessment to measure progress."]].map(([wk,desc],i)=><div key={i}className="cp-tl-item"><div className="cp-tl-wk">{wk}</div><div className="cp-tl-desc">{desc}</div></div>)}
        </div>
      </div>
    </div>
  </div>;

  const ReportTab=()=><div>
    <div className="cp-card">
      <div style={{display:"flex",alignItems:"center",marginBottom:12}}><img src="Expect_Logo_WhiteTM.png" alt="EXPECT" style={{height:32,marginRight:12,filter:"invert(1)"}}/><div className="cp-card-title" style={{marginBottom:0}}>Clinical Summary — For Your Records</div></div>
      <div className="cp-card-sub">Print or share this summary with your referring provider.</div>
      <button className="cp-prn"onClick={()=>window.print()}>🖨️ Print This Report</button>
      <div style={{marginTop:24}}>
        <div className="cp-rpt-section"><div className="cp-rpt-h">Patient Information</div>
          <div className="cp-rpt-row"><span className="cp-rl">Name</span><span className="cp-rv">{fullName}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">DOB</span><span className="cp-rv">{ans.dob||"—"}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">Status</span><span className="cp-rv">{(ans.pregnancy_status||"").replace(/_/g," ")}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">Assessment Date</span><span className="cp-rv">{dateStr}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">Plan Approved</span><span className="cp-rv">{dateStr}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">Reviewing PT</span><span className="cp-rv">Nicole L. Dugan, PT, DPT, WCS</span></div>
        </div>
        <div className="cp-rpt-section"><div className="cp-rpt-h">Clinical Scores</div>
          <div className="cp-rpt-row"><span className="cp-rl">ICIQ-UI SF</span><span className="cp-rv">{iciq.total}/21 — {iciq.severity}, {iciq.subtype}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">FLUTS</span><span className="cp-rv">F: {fluts?.F||0}/12 · V: {fluts?.V||0}/12</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">POPDI-6</span><span className="cp-rv">{popdi.positiveCount}/6 positive{popdi.positiveCount>0?` (score: ${popdi.score}/100)${popdi.bulge?" — BULGE SYMPTOMS":""}`:""}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">FLUTSsex</span><span className="cp-rv">{fsex?.total||0}/12</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">GUPI</span><span className="cp-rv">{gupi.total}/45 — {gupi.severity} (P: {gupi.pain}, U: {gupi.urinary}, Q: {gupi.qol})</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">Pain Composite</span><span className="cp-rv">{pain.composite}/10 — {pain.severity}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">Program Tier</span><span className="cp-rv">{tier} — {tierWks} weeks</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">Cueing Style</span><span className="cp-rv">{cueLbl}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">PHQ-2</span><span className="cp-rv">{phq2}/6 — {phq2>=3?"Positive":"Negative"}</span></div>
          {phq2>=2&&<div className="cp-rpt-row"><span className="cp-rl">Support Resources</span><span className="cp-rv" style={{color:"#D97706"}}>Provided — PSI crisis lines + support resources (PHQ-2 ≥2)</span></div>}
          {avF.length>0&&<div className="cp-rpt-row"><span className="cp-rl">Activities Avoided</span><span className="cp-rv">{avF.join(", ")} ({avF.length} categories)</span></div>}
          <div className="cp-rpt-row"><span className="cp-rl">Medication Modification</span><span className="cp-rv">{(ans.med_modify??0)===1?"Yes":"No"}</span></div>
        </div>
        <div className="cp-rpt-section"><div className="cp-rpt-h">Exercise Prescription</div>
          {plan.ex.map((ex,i)=>{const lib=PATIENT_EX[ex.n];return<div key={i}className="cp-rpt-row"><span className="cp-rl">{lib?lib.name:ex.n}</span><span className="cp-rv">{ex.r} reps × {ex.s} sets, {ex.h} hold, {ex.f}</span></div>})}
        </div>
        <div className="cp-rpt-section"><div className="cp-rpt-h">Adjunct Recommendations</div>
          {plan.adjuncts.map((adj,i)=>{const lib=PATIENT_ADJ[adj.n];return<div key={i}className="cp-rpt-row"><span className="cp-rl">{lib?lib.name:adj.n}</span><span className="cp-rv">{adj.rx||lib?.what||""}</span></div>})}
        </div>
        <div className="cp-rpt-section"><div className="cp-rpt-h">Plan Details</div>
          <div className="cp-rpt-row"><span className="cp-rl">Frequency</span><span className="cp-rv">{plan.freq}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">Duration</span><span className="cp-rv">{plan.dur}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">Goal</span><span className="cp-rv">{ans.patient_goal||"—"}</span></div>
          <div className="cp-rpt-row"><span className="cp-rl">Precautions</span><span className="cp-rv">{(plan.prec||[]).join(" · ")}</span></div>
        </div>
        <div className="cp-att"><div className="cp-att-h">PT Attestation</div>
          <p>I have reviewed the AI-generated assessment, the patient's individual responses, and the treatment plan. This plan reflects my independent clinical judgment and is appropriate for this patient's presentation.</p>
          <p style={{marginTop:8}}><strong>Signed:</strong> Nicole L. Dugan, PT, DPT, WCS — {dateStr}</p>
          <p style={{marginTop:4,fontSize:11,opacity:.7}}>Plan status: Approved · Plan ID: {plan.id}</p>
        </div>
      </div>
    </div>
  </div>;

  const tabs=[["scores","📊 My Scores"],["exercises","💪 Exercises"],["adjuncts","📋 Recommendations"],["strategies","🧠 Strategies"],["report","📄 Full Report"],...(week8Results?[["week8results","📈 Week 8 Results"]]:[])];

  // Week 8 Results tab
  const Week8Tab=()=>{if(!week8Results)return null;const iciqDelta=baseline.iciq-week8Results.iciq;const painDelta=baseline.pain-(week8Results.pain||0);
    const dc=(d)=>d>0?C.gn:d<0?C.rd:C.or;const da=(d)=>d>0?"↓ improved":d<0?"↑ worsened":"→ no change";
    return<div><div className="cp-card"><div className="cp-card-title">Week 8 Progress Summary</div>
      <div className="cp-scores-grid">
        <div className={`cp-score-chip ${iciqDelta>=3?"good":iciqDelta>0?"":"warn"}`}><div className="cp-sv">{week8Results.iciq}</div><div className="cp-sl">ICIQ Score</div><div className="cp-sd"style={{color:dc(iciqDelta)}}>{da(iciqDelta)} ({iciqDelta>0?"-":iciqDelta<0?"+":""}{Math.abs(iciqDelta)} pts)</div></div>
        {baseline.pain>0&&<div className={`cp-score-chip ${painDelta>0?"good":"warn"}`}><div className="cp-sv">{week8Results.pain}</div><div className="cp-sl">Pain</div><div className="cp-sd"style={{color:dc(painDelta)}}>{da(painDelta)}</div></div>}
        <div className={`cp-score-chip ${week8Results.phq2>=3?"warn":"good"}`}><div className="cp-sv">{week8Results.phq2}/6</div><div className="cp-sl">PHQ-2</div><div className="cp-sd">{week8Results.phq2>=3?"Positive":"Negative"}</div></div>
        {week8Results.nps!==undefined&&<div className={`cp-score-chip ${week8Results.nps>=9?"good":""}`}><div className="cp-sv">{week8Results.nps}</div><div className="cp-sl">NPS</div><div className="cp-sd">Program satisfaction</div></div>}
      </div>
      {iciqDelta>=3&&<div style={{marginTop:12,background:"#D1FAE5",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#065F46",fontWeight:600}}>Your ICIQ improvement of {iciqDelta} points is clinically significant!</div>}
    </div></div>};
  // Adherence heatmap
  const AdherenceWidget=()=><div className="cp-card"style={{marginBottom:16}}>
    <div className="cp-card-title">Daily Exercise Tracking</div>
    {!todayLogged?<div style={{marginBottom:16}}>
      <div style={{fontSize:14,fontWeight:600,color:"#111827",marginBottom:10}}>Did you complete your exercises today?</div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        {[["Yes","yes",C.gn],["Partially","partial",C.or],["No","no",C.g400]].map(([l,v,c])=><button key={v}className="btn bsm"style={{background:adhStatus===v?c:"white",color:adhStatus===v?"white":"#374151",border:`1.5px solid ${adhStatus===v?c:C.g200}`,flex:1}}onClick={()=>setAdhStatus(v)}>{l}</button>)}
      </div>
      {(adhStatus==="partial"||adhStatus==="no")&&<div style={{marginBottom:8}}><input className="inp"value={adhNote}onChange={e=>setAdhNote(e.target.value)}placeholder={adhStatus==="partial"?"What happened? (e.g., only did breathing)":"Why not? (optional)"}/></div>}
      {adhStatus&&<button className="btn bpk bsm"onClick={logAdherence}>Log Today</button>}
    </div>:<div style={{padding:"10px 14px",background:"#D1FAE5",borderRadius:8,marginBottom:16,fontSize:13,color:"#065F46",fontWeight:600}}>Logged for today</div>}
    {/* 30-day heatmap */}
    <div style={{marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:600,color:"#6B7280",marginBottom:6}}>Last 30 Days</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:3}}>
        {adherenceLog.slice(-30).map((e,i)=><div key={i}title={`${e.date}: ${e.status}${e.note?" — "+e.note:""}`}style={{width:"100%",paddingTop:"100%",borderRadius:3,background:e.status==="yes"?C.gn:e.status==="partial"?C.or:C.g300,position:"relative"}}><span style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:7,color:"white",fontWeight:700}}>{new Date(e.date).getDate()}</span></div>)}
      </div>
      <div style={{display:"flex",gap:12,marginTop:6,fontSize:10,color:"#9CA3AF"}}>
        <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:C.gn,marginRight:3}}/>Yes</span>
        <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:C.or,marginRight:3}}/>Partial</span>
        <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:C.g300,marginRight:3}}/>No</span>
      </div>
    </div>
    {/* Streak + stats */}
    <div style={{display:"flex",gap:12}}>
      {streak>0&&<div style={{flex:1,background:"#FEF3C7",borderRadius:8,padding:"10px 14px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:700,color:"#D97706"}}>{streak}</div>
        <div style={{fontSize:11,color:"#92400E"}}>Day streak</div>
      </div>}
      <div style={{flex:1,background:"#EDE9FE",borderRadius:8,padding:"10px 14px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:700,color:"#6D28D9"}}>{adherenceLog.length?Math.round(adherenceLog.filter(e=>e.status==="yes").length/adherenceLog.length*100):0}%</div>
        <div style={{fontSize:11,color:"#4C1D95"}}>Adherence</div>
      </div>
      <div style={{flex:1,background:monthDays>=16?"#D1FAE5":"#F3F4F6",borderRadius:8,padding:"10px 14px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:700,color:monthDays>=16?"#059669":"#6B7280"}}>{monthDays}</div>
        <div style={{fontSize:11,color:monthDays>=16?"#065F46":"#6B7280"}}>Days this month</div>
      </div>
    </div>
  </div>;

  return<div className="fi">
    <style>{cpCSS}</style>
    <div className="cp-shell" ref={cpRef}>
      {/* Polished Header */}
      <div className="cp-hdr">
        <div className="cp-logo"><img src="Expect_Logo_WhiteTM.png" alt="EXPECT" style={{height:28,marginBottom:4}}/></div>
        <div className="cp-sub">{plan.prenatal?"Prenatal Pelvic Floor Protocol":"AI-Augmented Pelvic Floor Physical Therapy"}</div>
        <div className="cp-name">{fullName}</div>
        <div className="cp-meta">DOB: {ans.dob||"—"} · Assessment Date: {dateStr} · Plan Approved: {dateStr}</div>
        <div><span className="cp-badge">{iciq.severity} Severity</span><span className="cp-badge">{iciq.subtype}</span><span className="cp-badge">{tierWks}-Week Program</span></div>
      </div>

      {/* Tabs */}
      <div className="cp-tabs">
        {tabs.map(([id,l])=><div key={id}className={`cp-tab ${tab===id?"on":""}`}onClick={()=>setTab(id)}>{l}</div>)}
      </div>

      {tab==="scores"&&<ScoresTab/>}
      {tab==="exercises"&&<ExTab/>}
      {tab==="adjuncts"&&<AdjTab/>}
      {tab==="strategies"&&<StrategiesTab/>}
      {tab==="report"&&<ReportTab/>}
      {tab==="week8results"&&<Week8Tab/>}

      {/* Collapsible Program Progress */}
      <div style={{margin:"20px 0",border:"1px solid #E5E7EB",borderRadius:12,overflow:"hidden"}}>
        <div onClick={()=>setShowProgress(p=>!p)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",cursor:"pointer",background:showProgress?"#F9FAFB":"#fff",transition:".2s"}}
          onMouseEnter={e=>{e.currentTarget.style.background="#F9FAFB"}} onMouseLeave={e=>{if(!showProgress)e.currentTarget.style.background="#fff"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
            <span style={{fontSize:14,fontWeight:600,color:"#111827"}}>Program Progress</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform:showProgress?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s"}}><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        {showProgress&&<div style={{padding:"0 20px 20px",borderTop:"1px solid #E5E7EB"}}>
          {/* Week 8 Check-In Banner */}
          {!week8Results&&<div className="checkin-banner" style={{background:"linear-gradient(135deg,#4C1D95,#DB2777)",borderRadius:12,padding:"16px 20px",marginTop:16,marginBottom:16,color:"white",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:700,fontSize:15}}>Your Week 8 Check-In is ready!</div><div style={{fontSize:12,opacity:.8,marginTop:2}}>Takes about 4-5 minutes. Help us measure your progress.</div></div>
            <button className="btn"style={{background:"white",color:"#4C1D95",fontWeight:700}}onClick={()=>setShowCheckin(true)}>Start Check-In</button>
          </div>}
          {/* Daily Adherence Widget */}
          <div style={{marginTop:week8Results?16:0}}><AdherenceWidget/></div>
        </div>}
      </div>

      {/* MyChart / EHR Export */}
      <div style={{textAlign:"center",margin:"20px 0"}}>
        <button className="cp-export-btn" onClick={()=>{if(tab!=="report"){if(window.confirm("Switch to the Full Report tab for a complete export?")){setTab("report");setTimeout(()=>setShowExport(true),100)}return}setShowExport(true)}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export for MyChart / EHR
        </button>
      </div>

      {/* Export Modal */}
      {showExport&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setShowExport(false)}>
        <div style={{background:"#fff",borderRadius:16,padding:"28px 32px",maxWidth:440,width:"90%",boxShadow:"0 20px 60px rgba(0,0,0,.2)",position:"relative"}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>setShowExport(false)} style={{position:"absolute",top:12,right:14,background:"none",border:"none",color:C.g400,cursor:"pointer"}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          <div style={{fontSize:18,fontWeight:700,color:C.purp,marginBottom:4}}>Share with your Doctor</div>
          <div style={{fontSize:13,color:C.g600,lineHeight:1.6,marginBottom:16}}>You can upload your Expect Care Plan directly to your Intermountain MyChart or other patient portals.</div>
          <div style={{background:C.g50,borderRadius:10,padding:"14px 16px",marginBottom:18}}>
            <div style={{fontSize:12,fontWeight:600,color:C.g700,marginBottom:8}}>How to share:</div>
            <ol style={{margin:0,paddingLeft:18,fontSize:12,color:C.g600,lineHeight:1.8}}>
              <li>Click "Print / Save as PDF" below and choose "Save as PDF" from the print dialog.</li>
              <li>Log in to your health system's app (e.g., MyChart).</li>
              <li>Go to <b>Messages</b> or <b>Document Sharing</b> and attach this file for your provider.</li>
            </ol>
          </div>
          <button onClick={()=>{
            const el=cpRef.current;if(!el){setShowExport(false);return}
            const w=window.open("","_blank","width=820,height=1100");
            if(!w){alert("Please allow popups for this site to export your care plan.");return}
            const styles=document.querySelectorAll("style");
            let css="";styles.forEach(s=>{css+=s.innerHTML});
            w.document.write("<!DOCTYPE html><html><head><title>Expect Care Plan — "+fullName+"</title>");
            w.document.write("<base href=\""+window.location.origin+"/\">");
            w.document.write("<style>"+css+"</style>");
            w.document.write("<style>body{margin:20px;font-family:'DM Sans',sans-serif}@media print{body{margin:0}.cp-sample{display:none}button{display:none !important}.cp-tabs,.adh-widget,.checkin-banner{display:none !important}}</style>");
            w.document.write("</head><body>");
            w.document.write(el.innerHTML);
            w.document.write("</body></html>");
            w.document.close();
            const doPrint=()=>w.print();
            if(w.document.fonts&&w.document.fonts.ready){w.document.fonts.ready.then(doPrint).catch(doPrint)}else{setTimeout(doPrint,1500)}
            L("CARE_PLAN_DOWNLOADED",{patient:fullName,context:"PATIENT_DIRECTED_EHR_SHARING"});
            setShowExport(false);setExportDone(true);
          }} style={{width:"100%",padding:"12px 0",background:`linear-gradient(135deg,${C.purp},${C.pink})`,color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Print / Save as PDF
          </button>
          <div style={{fontSize:10,color:C.g400,textAlign:"center",marginTop:10}}>Your data stays on your device. Expect does not transmit PHI through this download.</div>
        </div>
      </div>}

      {exportDone&&<div style={{textAlign:"center",marginBottom:16}}><div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"8px 16px",borderRadius:8,background:"rgba(34,197,94,0.06)",color:C.gn,fontSize:12,fontWeight:600}}>✓ Care plan downloaded · Logged to audit stream<button onClick={()=>setExportDone(false)} style={{background:"none",border:"none",color:C.gn,cursor:"pointer",padding:0,lineHeight:1}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div></div>}

      <div className="cp-footer">
        <p>This care plan was generated by Expect's AI-augmented platform and reviewed by a licensed Physical Therapist.</p>
        <p>Expect is a participant in the <a href="#">Utah Office of AI Policy Regulatory Sandbox</a>.</p>
        <p style={{marginTop:4,fontSize:10}}>© 2026 Expect Health. All rights reserved. <a href="#">Privacy Policy</a> · <a href="#">Terms of Service</a></p>
      </div>
    </div>
  </div>;
}
// PT VIEW

// Helper: render a patient's answer for PT review
function AnsRow({label,value,score,flag}){
  if(value===undefined||value===null||value==="")return null;
  const display=typeof value==="object"?value.join(", "):String(value);
  return<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"6px 0",borderBottom:`1px solid ${C.g100}`,fontSize:12}}>
    <div style={{color:C.g600,flex:3,lineHeight:1.4}}>{label}</div>
    <div style={{flex:2,fontWeight:600,color:flag?C.rd:C.g800,textAlign:"right"}}>{display}{flag&&" !"}</div>
    {score!==undefined&&<div style={{width:50,textAlign:"right",color:C.blue,fontWeight:600,fontSize:11}}>+{score}</div>}
  </div>;
}

// Collapsible section
function Section({title,tag,defaultOpen,children}){
  const[open,setOpen]=useState(defaultOpen||false);
  return<div className="card"style={{padding:0,overflow:"hidden",marginBottom:10}}>
    <div onClick={()=>setOpen(!open)}style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 18px",cursor:"pointer",background:open?C.g50:"white"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:13,fontWeight:600,color:C.purp}}>{title}</span>{tag&&<span className="bdg"style={{background:`${C.blue}12`,color:C.blue}}>{tag}</span>}</div>
      <span style={{color:C.g400,fontSize:18,transition:"transform .2s",transform:open?"rotate(180deg)":"rotate(0)"}}>{open?"▾":"▸"}</span>
    </div>
    {open&&<div style={{padding:"8px 18px 14px",borderTop:`1px solid ${C.g100}`}}>{children}</div>}
  </div>;
}

// Build answer lookup helpers
function getOptLabel(qs,id,val){const q=qs.find(q=>q.id===id);if(!q)return val;if(q.type==="yn")return val==="yes"?"Yes":"No";if(q.type==="scale")return val+"/"+q.max;if(q.type==="multi"&&Array.isArray(val)){return val.map(v=>{const o=q.opts?.find(([l,ov])=>ov===v);return o?o[0]:v}).join(", ")}if(q.opts){const o=q.opts.find(([l,ov])=>ov===val);return o?o[0]:val}return val}
function getOptScore(qs,id,val){const q=qs.find(q=>q.id===id);if(!q)return undefined;if(q.type==="yn")return val==="yes"?1:0;if(q.type==="scale")return val;if(q.type==="multi"&&Array.isArray(val))return val.length;if(q.opts){const o=q.opts.find(([l,ov])=>ov===val);return typeof o?.[1]==="number"?o[1]:undefined}return undefined}

function PTReview(){
  useFlagSync();
  const[sel,setSel]=useState(null);const[viewNew,setViewNew]=useState(false);
  if(viewNew&&sharedIntake)return<PTNewIntakeReview data={sharedIntake}onBack={()=>setViewNew(false)}/>;
  if(sel)return<PTPatientDetail pt={sel}onBack={()=>setSel(null)}/>;
  const pend=DPTS.filter(p=>p.ps==="pending_review").length+(sharedIntake?1:0);
  return<div className="fi"><div className="h1">Patient Caseload</div><div className="sub">{pend} pending review · {DPTS.length+(sharedIntake?1:0)} total</div>
    {sharedIntake&&<div className="card fi"style={{borderColor:C.pink,cursor:"pointer"}}onClick={()=>setViewNew(true)}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontWeight:700,fontSize:15,color:C.pink}}> New Intake — {sharedIntake.name}</div>
        <div style={{fontSize:12,color:C.g500,marginTop:2}}>Completed just now · AI plan generated · Awaiting your review</div>
        {sharedIntake.plan?.review_flags?.length>0&&<div style={{display:"flex",gap:3,marginTop:4,flexWrap:"wrap"}}>{sharedIntake.plan.review_flags.map(f=><span key={f.id}className="bdg"style={{background:f.type==="always"?`${C.rd}15`:`${C.or}15`,color:f.type==="always"?C.rd:C.or,fontSize:9}}>{f.label}</span>)}</div>}</div>
        <span className="bdg pu"style={{background:`${C.or}15`,color:C.or}}>⏳ Review Now</span>
      </div></div>}
    <div className="card"style={{padding:0,overflow:"hidden"}}>
      <div className="plr plh"><span>Patient</span><span>ICIQ</span><span>Pain</span><span>Adherence</span><span>Status</span><span>Next RA</span></div>
      {DPTS.map(p=>{const li=p.iciq[p.iciq.length-1].s,lp=p.pain[p.pain.length-1].s;const w8=p.week8;const intk=p.intake;const iciqProg=w8&&intk?intk.iciq-w8.iciq:null;return<div className="plr"key={p.id}onClick={()=>setSel(p)}>
        <div><div style={{fontWeight:600}}>{p.nm}</div><div style={{fontSize:10,color:C.g400}}>Age {p.age} · {p.ref}</div>
          <div style={{display:"flex",gap:3,marginTop:3,flexWrap:"wrap"}}>
            {w8&&w8.submitted&&<span className="bdg"style={{background:`${C.gn}15`,color:C.gn,fontSize:9}}>Week 8 Complete</span>}
            {p.adh>=80&&<span className="bdg"style={{background:`${C.gn}15`,color:C.gn,fontSize:9}}>98977 Met</span>}
            {iciqProg!==null&&iciqProg<1&&<span className="bdg"style={{background:`${C.rd}15`,color:C.rd,fontSize:9}}>No ICIQ Progress</span>}
            {p.review_flags?.map(f=><span key={f.id}className="bdg"style={{background:f.type==="always"?`${C.rd}15`:`${C.or}15`,color:f.type==="always"?C.rd:C.or,fontSize:9}}>{f.label}</span>)}
          </div>
        </div>
        <Bdg sev={li<=5?"Slight":li<=12?"Moderate":li<=18?"Severe":"Very Severe"}sc={li}/>
        <Bdg sev={lp<=3?"Mild":lp<=6?"Moderate":"Severe"}sc={lp}/>
        <div><div className="pb"style={{width:60}}><div className="pf"style={{width:`${p.adh}%`,background:p.adh>=80?C.gn:C.or}}/></div><div style={{fontSize:10,color:C.g400,marginTop:2}}>{p.adh}%</div></div>
        <div><span style={{width:7,height:7,borderRadius:"50%",display:"inline-block",marginRight:5,background:p.ps==="approved"?C.gn:C.or}}/>{p.ps==="pending_review"?"Review":"Active"}</div>
        <div style={{fontSize:11,color:C.g400}}>{p.nra}</div>
      </div>})}
    </div></div>;
}

function PTNewIntakeReview({data,onBack}){
  const{ans,iciq,pain,gupi,fluts,fsex,popdi:_popdi,plan:initPlan}=data;const popdi=_popdi||sPOPDI(ans);
  // Editable state for iterative review
  const[plan,setPlan]=useState(JSON.parse(JSON.stringify(initPlan)));
  const[editGoals,setEditGoals]=useState(initPlan.goals.join("\n"));
  const[editPrec,setEditPrec]=useState(initPlan.prec.join("\n"));
  const[editProg,setEditProg]=useState(initPlan.prog.join("\n"));
  const[editAdj,setEditAdj]=useState(initPlan.adjuncts||[]);
  const[newAdj,setNewAdj]=useState({type:"device",n:"",d:"",rx:""});
  const[editExs,setEditExs]=useState(initPlan.ex.map(e=>({...e})));
  const[editNote,setEditNote]=useState("");
  const[noteGenerated,setNoteGenerated]=useState(false);
  const[tRun,setTRun]=useState(false);const[tSec,setTSec]=useState(0);const[notes,setNotes]=useState("");
  const[faxSt,setFaxSt]=useState(null);const[patSent,setPatSent]=useState(false);
  const[approved,setApproved]=useState(false);const[showGuardrails,setShowGuardrails]=useState(false);
  const[psiRefer,setPsiRefer]=useState(false);const[followUpSent,setFollowUpSent]=useState(null);
  const tmRef=useRef();
  useEffect(()=>{if(tRun)tmRef.current=setInterval(()=>setTSec(s=>s+1),1000);else clearInterval(tmRef.current);return()=>clearInterval(tmRef.current)},[tRun]);
  const rc={green:C.gn,yellow:C.or,red:C.rd}[plan.risk];
  const nm=(ans.name_first||"")+" "+(ans.name_last||"");

  // Build encounter note text
  const buildNote=()=>{
    // Clinical Alerts
    const alerts=[];
    if((ans.med_modify??0)===1)alerts.push("ALERT: Patient reports modifying prescribed medication due to urinary symptoms. Verify with prescribing provider.");
    if(ans._safety_answer_changed)alerts.push("ALERT: Patient initially reported safety flag but changed answer during intake. Verify safety screen was appropriately addressed.");
    const phq2EN=calcPHQ2(ans);if(phq2EN>=3)alerts.push(`ALERT: PHQ-2 positive screen for depression (score: ${phq2EN}/6). Full PHQ-9 recommended. Assess capacity to consent.`);
    if(phq2EN>=2)alerts.push(`PHQ-2 SCORE: ${phq2EN}/6 (${phq2EN>=5?"HIGH":phq2EN>=3?"MODERATE":"SUB-THRESHOLD"}). Patient received PSI mental health support resources at intake. Recommend referring physician follow up with patient within 3–5 days regarding mental health screening and support resources provided.`);
    if(psiRefer)alerts.push("REFERRAL: Patient referred to PSI Utah (Postpartum Support International) for maternal mental health support. PSI HelpLine: (800) 944-4773, psiutah.org.");
    const alertBlock=alerts.length>0?`\n*** CLINICAL ALERTS ***\n${alerts.map(a=>`>>> ${a}`).join("\n")}\n${"*".repeat(40)}\n\n`:"";
    const dx=plan.dx.map(d=>`${d.c} — ${d.d}`).join("; ");
    const exList=editExs.map(e=>`${e.n}: ${e.s}x${e.r}, hold ${e.h}, ${e.f}`).join("\n");
    const adjList=(editAdj||[]).map(a=>`[${a.type.toUpperCase()}] ${a.n}: ${a.rx}`).join("\n");
    const avoidArr=ans.avoid_activities||[];const avoidCt=avoidArr.filter(x=>x!=="none").length;
    const tier=iciq.total>=13?"Beginner (12wk)":iciq.total>=6?"Moderate (8wk)":"Advanced (6wk)";
    const cueLbl={biologic:"Body function",imaginative:"Imaginative",breathing:"Breath-based",simple_contract:"Simple contraction",default:"Default"}[ans.cue_preference]||"Default";
    const pelvHx=(ans.pelvic_history||[]).filter(x=>x!=="none");
    const screenLine=`Screening: Urinary=${ans.screen_urinary||"—"}, Bowel=${ans.screen_bowel||"—"}, Pain=${ans.screen_pain||"—"}, Sexual=${ans.screen_sexual||"—"}.${ans.screen_pain==="no"?" Pain section: SCREENED OUT.":""}${ans.screen_sexual==="no"?" Sexual section: SCREENED OUT.":""}`;
    return `${alertBlock}PHYSICAL THERAPY ENCOUNTER NOTE\nPatient: ${nm} | DOB: ${ans.dob||"—"}${ans.email?` | Email: ${ans.email}`:""}${ans.phone?` | Phone: ${ans.phone}`:""}\nDOS: ${new Date().toISOString().split("T")[0]} | POS: 10 (Telehealth) | Mod: GQ\n\nSUBJECTIVE:\nInitial evaluation. ICIQ-UI SF: ${iciq.total} (${iciq.severity}, ${iciq.subtype}). Tier: ${tier}. FLUTS: F${fluts.F}/V${fluts.V}. GUPI: ${gupi.total} (${gupi.severity}). Pain: ${pain.composite}/10 (${pain.severity}). FLUTSsex: ${fsex.total}.\n${popdi.positiveCount>0?`POPDI-6: ${popdi.positiveCount}/6 positive (score: ${popdi.score}/100).${popdi.bulge?" BULGE/PROTRUSION SYMPTOMS REPORTED.":""}${popdi.highBother?" High bother noted.":""}\n`:"POPDI-6: 0/6 — no prolapse symptoms.\n"}${screenLine}\n${pelvHx.length>0?`Pelvic Hx: ${pelvHx.map(x=>x.replace(/_/g," ")).join(", ")}.\n`:""}${ans.patient_goal?`Patient goal: "${ans.patient_goal}"\n`:""}${ans.catchall_pelvic?`Additional concerns: "${ans.catchall_pelvic}"\n`:""}${ans.prior_treatment?`Prior treatment: ${Array.isArray(ans.prior_treatment)?ans.prior_treatment.join(", "):ans.prior_treatment}\n`:""}${ans.medications?`Medications: ${ans.medications}\n`:""}${avoidCt>0?`Activity avoidance: ${avoidArr.filter(x=>x!=="none").join(", ")} (${avoidCt} categories${avoidCt>=3?" — HIGH IMPACT":""})\n`:""}${(ans.med_modify??0)===1?`⚠ MEDICATION MODIFICATION: Patient reports changing prescribed medication due to urinary symptoms. Refer to prescribing provider.\n`:""}${ans._safety_answer_changed?`⚠ SAFETY ANSWER CHANGED: Patient initially indicated a safety flag but subsequently changed answer(s): ${(ans._safety_changes||[]).map(c=>c.id).join(", ")}.\n`:""}Cue preference: ${cueLbl}.\n\nOBJECTIVE:\nValidated instruments administered via AI-augmented telehealth. Red flags: ${REDFLAGS.some(r=>ans[r.id]==="yes")?"POSITIVE — see safety screening":"all negative"}${ans._safety_answer_changed?" (note: patient changed safety answer — flagged)":""}.\nStatus: ${ans.pregnancy_status?.replace(/_/g," ")||"N/A"}${ans.delivery_date?`. Delivery: ${ans.delivery_date} (${Math.round((Date.now()-new Date(ans.delivery_date).getTime())/(7*24*60*60*1000))}wk postpartum)`:""}.${ans.delivery_type?` Delivery type: ${ans.delivery_type.replace(/_/g," ")}.`:""} Constipation: ${(ans.bowel_constipation??0)>=2||(ans.bowel_frequency??3)<=1||(ans.bristol_stool??4)<=2?"Yes (straining: "+ans.bowel_constipation+"/4, frequency: "+(["<1x/wk","1-4x/wk","5-7x/wk","1-2x/day","3+/day"][ans.bowel_frequency??3])+", Bristol: "+(ans.bristol_stool??"-")+")":"No"}.${plan.prenatal?`\n** PRENATAL PELVIC FLOOR PROTOCOL: Patient is currently pregnant. Exercise modifications for supine positioning have been automatically applied. Review for trimester appropriateness.`:""}\n\nASSESSMENT:\n${dx}\n\nPLAN:\nExercises:\n${exList}\n\nAdjuncts/Devices:\n${adjList||"None"}\n\nGoals:\n${editGoals}\n\nPrecautions:\n${editPrec}\n\nProgression:\n${editProg}\n\nFrequency: ${plan.freq}. Duration: ${plan.dur}.\n\nCPT: ${plan.cpt.map(c=>`${c.c} — ${c.d} (${c.u}u)`).join(", ")}\nReview time: ${Math.floor(tSec/60)}m ${tSec%60}s${notes?`\n\nPT CLINICAL NOTES:\n${notes}`:""}\n\nATTESTATION:\nI have reviewed the AI-generated assessment, the patient's individual responses, and the treatment plan. ${notes?"Modifications noted. ":""}This reflects my independent clinical judgment.\n\nSigned: [PT Name, DPT] — ${new Date().toISOString()}`;
  };
  const genNote=()=>{setEditNote(buildNote());setNoteGenerated(true)};

  // Guardrail checks
  const guardrails=[];
  if(tSec<120)guardrails.push({lvl:"warn",msg:`Review time is ${tSec}s — CMS may question reviews under 2 minutes. Continue reviewing before approving.`});
  if(REDFLAGS.some(r=>ans[r.id]==="yes"))guardrails.push({lvl:"alert",msg:"! Patient had positive red flag(s) in safety screening. Verify these were addressed."});
  if(ans._safety_answer_changed)guardrails.push({lvl:"alert",msg:`! SAFETY ANSWER CHANGED: Patient initially indicated a safety concern but later changed their answer. Questions changed: ${(ans._safety_changes||[]).map(c=>c.id).join(", ")}. Verify this was appropriate.`});
  if(EXCLUSIONS.some(r=>ans[r.id]==="yes"))guardrails.push({lvl:"alert",msg:"! Patient screened positive for EXCLUSIONARY condition (Section 3.7 Safe Harbor). This patient may not be eligible for AI-generated plans. Review carefully."});
  const phq2=calcPHQ2(ans);if(phq2>=3)guardrails.push({lvl:"warn",msg:"PHQ-2 score "+phq2+"/6 — positive screen for depression. Verify capacity to consent and consider mental health resource referral."});
  if(phq2>=2&&!psiRefer)guardrails.push({lvl:"info",msg:"PHQ-2 score "+phq2+"/6 — patient received support resources. Consider checking the PSI Utah referral box if appropriate."});
  if((ans.symptoms_trigger||[]).includes("sitting_long")&&pain.composite>6)guardrails.push({lvl:"alert",msg:"⚠ POTENTIAL PUDENDAL NEURALGIA: Patient reports pain while sitting for long periods with composite pain >6/10. Evaluate for pudendal nerve involvement."});
  if(iciq.severity==="Very Severe"&&editExs.length<4)guardrails.push({lvl:"warn",msg:"Very Severe ICIQ score but fewer than 4 exercises — consider whether prescription is sufficient."});
  if(notes.trim().length===0&&(editExs.length!==initPlan.ex.length||editExs.some((e,i)=>JSON.stringify(e)!==JSON.stringify(initPlan.ex[i]))))guardrails.push({lvl:"warn",msg:"You modified exercises but haven't added clinical rationale in the notes. CMS and OAIP require documented reasoning."});
  if(plan.prenatal)guardrails.push({lvl:"info",msg:"PRENATAL PROTOCOL: Supine exercises auto-modified to incline/side-lying. Verify modifications are appropriate for patient's current trimester."});
  if(sharedIntake?.plan?.review_flags?.some(f=>f.id==="PROLAPSE_REVIEW"))guardrails.push({lvl:"alert",msg:"PROLAPSE SUSPECTED: Patient reported bulge/protrusion or significant bother on POPDI-6. Pelvic exam recommended for staging. Consider pessary evaluation or urogynecology referral."});
  if(!noteGenerated)guardrails.push({lvl:"info",msg:"Generate and review the encounter note before approving."});

  const tryApprove=()=>{if(guardrails.some(g=>g.lvl==="alert"||g.lvl==="warn"))setShowGuardrails(true);else doFinalApprove()};
  const doFinalApprove=()=>{setTRun(false);setApproved(true);setShowGuardrails(false);
    const approvedPlan={...plan,status:"approved",review_flags:sharedIntake?.plan?.review_flags||plan.review_flags||[],goals:editGoals.split("\n").filter(Boolean),prec:editPrec.split("\n").filter(Boolean),prog:editProg.split("\n").filter(Boolean),ex:editExs,adjuncts:editAdj};
    setPlan(approvedPlan);
    if(sharedIntake)sharedIntake.plan=approvedPlan;
    if(sharedIntake&&!sharedIntake.outcomeRecordId){const orec=buildOutcomeRecord(sharedIntake,approvedPlan,tSec);const ptDiffs=computePtDiffs(initPlan,editExs,editAdj,editGoals);orec.treatment.pt_diffs=ptDiffs;orec.treatment.pt_modified_exercises=ptDiffs.exercises.length>0;orec.treatment.pt_modified_adjuncts=ptDiffs.adjuncts.length>0;orec.treatment.pt_modified_goals=ptDiffs.goals.length>0;if(ptDiffs.exercises.length||ptDiffs.adjuncts.length||ptDiffs.goals.length)L("PT_PLAN_MODIFIED",{recordId:orec.id,exerciseChanges:ptDiffs.exercises.length,adjunctChanges:ptDiffs.adjuncts.length,goalChanges:ptDiffs.goals.length});sharedIntake.outcomeRecordId=orec.id;db("insertOutcomeRecord",{recordId:orec.id,baseline:orec.baseline,treatment:orec.treatment,createdAt:orec.created})}
    L("plan_reviewed",{patient:nm,action:"approved",time:tSec});L("encounter_note",{patient:nm,cpt:plan.cpt.map(c=>c.c),time:tSec});L("RTM_setup_complete",{patient:nm,code:"98975",note:"RTM episode initiated — 98975 billable."});
    if(psiRefer)L("psi_referral_approved",{patient:nm,phq2Score:(ans.phq2_interest||0)+(ans.phq2_mood||0)});
    if(sharedIntake){sharedIntake.psiRefer=psiRefer;const uid=sharedIntake.userId;if(uid)db("updatePatientPlan",{userId:uid,plan:approvedPlan,status:"approved",outcomeRecordId:sharedIntake.outcomeRecordId,psiRefer:psiRefer||false})}};

  const removeEx=(i)=>setEditExs(e=>e.filter((_,j)=>j!==i));
  const updateEx=(i,field,val)=>setEditExs(e=>e.map((ex,j)=>j===i?{...ex,[field]:val}:ex));
  const addEx=()=>setEditExs(e=>[...e,{n:"New Exercise",s:2,r:8,h:"5s",f:"daily",d:"Description"}]);
  const removeAdj=(i)=>setEditAdj(a=>a.filter((_,j)=>j!==i));
  const addAdj=()=>{if(newAdj.n.trim()){const match=matchExpansion(newAdj.n);if(match&&!newAdj.d){setEditAdj(a=>[...a,{type:match.type||newAdj.type,n:match.n,d:match.d,rx:match.rx,patientText:match.patientText,badge:match.badge}]);setNewAdj({type:"device",n:"",d:"",rx:""});L("expansion_match",{input:newAdj.n,matched:match.n,matchType:match.matchType})}else{setEditAdj(a=>[...a,{...newAdj}]);setNewAdj({type:"device",n:"",d:"",rx:""})}}};

  return<div className="fi">
    <button className="btn bo bsm"onClick={onBack}style={{marginBottom:16}}>← Back to Patients</button>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div><div className="h1">Intake Review — {nm}</div><div className="sub">DOB: {ans.dob||"—"} · {ans.pregnancy_status?.replace(/_/g," ")||"—"} · Ref: {ans.referral_source||"—"} · Insurance: {ans.insurance_type||"—"}{ans.email?` · Email: ${ans.email}`:""}{ans.phone?` · Phone: ${ans.phone}`:""}{ans.patient_goal?` · Goal: "${ans.patient_goal}"`:""}{ans.physician_npi_id?` · NPI: ${ans.physician_npi_id}`:""}</div></div>
      <AW/>
    </div>
    {!approved&&<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"8px 16px",background:C.purp,borderRadius:10,color:C.white}}>
      <span style={{fontSize:22,fontWeight:700,fontFamily:"monospace"}}>{String(Math.floor(tSec/60)).padStart(2,"0")}:{String(tSec%60).padStart(2,"0")}</span>
      <button style={{background:tRun?"#EF4444":"#22C55E",color:C.white,border:"none",borderRadius:6,padding:"4px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}} onClick={()=>setTRun(!tRun)}>{tRun?"⏸ Pause":"▶ Start Timer"}</button>
      <span style={{fontSize:11,opacity:0.7}}>CMS review time documentation</span>
    </div>}

    {/* Clinical Alerts Banner */}
    {(()=>{const alerts=[];
      if(plan.prenatal)alerts.push({sev:"info",msg:`PRENATAL PELVIC FLOOR PROTOCOL: ${plan.ptNote||"Patient is currently pregnant. Exercise modifications for supine positioning have been automatically applied. Please review for trimester appropriateness."}`});
      if((ans.med_modify??0)===1)alerts.push({sev:"warn",msg:"⚠ MEDICATION MODIFICATION: Patient reports changing prescribed medication."});
      if(ans._safety_answer_changed)alerts.push({sev:"alert",msg:`⚠ SAFETY ANSWER CHANGED: Patient changed safety answer(s) during intake.`});
      const phq2A=(ans.phq2_interest||0)+(ans.phq2_mood||0);if(phq2A>=3)alerts.push({sev:phq2A>=5?"alert":"warn",msg:`🚨 PHQ-2 Positive (${phq2A}/6) — depression risk. Full PHQ-9 recommended.`});
      if(popdi.positiveCount>0&&(popdi.bulge||popdi.highBother))alerts.push({sev:"alert",msg:`POPDI-6: ${popdi.bulge?"Bulge/protrusion symptoms reported":"High bother noted"} (${popdi.positiveCount}/6 positive, score ${popdi.score}/100). Pelvic exam recommended for prolapse staging.`});
      else if(popdi.positiveCount>0)alerts.push({sev:"info",msg:`POPDI-6: ${popdi.positiveCount}/6 positive (score ${popdi.score}/100). Mild prolapse symptoms — conservative management appropriate.`});
      if(alerts.length===0)return null;
      return<div style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:C.rd,marginBottom:6}}>CLINICAL ALERTS — Review before approving</div>
        {alerts.map((a,i)=><div key={i}style={{padding:"8px 14px",borderRadius:8,marginBottom:4,fontSize:12,fontWeight:600,background:a.sev==="alert"?"#FEE2E2":a.sev==="info"?"#ECFDF5":"#FEF3C7",color:a.sev==="alert"?"#991B1B":a.sev==="info"?"#065F46":"#92400E",borderLeft:`3px solid ${a.sev==="alert"?"#DC2626":a.sev==="info"?"#10B981":"#D97706"}`}}>{a.msg}</div>)}
      </div>;
    })()}

    {/* SCORE SUMMARY */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
      <div className="sc"><div className="scl2">ICIQ-UI SF</div><div className="scv2"style={{color:C.pink}}>{iciq.total}</div><Bdg sev={iciq.severity}/><div className="scs">{iciq.subtype} · 0–21</div></div>
      <div className="sc"><div className="scl2">FLUTS</div><div className="scv2"style={{color:C.purp}}>{fluts.total}</div><div className="scs">F:{fluts.F}/12 V:{fluts.V}/12</div></div>
      <div className="sc"><div className="scl2">POPDI-6</div><div className="scv2"style={{color:popdi.positiveCount>0?C.or:C.gn}}>{popdi.positiveCount}/6</div><div className="scs">{popdi.positiveCount>0?(popdi.bulge?"Bulge":"Positive"):"Negative"}</div></div>
      <div className="sc"><div className="scl2">FLUTSsex</div><div className="scv2"style={{color:C.purpL}}>{fsex.total}</div><div className="scs">Sexual symptom score</div></div>
      <div className="sc"><div className="scl2">GUPI-F</div><div className="scv2"style={{color:C.blue}}>{gupi.total}</div><Bdg sev={gupi.severity}/><div className="scs">P:{gupi.pain}/23 U:{gupi.urinary}/10 Q:{gupi.qol}/12</div></div>
      <div className="sc"><div className="scl2">Pain</div><div className="scv2"style={{color:C.or}}>{pain.composite}</div><Bdg sev={pain.severity}/><div className="scs">Fn: {["None","Mild","Mod","Sev","Cannot"][pain.functional]}</div></div>
    </div>

    {/* ROUTING DESTINATION */}
    <div className="card"style={{marginBottom:14,borderColor:C.blue}}>
      <div className="chd">Routing Destination</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontWeight:600,fontSize:14,color:C.g800}}>{ans.physician_name||"[No provider selected]"}</div>
          {ans.prenatal_flag&&<div style={{fontSize:11,color:"#065F46",marginTop:2,fontWeight:600}}>Prenatal Pelvic Floor Protocol — care plan flagged for prenatal review</div>}
          {ans.physician_npi_id&&<div style={{fontSize:12,color:C.g500,marginTop:2}}>NPI: {ans.physician_npi_id}</div>}
          {ans.physician_fax&&<div style={{fontSize:13,color:C.g700,marginTop:4}}>Fax: {(ans.physician_fax||"").replace(/(\d{3})(\d{3})(\d{4})/,"($1) $2-$3")} {ans.physician_fax_verified?<span style={{background:C.gn,color:"white",padding:"1px 8px",borderRadius:10,fontSize:10,fontWeight:700,marginLeft:6}}>VERIFIED</span>:<span style={{background:C.or,color:"white",padding:"1px 8px",borderRadius:10,fontSize:10,fontWeight:700,marginLeft:6}}>MANUAL ENTRY</span>}</div>}
          {ans.concierge_pending&&<div style={{fontSize:12,color:C.or,marginTop:4}}>⏳ Pending destination verification — {ans.concierge_pending.practice}, {ans.concierge_pending.city}</div>}
        </div>
        {!ans.concierge_pending&&ans.physician_fax&&ans.physician_fax_verified&&<div style={{fontSize:11,color:C.gn,fontWeight:600}}>✓ Auto-populated from NPI Registry</div>}
      </div>
    </div>

    {/* PATIENT RESPONSES — collapsible */}
    <div style={{marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:600,color:C.purp,marginBottom:8}}>Patient Responses <span style={{fontWeight:400,fontSize:12,color:C.g400}}>— expand to verify AI scoring</span></div>
      <Section title="Demographics & History" tag={ans.pregnancy_status?.replace(/_/g," ")||""}>
        <AnsRow label="Name" value={nm}/>
        <AnsRow label="Date of birth" value={ans.dob}/>
        <AnsRow label="Pregnancy status" value={ans.pregnancy_status?.replace(/_/g," ")}/>
        <AnsRow label="Delivery type" value={ans.delivery_type?.replace(/_/g," ")}/>
        {ans.delivery_date&&<AnsRow label="Delivery date" value={ans.delivery_date}/>}
        {ans.delivery_date&&<AnsRow label="Weeks postpartum" value={Math.round((Date.now()-new Date(ans.delivery_date).getTime())/(7*24*60*60*1000))}/>}
        <AnsRow label="Total deliveries" value={ans.num_deliveries}/>
        <AnsRow label="Prior treatments" value={Array.isArray(ans.prior_treatment)?ans.prior_treatment.join(", "):ans.prior_treatment}/>
        <AnsRow label="Medications" value={ans.medications}/>
        <AnsRow label="Medication modification" value={ans.med_modify===1?"⚠️ YES — patient modifying meds due to urinary symptoms":ans.med_modify===2?"Not sure":"No"}/>
        <AnsRow label="Pelvic history" value={(ans.pelvic_history||[]).filter(x=>x!=="none").map(x=>x.replace(/_/g," ")).join(", ")||"None"}/>
        {ans.catchall_pelvic&&<AnsRow label="Additional concerns" value={ans.catchall_pelvic}/>}
        <AnsRow label="Patient goal" value={ans.patient_goal}/>
        <AnsRow label="Bowel — straining" value={getOptLabel([{id:"x",opts:[["Never",0],["Rarely",1],["Sometimes",2],["Often",3],["Almost always",4]]}],"x",ans.bowel_constipation)}/>
        <AnsRow label="Bowel — frequency" value={getOptLabel([{id:"x",opts:[["<1x/wk",0],["1-4x/wk",1],["5-7x/wk",2],["1-2x/day",3],["3+/day",4]]}],"x",ans.bowel_frequency)}/>
        <AnsRow label="Bowel — Bristol stool type" value={ans.bristol_stool!==undefined?`Type ${ans.bristol_stool}${ans.bristol_stool<=2?" (constipation)":ans.bristol_stool<=5?" (normal range)":" (inflammation/diarrhea)"}`:undefined}/>
        <AnsRow label="Symptom triggers" value={Array.isArray(ans.symptom_triggers)?ans.symptom_triggers.join(", "):ans.symptom_triggers}/>
        <AnsRow label="Avoided activities" value={Array.isArray(ans.avoid_activities)?((ans.avoid_activities.filter(x=>x!=="none").length>=3?"⚠️ HIGH IMPACT — ":"")+ans.avoid_activities.join(", ")):"None"}/>
        <AnsRow label="Cue preference" value={ans.cue_preference==="biologic"?"Body function (stop urine flow)":ans.cue_preference==="imaginative"?"Imaginative (lift a blueberry)":ans.cue_preference==="breathing"?"Breath-based (exhale and lift)":"Default"}/>
      </Section>
      <Section title="Safety Screening" tag={REDFLAGS.some(r=>ans[r.id]==="yes")?"! FLAGS":ans._safety_answer_changed?"⚠ CHANGED":"✓ Clear"} defaultOpen={REDFLAGS.some(r=>ans[r.id]==="yes")||ans._safety_answer_changed}>
        {REDFLAGS.map(r=><AnsRow key={r.id} label={r.text} value={ans[r.id]==="yes"?"YES":"No"} flag={ans[r.id]==="yes"}/>)}
        {ans._safety_answer_changed&&<div style={{background:"#FEF3C7",border:"1px solid #D97706",borderRadius:8,padding:10,marginTop:8,fontSize:12,color:"#92400E"}}>
          <div style={{fontWeight:700}}>⚠ SAFETY ANSWER CHANGED</div>
          <div style={{marginTop:4}}>Patient initially answered "Yes" to safety question(s) but later changed to "No":</div>
          {(ans._safety_changes||[]).map((c,i)=><div key={i}style={{marginTop:2,fontSize:11}}>• {c.id} — changed at {new Date(c.ts).toLocaleTimeString()}</div>)}
          <div style={{marginTop:6,fontStyle:"italic",fontSize:11}}>This answer change has been flagged in the encounter note and OAIP compliance log.</div>
        </div>}
      </Section>
      <Section title="Eligibility Screening" tag={EXCLUSIONS.some(r=>ans[r.id]==="yes")?"⚠ EXCLUSION":"✓ Eligible"} defaultOpen={EXCLUSIONS.some(r=>ans[r.id]==="yes")}>
        {EXCLUSIONS.map(r=><AnsRow key={r.id} label={r.text.slice(0,90)+"..."} value={ans[r.id]==="yes"?"YES":"No"} flag={ans[r.id]==="yes"}/>)}
      </Section>
      {((ans.phq2_interest||0)+(ans.phq2_mood||0))>=3&&<div className="card" style={{background:"#FEE2E2",borderLeft:"4px solid #DC2626",marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#991B1B"}}>🚨 PHQ-2 Positive — Depression Risk ({(ans.phq2_interest||0)+(ans.phq2_mood||0)}/6){(ans.phq2_interest||0)+(ans.phq2_mood||0)>=5?" — HIGH SEVERITY":""}</div>
          <div style={{background:"#7C3AED",color:"white",padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700}}>OAIP REPORTABLE</div>
        </div>
        <div style={{fontSize:11,color:"#7F1D1D",marginTop:6,lineHeight:1.6}}>
          <div>• <strong>Little interest or pleasure:</strong> {["Not at all","Several days","More than half the days","Nearly every day"][ans.phq2_interest||0]} ({ans.phq2_interest||0}/3)</div>
          <div>• <strong>Feeling down, depressed, hopeless:</strong> {["Not at all","Several days","More than half the days","Nearly every day"][ans.phq2_mood||0]} ({ans.phq2_mood||0}/3)</div>
          <div style={{marginTop:6,fontWeight:600}}>→ Clinical threshold met (≥3/6). Recommend: PHQ-9 full screening, assess capacity to consent, mental health resource referral{ans.pregnancy_status&&ans.pregnancy_status!=="not_pregnant"?", postpartum depression pathway evaluation":""}.</div>
          <div style={{marginTop:4,fontSize:10,color:"#991B1B"}}>This flag has been automatically reported to Utah OAIP (de-identified) per regulatory requirements.</div>
        </div>
      </div>}
      {((ans.phq2_interest||0)+(ans.phq2_mood||0))>=2&&<div className="card" style={{background:psiRefer?"#F0FDF4":"#FEFCE8",borderLeft:`4px solid ${psiRefer?"#16A34A":"#D97706"}`,marginBottom:10,transition:"all .3s"}}>
        <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer"}}>
          <input type="checkbox" checked={psiRefer} onChange={e=>{setPsiRefer(e.target.checked);if(e.target.checked)L("psi_referral",{patient:nm,phq2Score:(ans.phq2_interest||0)+(ans.phq2_mood||0)})}} style={{marginTop:3,transform:"scale(1.2)"}}/>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:psiRefer?"#166534":"#92400E"}}>Refer patient to PSI Utah for maternal mental health support</div>
            <div style={{fontSize:11,color:psiRefer?"#15803D":"#78350F",marginTop:2,lineHeight:1.5}}>
              {psiRefer?"Referral logged. This will be included in the encounter note sent to the referring physician.":"Check this box to document a PSI Utah referral in the audit trail and encounter note."}
            </div>
          </div>
        </label>
      </div>}
      <Section title="ICIQ-UI Short Form" tag={`${iciq.total}/21 · ${iciq.severity}`}>
        {ICIQ.map(q=><AnsRow key={q.id} label={q.text.slice(0,80)+(q.text.length>80?"...":"")} value={getOptLabel(ICIQ,q.id,ans[q.id])} score={q.type!=="multi"?getOptScore(ICIQ,q.id,ans[q.id]):undefined}/>)}
        <div style={{marginTop:6,fontSize:11,color:C.blue,fontWeight:600}}>→ {iciq.subtype}</div>
      </Section>
      <Section title="FLUTS — Filling" tag={`F: ${fluts.F}/12`}>
        {FLUTS.filter(q=>["fl2a","fl2b","fl3a","fl3b","fl5a","fl5b"].includes(q.id)).map(q=><AnsRow key={q.id} label={q.text.slice(0,80)+"..."} value={getOptLabel(FLUTS,q.id,ans[q.id])} score={q.id.endsWith("a")?getOptScore(FLUTS,q.id,ans[q.id]):undefined}/>)}
      </Section>
      <Section title="FLUTS — Voiding" tag={`V: ${fluts.V}/12`}>
        {FLUTS.filter(q=>["fl6a","fl6b","fl7a","fl7b","fl8a","fl8b"].includes(q.id)).map(q=><AnsRow key={q.id} label={q.text.slice(0,80)+"..."} value={getOptLabel(FLUTS,q.id,ans[q.id])} score={q.id.endsWith("a")?getOptScore(FLUTS,q.id,ans[q.id]):undefined}/>)}
      </Section>
      <Section title="POPDI-6 — Prolapse Screening" tag={`${popdi.positiveCount}/6 positive`}>
        {POPDI[0].rows.map(row=>{const bl={1:"Not at all",2:"Somewhat",3:"Moderately",4:"Quite a bit"};return<AnsRow key={row.id} label={row.label.slice(0,100)+(row.label.length>100?"...":"")} value={ans[row.id]==="yes"?`Yes (bother: ${bl[ans[row.id+"_bother"]]||"—"})`:(ans[row.id]==="no"?"No":"—")}/>})}
        {popdi.bulge&&<div style={{fontSize:11,color:C.rd,fontWeight:600,marginTop:4}}>Bulge/protrusion symptoms reported — pelvic exam recommended</div>}
      </Section>
      <Section title="FLUTSsex" tag={`Score: ${fsex.total}`}>
        {FLUTSSEX.map(q=><AnsRow key={q.id} label={q.text.slice(0,80)+"..."} value={getOptLabel(FLUTSSEX,q.id,ans[q.id])} score={q.id.endsWith("a")?getOptScore(FLUTSSEX,q.id,ans[q.id]):undefined}/>)}
      </Section>
      <Section title="GUPI + Pain" tag={`GUPI: ${gupi.total}/45 · Pain: ${pain.composite}/10`}>
        {[...GUPI_PAIN,...QOL_IMPACT].map(q=><AnsRow key={q.id} label={q.text.slice(0,90)+(q.text.length>90?"...":"")} value={getOptLabel([...GUPI_PAIN,...QOL_IMPACT],q.id,ans[q.id])} score={q.type!=="multi"?getOptScore([...GUPI_PAIN,...QOL_IMPACT],q.id,ans[q.id]):undefined}/>)}
      </Section>
    </div>

    {/* DIAGNOSES */}
    <div className="card">
      <div className="chd">ICD-10 Diagnoses (AI-Generated)</div>
      <div style={{display:"flex",flexWrap:"wrap"}}>{plan.dx.map(d=><div className="dx"key={d.c}><b>{d.c}</b> {d.d}</div>)}</div>
      <div style={{marginTop:10}}><span className="bdg"style={{background:`${rc}15`,color:rc}}>● Risk: {plan.risk==="green"?"Green":"Yellow — Elevated"}</span></div>
    </div>

    {/* EDITABLE TREATMENT PLAN */}
    <div className="card"style={{borderColor:approved?C.gn:C.pink}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div className="chd"style={{marginBottom:0}}>{approved?"Approved ":""}Treatment Plan {!approved&&"(Editable)"}</div>
        {approved?<span className="bdg"style={{background:`${C.gn}15`,color:C.gn}}>✓ Approved</span>:<span className="bdg pu"style={{background:`${C.or}15`,color:C.or}}>⏳ Review</span>}
      </div>

      {/* Editable Goals */}
      <div style={{marginBottom:12}}><div className="il">Goals (edit below)</div>
        {approved?<div style={{fontSize:13,whiteSpace:"pre-wrap"}}>{editGoals}</div>:<textarea className="inp"value={editGoals}onChange={e=>setEditGoals(e.target.value)}rows={3}/>}
      </div>

      {/* Editable Exercises */}
      <div style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div className="il">Exercise Prescription · {plan.freq} · {plan.dur}</div>{!approved&&<button className="btn bo bsm"onClick={addEx}>+ Add Exercise</button>}</div>
        {editExs.map((e,i)=><div className="exc"key={i}style={{position:"relative"}}>
          {!approved&&<button style={{position:"absolute",top:8,right:8,background:"none",border:"none",color:C.rd,cursor:"pointer",fontSize:14}}onClick={()=>removeEx(i)}>✕</button>}
          {approved?<><div className="exn">{e.n}</div><div className="exr">{e.s}×{e.r} · Hold: {e.h} · {e.f}</div><div className="exd">{e.d}</div></>:
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:6}}>
            <div><div className="il">Name</div><input className="inp"value={e.n}onChange={v=>updateEx(i,"n",v.target.value)}/></div>
            <div><div className="il">Sets</div><input className="inp"type="number"value={e.s}onChange={v=>updateEx(i,"s",+v.target.value)}/></div>
            <div><div className="il">Reps</div><input className="inp"type="number"value={e.r}onChange={v=>updateEx(i,"r",+v.target.value)}/></div>
            <div><div className="il">Hold</div><input className="inp"value={e.h}onChange={v=>updateEx(i,"h",v.target.value)}/></div>
            <div><div className="il">Freq</div><input className="inp"value={e.f}onChange={v=>updateEx(i,"f",v.target.value)}/></div>
          </div>}
        </div>)}
      </div>

      {/* Editable Adjuncts/Devices */}
      <div style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div className="il">Recommended Adjuncts & Devices</div></div>
        {editAdj.map((a,i)=><div className="exc"key={i}style={{borderLeft:`3px solid ${a.type==="device"?C.blue:a.type==="referral"?C.pink:C.or}`}}>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <div><span className="bdg"style={{background:`${a.type==="device"?C.blue:a.type==="referral"?C.pink:C.or}12`,color:a.type==="device"?C.blue:a.type==="referral"?C.pink:C.or,marginRight:6}}>{a.type}</span>{a.badge&&<span className="bdg"style={{background:a.badge==="library"?"#D1FAE5":"#FEF3C7",color:a.badge==="library"?"#065F46":"#92400E",marginRight:6,fontSize:9}}>{a.badge==="library"?"✓ Library Match":"AI-Generated"}</span>}<b style={{fontSize:13}}>{a.n}</b></div>
            {!approved&&<button style={{background:"none",border:"none",color:C.rd,cursor:"pointer"}}onClick={()=>removeAdj(i)}>✕</button>}
          </div>
          <div style={{fontSize:12,color:C.g500,marginTop:3}}>{a.d}</div>
          {a.patientText&&<div style={{fontSize:11,color:C.purp,marginTop:3,background:"#F5F3FF",borderRadius:6,padding:"6px 8px",lineHeight:1.4}}>📄 Patient will see: <em>{a.patientText.substring(0,120)}...</em></div>}
          <div style={{fontSize:11,color:C.blue,marginTop:2}}>Rx: {a.rx}</div>
        </div>)}
        {!approved&&<div style={{display:"grid",gridTemplateColumns:"auto 2fr 2fr 2fr auto",gap:6,marginTop:8,alignItems:"end"}}>
          <div><div className="il">Type</div><select className="inp"value={newAdj.type}onChange={e=>setNewAdj(p=>({...p,type:e.target.value}))}><option value="device">Device</option><option value="behavioral">Behavioral</option><option value="referral">Referral</option></select></div>
          <div><div className="il">Name</div><input className="inp"value={newAdj.n}onChange={e=>setNewAdj(p=>({...p,n:e.target.value}))} placeholder="e.g., biofeedback device"/>{(()=>{const m=matchExpansion(newAdj.n);return m?<div style={{fontSize:10,color:C.gn,marginTop:2}}>✓ Library match: <b>{m.n}</b></div>:newAdj.n.trim().length>=3?<div style={{fontSize:10,color:C.or,marginTop:2}}>No library match — will use AI expansion</div>:null})()}</div>
          <div><div className="il">Description</div><input className="inp"value={newAdj.d}onChange={e=>setNewAdj(p=>({...p,d:e.target.value}))}/></div>
          <div><div className="il">Recommendation</div><input className="inp"value={newAdj.rx}onChange={e=>setNewAdj(p=>({...p,rx:e.target.value}))}/></div>
          <button className="btn bbl bsm"onClick={addAdj}>+ Add</button>
        </div>}
      </div>

      {/* Editable Precautions + Progression */}
      <div className="two"style={{marginBottom:12}}>
        <div><div className="il">Precautions</div>{approved?<div style={{fontSize:12,whiteSpace:"pre-wrap"}}>{editPrec}</div>:<textarea className="inp"value={editPrec}onChange={e=>setEditPrec(e.target.value)}rows={3}/>}</div>
        <div><div className="il">Progression Criteria</div>{approved?<div style={{fontSize:12,whiteSpace:"pre-wrap"}}>{editProg}</div>:<textarea className="inp"value={editProg}onChange={e=>setEditProg(e.target.value)}rows={3}/>}</div>
      </div>
      <div><div className="il">CPT Codes</div>{plan.cpt.map(c=><div className="dx"key={c.c}><b>{c.c}</b> {c.d} · {c.u}u</div>)}</div>
    </div>

    {/* REVIEW CONTROLS — timer, notes, generate note, approve */}
    {!approved&&<div className="card"style={{borderColor:C.purp}}>
      <div className="chd"style={{color:C.purp}}>PT Review</div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <span className="tmr">{String(Math.floor(tSec/60)).padStart(2,"0")}:{String(tSec%60).padStart(2,"0")}</span>
        <button className={`btn ${tRun?"brd":"bbl"} bsm`}onClick={()=>setTRun(!tRun)}>{tRun?"⏸ Pause":"▶ Start Timer"}</button>
        <span style={{fontSize:10,color:C.g400}}>CMS time documentation</span>
      </div>
      <div className="il">Clinical Notes / Modifications / Rationale:</div>
      <textarea className="inp"placeholder="Document your clinical reasoning, any modifications, and rationale..."value={notes}onChange={e=>setNotes(e.target.value)}style={{marginBottom:12}}/>

      <button className="btn bpu"onClick={genNote}style={{marginBottom:12}}>{noteGenerated?"↻ Regenerate Encounter Note":"Generate Encounter Note"}</button>

      {noteGenerated&&<div style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><div className="il">Encounter Note (editable — review before approving)</div><button className="btn bo bsm"onClick={()=>navigator.clipboard?.writeText(editNote)}> Copy</button></div>
        <textarea className="inp"value={editNote}onChange={e=>setEditNote(e.target.value)}style={{fontFamily:"'Courier New',monospace",fontSize:11,minHeight:200,lineHeight:1.5}}/>
      </div>}

      {/* GUARDRAIL MODAL */}
      {showGuardrails&&<div style={{background:`${C.or}1A`,border:`2px solid ${C.or}`,borderRadius:12,padding:18,marginBottom:12}}>
        <div style={{fontWeight:700,color:C.or,marginBottom:8}}>! Pre-Approval Checks</div>
        {guardrails.map((g,i)=><div key={i}style={{fontSize:12,marginBottom:6,padding:"6px 10px",borderRadius:6,background:g.lvl==="alert"?`${C.rd}10`:g.lvl==="warn"?`${C.or}10`:`${C.blue}08`,color:g.lvl==="alert"?C.rd:g.lvl==="warn"?C.or:C.blue}}>{g.msg}</div>)}
        <div style={{display:"flex",gap:6,marginTop:10}}>
          <button className="btn bo bsm"onClick={()=>setShowGuardrails(false)}>← Go Back & Fix</button>
          <button className="btn brd bsm"onClick={doFinalApprove}>I've reviewed — Approve Anyway</button>
        </div>
      </div>}

      {!showGuardrails&&<div style={{display:"flex",gap:6}}>
        <button className="btn bbl"onClick={tryApprove}>✓ Approve Plan</button>
        <button className="btn brd"onClick={()=>{L("plan_rejected",{patient:nm});setPlan(p=>({...p,status:"rejected"}));const uid=sharedIntake?.userId;if(uid)db("updatePatientPlan",{userId:uid,plan:{...plan,status:"rejected"},status:"rejected"})}}>✕ Reject</button>
      </div>}
    </div>}

    {/* POST-APPROVAL: Status + Fax + Notify */}
    {approved&&ans.concierge_pending&&<div style={{marginBottom:12}}>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:200,padding:"12px 16px",borderRadius:10,background:"#F0FDF4",border:"1px solid #86EFAC"}}>
          <div style={{fontSize:11,fontWeight:600,color:"#6B7280",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Plan Status</div>
          <div style={{fontSize:14,fontWeight:700,color:C.gn}}>Active (Patient Access Granted)</div>
        </div>
        <div style={{flex:1,minWidth:200,padding:"12px 16px",borderRadius:10,background:"#FFF7ED",border:"1px solid #FDBA74"}}>
          <div style={{fontSize:11,fontWeight:600,color:"#6B7280",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Transmission Status</div>
          <div style={{fontSize:14,fontWeight:700,color:C.or}}>HOLD — Pending Destination Verification</div>
          <div style={{fontSize:11,color:"#78350F",marginTop:4}}>Provider: {ans.concierge_pending.practice} · {ans.concierge_pending.city}</div>
        </div>
      </div>
    </div>}
    {approved&&<div className="two">
      <div className="card fi">
        <div className="chd"> Fax to Physician</div>
        {ans.concierge_pending?<div>
          <div style={{fontSize:13,color:C.or,marginBottom:8}}>Fax transmission on hold — destination provider is pending verification.</div>
          <div style={{fontSize:12,color:C.g500}}>Once <b>{ans.concierge_pending.practice}</b> is verified, the fax will be released automatically.</div>
        </div>:<>
        <div style={{fontSize:13,color:C.g600,marginBottom:8}}>Send encounter note + care plan to <b>{ans.physician_name||"Physician"}</b>{ans.physician_npi_id?<span style={{fontSize:11,color:C.blue,marginLeft:6}}>(NPI: {ans.physician_npi_id} ✓)</span>:""}{ans.prenatal_flag?<span style={{fontSize:11,color:"#065F46",marginLeft:6}}>(Prenatal protocol)</span>:""}</div>
        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:10}}>
          <input className="inp"value={ans.physician_fax||""}readOnly style={{width:180}}/>
          <button className="btn bpu bsm"disabled={faxSt==="sending"||!ans.physician_fax}onClick={()=>{setFaxSt("sending");L("fax_init",{to:ans.physician_name});setTimeout(()=>{setFaxSt("sent");L("fax_confirmed",{conf:`FAX-${Date.now().toString(36).toUpperCase()}`})},2000)}}style={{opacity:!ans.physician_fax?0.4:1}}>{faxSt==="sending"?"Sending...":"Send HIPAA Fax"}</button>
        </div>
        {faxSt==="sent"&&<div style={{padding:"8px 14px",borderRadius:8,background:`${C.gn}10`,color:C.gn,fontSize:12,fontWeight:600}}>✓ Fax sent · Logged</div>}
        </>}
      </div>
      <div className="card fi">
        <div className="chd"> Send to Patient</div>
        <div style={{fontSize:13,color:C.g600,marginBottom:8}}>Notify <b>{nm}</b> their plan is ready</div>
        <div style={{fontSize:12,color:C.g500,marginBottom:10}}>Patient receives: exercises, adjuncts, goals, precautions. Scores and diagnoses are not shared.</div>
        <button className="btn bpk bsm"disabled={patSent}onClick={()=>{setPatSent(true);L("plan_sent_patient",{patient:nm})}}>{patSent?"✓ Sent":"Send Plan"}</button>
      </div>
    </div>}
    {approved&&((ans.phq2_interest||0)+(ans.phq2_mood||0))>=2&&<div className="card" style={{marginTop:12,borderLeft:"4px solid #D97706"}}>
      <div className="chd">Automated Follow-Up Email (3–5 Days)</div>
      <div style={{fontSize:12,color:C.g600,marginBottom:10,lineHeight:1.6}}>
        Patient received PHQ-2 support resources (score: {(ans.phq2_interest||0)+(ans.phq2_mood||0)}/6). An automated follow-up email will be sent 3–5 days post-approval with a gentle check-in and the same PSI resource links. This is a passive resource re-delivery — no response is routed to the PT.
      </div>
      <div style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,padding:14,marginBottom:12,fontSize:12,lineHeight:1.6,color:"#374151"}}>
        <div style={{fontWeight:600,marginBottom:6}}>Email Preview:</div>
        <div style={{fontStyle:"italic",marginBottom:10}}>{PSI_RESOURCES.followUpMsg}</div>
        <div style={{fontSize:11,color:"#6B7280"}}>
          {PSI_RESOURCES.crisis.map((r,i)=><div key={"c"+i}>📞 {r.name}: {r.phone}</div>)}
          {PSI_RESOURCES.support.map((r,i)=><div key={"s"+i}>{r.url?"🔗":"📞"} {r.name}{r.phone?": "+r.phone:""}{r.url?" — "+r.url.replace(/https?:\/\/(www\.)?/,""):""}</div>)}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn bpu bsm" disabled={followUpSent==="sending"||followUpSent==="sent"} onClick={()=>{
          setFollowUpSent("sending");
          L("phq2_followup_email_queued",{patient:nm,phq2Score:(ans.phq2_interest||0)+(ans.phq2_mood||0),scheduledFor:"3-5 days post-approval",email:ans.email||"—"});
          setTimeout(()=>setFollowUpSent("sent"),2000);
        }}>{followUpSent==="sending"?"Scheduling...":followUpSent==="sent"?"✓ Scheduled":"Schedule Follow-Up Email"}</button>
        {followUpSent==="sent"&&<span style={{fontSize:11,color:C.gn,fontWeight:600}}>Queued — email will send in 3–5 days</span>}
      </div>
    </div>}
  </div>;
}


function PTPatientDetail({pt,onBack}){
  const[msgs,setMsgs]=useState(pt.msgs||[]);const[draft,setDraft]=useState("");
  const send=()=>{if(!draft.trim())return;setMsgs(p=>[...p,{fr:"pt",tx:draft,t:new Date().toLocaleString()}]);L("msg_sent",{to:pt.id});setDraft("")};
  const li=pt.iciq[pt.iciq.length-1].s,lp=pt.pain[pt.pain.length-1].s;
  const w8=pt.week8;const intake=pt.intake;
  const adhDays=pt.id==="P001"?DEMO_ADHERENCE_LOG.filter(e=>{const d=new Date(e.date);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear()}).length:0;
  // Status badge
  const getStatus=()=>{if(!w8||!intake)return null;const iciqDelta=intake.iciq-w8.iciq;if(iciqDelta>=3)return{label:"On Track",color:C.gn,bg:"#D1FAE5"};if(iciqDelta>=1)return{label:"Monitor",color:C.or,bg:"#FEF3C7"};return{label:"Clinical Review Required",color:C.rd,bg:"#FEE2E2"}};
  const status=getStatus();
  // PT time for RTM (simulated from review timer)
  const ptMinutes=pt.id==="P001"?32:0;
  return<div className="fi">
    <button className="btn bo bsm"onClick={onBack}style={{marginBottom:16}}>← Back to Patients</button>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div className="h1">{pt.nm}</div><div className="sub">Age {pt.age} · Referred by {pt.ref}</div></div>
    {status&&<span className="bdg"style={{background:status.bg,color:status.color,fontSize:12,padding:"5px 14px"}}>{status.label}</span>}</div>
    <div className="three"style={{marginBottom:14}}>
      <div className="sc"><div className="scl2">Latest ICIQ</div><div className="scv2"style={{color:C.pink}}>{li}</div><Bdg sev={li===0?"None":li<=5?"Slight":li<=12?"Moderate":li<=18?"Severe":"Very Severe"}/></div>
      <div className="sc"><div className="scl2">Latest Pain</div><div className="scv2"style={{color:C.or}}>{lp}</div><Bdg sev={lp===0?"None":lp<=3?"Mild":lp<=6?"Moderate":"Severe"}/></div>
      <div className="sc"><div className="scl2">Adherence</div><div className="scv2"style={{color:pt.adh>=80?C.gn:C.or}}>{pt.adh}%</div></div>
    </div>
    {/* Week 8 Outcomes Split Panel */}
    {w8&&intake&&<div className="card"style={{marginBottom:14,borderColor:C.purp}}>
      <div className="chd">Week 8 Outcomes</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div><div style={{fontSize:12,fontWeight:700,color:C.g400,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Intake</div>
          <div style={{display:"grid",gap:6}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}><span>ICIQ</span><span style={{fontWeight:700}}>{intake.iciq}/21</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}><span>Pain</span><span style={{fontWeight:700}}>{intake.pain}/10</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}><span>PHQ-2</span><span style={{fontWeight:700}}>{intake.phq2}/6</span></div>
            {intake.fsex>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}><span>FLUTSsex</span><span style={{fontWeight:700}}>{intake.fsex}/12</span></div>}
          </div>
        </div>
        <div><div style={{fontSize:12,fontWeight:700,color:C.purp,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Week 8</div>
          <div style={{display:"grid",gap:6}}>
            {[["ICIQ",intake.iciq,w8.iciq,21],["Pain",intake.pain,w8.pain,10],["PHQ-2",intake.phq2,w8.phq2,6]].map(([label,intk,wk8,max])=>{const d=intk-wk8;return<div key={label}style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}>
              <span>{label}</span>
              <span style={{fontWeight:700,color:d>0?C.gn:d<0?C.rd:C.or}}>{wk8}/{max} <span style={{fontSize:11}}>{d>0?`↓${d}`:d<0?`↑${Math.abs(d)}`:"→"}</span></span>
            </div>})}
            {intake.fsex>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0"}}>
              <span>FLUTSsex</span><span style={{fontWeight:700,color:intake.fsex-w8.fsex>0?C.gn:C.rd}}>{w8.fsex}/12 <span style={{fontSize:11}}>{intake.fsex-w8.fsex>0?`↓${intake.fsex-w8.fsex}`:`↑${Math.abs(intake.fsex-w8.fsex)}`}</span></span>
            </div>}
          </div>
        </div>
      </div>
      {w8.bowel&&<div style={{marginTop:10,fontSize:12,color:w8.bowel==="better"?C.gn:w8.bowel==="worse"?C.rd:C.or}}>Bowel: {w8.bowel} · NPS: {w8.nps}/10 · Activities resumed: {(w8.avoid_resumed||[]).join(", ")||"None"}{w8.prolapse_followup?` · Prolapse f/u: ${w8.prolapse_followup}`:""}</div>}
    </div>}
    {/* Week 8 Encounter Note */}
    {w8&&intake&&<div className="card"style={{marginBottom:14}}>
      <div className="chd">Week 8 Encounter Note</div>
      <pre style={{fontSize:11,fontFamily:"'Courier New',monospace",background:C.g50,padding:12,borderRadius:8,whiteSpace:"pre-wrap",lineHeight:1.5,color:C.g700}}>
{`WEEK 8 CHECK-IN NOTE
Patient: ${pt.nm} | Date: ${w8.date}

SCORE DELTAS:
ICIQ: ${intake.iciq} → ${w8.iciq} (${intake.iciq-w8.iciq>0?"-":""}${intake.iciq-w8.iciq} pts)
Pain: ${intake.pain} → ${w8.pain} (${intake.pain-w8.pain>0?"-":""}${intake.pain-w8.pain})
PHQ-2: ${intake.phq2} → ${w8.phq2} (${w8.phq2>=3?"POSITIVE":"Negative"})
${intake.fsex>0?`FLUTSsex: ${intake.fsex} → ${w8.fsex}\n`:""}Bowel: ${w8.bowel||"N/A"}${w8.prolapse_followup?`\nProlapse follow-up: ${w8.prolapse_followup==="yes"?"Patient saw provider for pelvic exam/pessary evaluation":w8.prolapse_followup==="not_yet"?"Patient has not yet followed up":"N/A"}`:""}
NPS: ${w8.nps}/10

STATUS: ${status?status.label:"—"}
${w8.phq2>=3?`\n*** PHQ-2 POSITIVE (${w8.phq2}/6) ***\nReferring physician notified of PHQ-2 result and recommended follow-up within 3-5 days.`:""}
Adherence: ${pt.adh}% | Activities resumed: ${(w8.avoid_resumed||[]).join(", ")||"None"}`}
      </pre>
    </div>}
    {/* RTM Billing Panel */}
    <div className="card"style={{marginBottom:14,borderColor:C.purpL}}>
      <div className="chd">RTM Billing</div>
      {[["98975","Initial Setup",pt.ps==="approved",pt.planApprovedDate||"—"],["98977","MSK Data Monitoring",adhDays>=16,`${adhDays}/16 days`],["98980","Treatment Mgmt (20min)",ptMinutes>=20,`${ptMinutes}/20 min`],["98981","Treatment Mgmt (40min)",ptMinutes>=40,`${ptMinutes}/40 min`]].map(([code,name,met,detail])=><div key={code}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.g100}`}}>
          <div><div style={{fontWeight:600,fontSize:13}}>{code} — {name}</div><div style={{fontSize:11,color:C.g400}}>{RTM_CODES[code].desc}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:C.g500}}>{detail}</span>
            <span className="bdg"style={{background:met?`${C.gn}15`:`${C.g300}15`,color:met?C.gn:C.g400}}>{met?"Threshold Met":"In Progress"}</span>
          </div>
        </div>
        {code==="98977"&&<div style={{marginTop:4,marginBottom:4}}><div style={{height:6,background:C.g200,borderRadius:3,overflow:"hidden"}}><div style={{height:6,background:adhDays>=16?C.gn:C.or,borderRadius:3,width:`${Math.min(100,adhDays/16*100)}%`}}/></div></div>}
      </div>)}
    </div>
    <div className="two">
      <div className="card"><div className="chd">Score History</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:12,height:80,paddingBottom:10,borderBottom:`1px solid ${C.g100}`}}>
          {pt.iciq.map((s,i)=><div key={i}style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{width:24,height:`${(s.s/21)*100}%`,background:i===pt.iciq.length-1?C.pink:`${C.pink}44`,borderRadius:"3px 3px 0 0",minHeight:4}}/>
            <div style={{fontSize:9,color:C.g400,marginTop:4}}>{s.d}</div></div>)}
        </div></div>
      <div className="card"><div className="chd">Messages</div>
        <div style={{minHeight:100,maxHeight:160,overflowY:"auto"}}>
          {msgs.length===0&&<div style={{color:C.g400,fontSize:12,padding:20,textAlign:"center"}}>No messages yet.</div>}
          {msgs.map((m,i)=><div key={i}style={{display:"flex",flexDirection:"column",alignItems:m.fr==="pt"?"flex-end":"flex-start"}}>
            <div className={`msg ${m.fr==="pt"?"mpt":"mpa"}`}>{m.tx}</div><div style={{fontSize:9,color:C.g400,margin:"0 4px 6px"}}>{m.t}</div></div>)}
        </div>
        <div style={{borderTop:`1px solid ${C.g100}`,paddingTop:8,display:"flex",gap:6}}>
          <input className="inp"placeholder="Message..."value={draft}onChange={e=>setDraft(e.target.value)}onKeyDown={e=>e.key==="Enter"&&send()}/>
          <button className="btn bpu bsm"onClick={send}>Send</button>
        </div></div>
    </div></div>;
}

function PTDash(){
  const n=DPTS.length+(sharedIntake?1:0),aa=Math.round(DPTS.reduce((s,p)=>s+p.adh,0)/DPTS.length);
  const imp=DPTS.filter(p=>p.iciq.length>1).reduce((s,p)=>s+(p.iciq[0].s-p.iciq[p.iciq.length-1].s),0);
  const pend=DPTS.filter(p=>p.ps==="pending_review").length+(sharedIntake&&sharedIntake.plan?.status==="pending_review"?1:0);
  return<div className="fi"><div className="h1">Dashboard</div><div className="sub">Pilot overview</div>
    <div className="four"style={{marginBottom:16}}>
      <div className="sc"><div className="scl2">Enrolled</div><div className="scv2"style={{color:C.purp}}>{n}</div></div>
      <div className="sc"><div className="scl2">Avg Adherence</div><div className="scv2"style={{color:aa>=80?C.gn:C.or}}>{aa}%</div></div>
      <div className="sc"><div className="scl2">ICIQ Improvement</div><div className="scv2"style={{color:C.pink}}>-{imp}</div><div className="scs">avg reduction</div></div>
      <div className="sc"><div className="scl2">Pending Review</div><div className="scv2"style={{color:pend?C.or:C.gn}}>{pend}</div></div>
    </div>
    <div className="two">
      <div className="card"><div className="chd">ICIQ Trends</div><div style={{display:"flex",alignItems:"flex-end",gap:16,height:90,paddingBottom:10,borderBottom:`1px solid ${C.g100}`}}>
        {DPTS.map(p=><div key={p.id}style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:2,height:65}}>{p.iciq.map((s,i)=><div key={i}style={{width:14,height:`${(s.s/21)*100}%`,background:i===p.iciq.length-1?C.pink:`${C.pink}44`,borderRadius:"2px 2px 0 0",minHeight:3}}/>)}</div>
          <div style={{fontSize:9,color:C.g400,marginTop:5}}>{p.nm}</div></div>)}</div></div>
      <div className="card"><div className="chd">Pain Trends</div><div style={{display:"flex",alignItems:"flex-end",gap:16,height:90,paddingBottom:10,borderBottom:`1px solid ${C.g100}`}}>
        {DPTS.map(p=><div key={p.id}style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:2,height:65}}>{p.pain.map((s,i)=><div key={i}style={{width:14,height:`${(s.s/10)*100}%`,background:i===p.pain.length-1?C.or:`${C.or}44`,borderRadius:"2px 2px 0 0",minHeight:3}}/>)}</div>
          <div style={{fontSize:9,color:C.g400,marginTop:5}}>{p.nm}</div></div>)}</div></div>
    </div></div>;
}

function AuditLog(){
  const[ptAuditorMode,setPtAuditorMode]=useState(false);
  return<div className="fi"><div className="h1">Audit Log</div><div className="sub">Immutable record · {log.length} entries</div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{fontSize:13,color:C.g600}}>{log.length} entries</div>
      <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.g500,cursor:"pointer"}}>
        <input type="checkbox"checked={ptAuditorMode}onChange={e=>setPtAuditorMode(e.target.checked)}/> De-identify PHI
      </label>
    </div>
    <div className="card"style={{padding:0,overflow:"hidden"}}>
      {log.length===0&&<div style={{padding:40,textAlign:"center",color:C.g400,fontSize:12}}>No events yet.</div>}
      {log.map(e=>{
        const details=Object.fromEntries(Object.entries(e).filter(([k])=>!["id","ts","type"].includes(k)));
        const masked=maskDetails(details,ptAuditorMode);
        return<div key={e.id}style={{padding:"10px 16px",borderBottom:`1px solid ${C.g100}`,fontSize:12,display:"flex",gap:10,alignItems:"flex-start"}}>
        <div style={{width:140,flexShrink:0,color:C.g400,fontSize:10}}>{new Date(e.ts).toLocaleString()}</div>
        <span className="bdg"style={{background:`${AUDIT_COLORS[e.type]||C.g400}12`,color:AUDIT_COLORS[e.type]||C.g400,flexShrink:0}}>{e.type.replace(/_/g," ")}</span>
        <div style={{color:C.g500,fontSize:10,wordBreak:"break-all"}}>{JSON.stringify(masked)}</div>
      </div>})}
    </div></div>;
}

function OAIPView(){
  const[viewMode,setViewMode]=useState("compliance");
  const checks=[
    {cat:"Consumer Protection",items:[{l:"Informed consent with AI disclosure",s:1},{l:"Right to opt out",s:1},{l:"100% PT review (Phase 1)",s:1},{l:"Corrective care commitment (scope-defined)",s:1},{l:"Malpractice + Tech E&O coverage",s:1}]},
    {cat:"Data Transparency",items:[{l:"OAIP monthly dashboard",s:1},{l:"Public anonymized dashboard",s:1},{l:"Researcher dataset (IRB)",s:1},{l:"External auditor access",s:1},{l:"FDA CDS exemption",s:1}]},
    {cat:"Operational Metrics",items:[{l:"AI-PT agreement ≥95%",s:1,v:(()=>{const ar=computeAgreementRate(OUTCOME_RECORDS);return ar.total>0?ar.rate+"%":"N/A"})()},{l:"Adverse events",s:1,v:"0"},{l:"PHI breaches",s:1,v:"0"},{l:"Complaint rate",s:1,v:"0%"},{l:"Audit log",s:1,v:`${log.length} entries`}]},
    {cat:"Termination Triggers",items:[{l:"Adverse event → immediate pause",s:2},{l:"PHI breach → pause + notify",s:2},{l:"PT license action → removal",s:2},{l:"OAIP request → 48hr wind-down",s:2}]},
  ];
  const n=DPTS.length+(sharedIntake?1:0),aa=Math.round(DPTS.reduce((s,p)=>s+p.adh,0)/DPTS.length);

  // Gather red flags from all sources
  const redFlags=[];
  // From current intake
  if(sharedIntake){
    const a=sharedIntake.ans;
    // Safety screening flags
    REDFLAGS.forEach(rf=>{if(a[rf.id]==="yes")redFlags.push({type:"SAFETY_FLAG",severity:rf.act==="er"?"CRITICAL":"HIGH",desc:rf.text,action:rf.msg,patient:sharedIntake.name||"Current Patient",ts:new Date().toISOString()})});
    // Safety answer changed
    if(a._safety_answer_changed)(a._safety_changes||[]).forEach(c=>redFlags.push({type:"SAFETY_ANSWER_CHANGED",severity:"HIGH",desc:`Patient changed safety answer: ${c.id}`,action:"PT must verify safety concern was appropriately addressed",patient:sharedIntake.name||"Current Patient",ts:c.ts}));
    // PHQ-2 depression
    if(sharedIntake.depressionFlag?.positive)redFlags.push({type:"DEPRESSION_RISK",severity:sharedIntake.depressionFlag.oaip_report?.severity||"MODERATE",desc:`PHQ-2 positive (score: ${sharedIntake.depressionFlag.score}/6)`,action:"PHQ-9 full screening recommended. Assess capacity to consent.",patient:sharedIntake.name||"Current Patient",ts:sharedIntake.depressionFlag.oaip_report?.timestamp||new Date().toISOString()});
    // Medication modification
    if((a.med_modify??0)===1)redFlags.push({type:"MEDICATION_ALERT",severity:"MODERATE",desc:"Patient modifying prescribed medication due to urinary symptoms",action:"Refer to prescribing provider for medication review",patient:sharedIntake.name||"Current Patient",ts:new Date().toISOString()});
    // Prenatal routing
    if(sharedIntake.prenatalFlag)redFlags.push({type:"PRENATAL_PROTOCOL_APPLIED",severity:"MODERATE",desc:"Patient indicated active pregnancy — prenatal pelvic floor protocol applied with automatic supine exercise modifications",action:"Clinical routing note. Exercise modifications for supine positioning have been auto-applied. PT to review for trimester appropriateness.",patient:sharedIntake.name||"Current Patient",ts:new Date().toISOString()});
    // Pudendal neuralgia flag
    if((a.symptoms_trigger||[]).includes("sitting_long")&&(sharedIntake.pain?.composite||0)>6)redFlags.push({type:"PUDENDAL_NEURALGIA",severity:"HIGH",desc:"Potential pudendal neuralgia: sitting pain + composite pain >6/10",action:"Evaluate for pudendal nerve involvement. Avoid prolonged sitting exercises.",patient:sharedIntake.name||"Current Patient",ts:new Date().toISOString()});
    // PSI Utah referral flag
    if(sharedIntake.psiRefer)redFlags.push({type:"PSI_REFERRAL",severity:"MODERATE",desc:"Patient referred to PSI Utah for maternal mental health support (PHQ-2: "+calcPHQ2(a)+"/6)",action:"Documented referral to Postpartum Support International. Verify follow-up at next encounter.",patient:sharedIntake.name||"Current Patient",ts:new Date().toISOString()});
  }
  // From audit log - adverse events
  log.filter(e=>e.type==="adverse_event_report").forEach(e=>redFlags.push({type:"ADVERSE_EVENT",severity:"CRITICAL",desc:`Adverse event reported: ${e.category||"unknown"} — ${e.detail?.slice(0,80)||"See log"}`,action:"Immediate clinical team notification. Consider program pause.",patient:e.patient||"—",ts:new Date(e.ts).toISOString()}));
  // From audit log - safety triggers
  log.filter(e=>e.type==="SAFETY_TRIGGER").forEach(e=>redFlags.push({type:"SAFETY_FLAG_LOGGED",severity:"HIGH",desc:`Safety trigger: ${e.question||"—"}`,action:"Verify addressed in PT review",patient:"Current Intake",ts:new Date(e.ts).toISOString()}));
  // From audit log - clinical regression reports
  log.filter(e=>e.type==="CLINICAL_REGRESSION_FLAG").forEach(e=>redFlags.push({type:"CLINICAL_REGRESSION",severity:e.severity>=7?"CRITICAL":e.severity>=4?"HIGH":"MODERATE",desc:`Patient reports ${e.symptomType==="new"?"new symptom":"worsening symptoms"} (severity: ${e.severity}/10)`,action:"PT clinical review required. Consider program modification or in-person evaluation.",patient:sharedIntake?.name||"Current Patient",ts:new Date(e.ts).toISOString()}));
  // From audit log - exercise pain reports
  log.filter(e=>e.type==="EXERCISE_PAIN_REPORT").forEach(e=>redFlags.push({type:"EXERCISE_PAIN",severity:"HIGH",desc:"Patient reports pain during prescribed exercises",action:"PT must review exercise program and modify or pause as needed.",patient:sharedIntake?.name||"Current Patient",ts:new Date(e.ts).toISOString()}));
  // From audit log - depression screen (fallback if sharedIntake is stale/null)
  if(!sharedIntake?.depressionFlag?.positive){log.filter(e=>e.type==="depression_screen_positive").forEach(e=>redFlags.push({type:"DEPRESSION_RISK",severity:e.severity||"MODERATE",desc:`PHQ-2 positive (score: ${e.score}/6)`,action:"PHQ-9 full screening recommended. Assess capacity to consent.",patient:e.patient||sharedIntake?.name||"Current Patient",ts:new Date(e.ts).toISOString()}))}
  // From audit log - prenatal protocol (fallback if sharedIntake is stale/null)
  if(!sharedIntake?.prenatalFlag){log.filter(e=>e.type==="PRENATAL_PROTOCOL_APPLIED"&&e.context==="EXERCISE_MODIFICATIONS_GENERATED").forEach(e=>redFlags.push({type:"PRENATAL_PROTOCOL_APPLIED",severity:"MODERATE",desc:"Prenatal pelvic floor protocol applied — exercise modifications generated",action:"Clinical routing note. PT to review for trimester appropriateness.",patient:sharedIntake?.name||"Current Patient",ts:new Date(e.ts).toISOString()}))}
  // From audit log - clinical review requests (clarity, optout)
  log.filter(e=>e.type==="clinical_review_request").forEach(e=>redFlags.push({type:"CLINICAL_REVIEW_REQUEST",severity:e.category==="optout"?"HIGH":"MODERATE",desc:`Patient requested ${e.category==="optout"?"opt-out from AI-assisted care":"care plan clarification"}${e.note?`: ${e.note.slice(0,60)}`:""}`,action:e.category==="optout"?"Assign non-AI care pathway. Contact patient within 24 hours.":"PT follow-up to clarify care plan instructions.",patient:e.patient||"—",ts:new Date(e.ts).toISOString()}));

  const sevOrder={CRITICAL:0,HIGH:1,MODERATE:2,LOW:3};
  redFlags.sort((a,b)=>(sevOrder[a.severity]||3)-(sevOrder[b.severity]||3));
  const sevColors={CRITICAL:{bg:"#FEE2E2",border:"#DC2626",text:"#991B1B"},HIGH:{bg:"#FFF7ED",border:"#EA580C",text:"#9A3412"},MODERATE:{bg:"#FEF3C7",border:"#D97706",text:"#92400E"},LOW:{bg:"#F0FDF4",border:"#16A34A",text:"#166534"}};

  // Auditor view - de-identified
  const[auditorMode,setAuditorMode]=useState(true);
  const mask=(name)=>auditorMode?hashMask(name):(name||"—");

  return<div className="fi"><div className="h1">OAIP Compliance Dashboard</div><div className="sub">Utah Office of AI Policy · Regulatory Mitigation Agreement</div>
    {/* View mode tabs */}
    <div style={{display:"flex",gap:0,marginBottom:16,borderBottom:`1px solid ${C.g200}`}}>
      {[["compliance","Compliance"],["redflags","Red Flags & Alerts"],["followup","Follow-Up Schedule"],["audit","Live Audit Stream"],["fhir","Interoperability / HIE"],["outcomes","Outcome Research"]].map(([id,l])=>
        <div key={id}style={{padding:"10px 18px",fontSize:13,fontWeight:viewMode===id?600:400,color:viewMode===id?C.purp:C.g400,borderBottom:`2px solid ${viewMode===id?C.pink:"transparent"}`,cursor:"pointer",whiteSpace:"nowrap"}}onClick={()=>setViewMode(id)}>{l}</div>
      )}
    </div>

    {viewMode==="compliance"&&<>
    <div className="four"style={{marginBottom:16}}>
      <div className="sc"><div className="scl2">Phase</div><div style={{fontSize:16,fontWeight:700,color:C.purp}}>Phase 1</div><div className="scs">Shadow · 100% review</div></div>
      <div className="sc"><div className="scl2">Enrolled</div><div className="scv2"style={{color:C.blue}}>{n}</div></div>
      <div className="sc"><div className="scl2">Adherence</div><div className="scv2"style={{color:C.gn}}>{aa}%</div></div>
      <div className="sc"><div className="scl2">Red Flags</div><div className="scv2"style={{color:redFlags.length>0?C.rd:C.gn}}>{redFlags.length}</div></div>
    </div>
    {checks.map(c=><div className="card"key={c.cat}><div className="chd">{c.cat}</div>
      {c.items.map((it,i)=><div key={i}style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<c.items.length-1?`1px solid ${C.g100}`:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}><span style={{color:it.s===1?C.gn:C.blue,fontSize:15}}>{it.s===1?"✓":"◆"}</span>{it.l}</div>
        <span style={{fontSize:12,color:C.g500,fontWeight:500}}>{it.v||(it.s===1?"Compliant":"Armed")}</span>
      </div>)}
    </div>)}
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <button className="btn bo bsm">Monthly Report</button><button className="btn bo bsm">De-ID Dataset</button>
      <button className="btn bo bsm"> Public Dashboard</button><button className="btn bo bsm"onClick={()=>setViewMode("audit")}> Audit Log</button>
    </div>
    </>}

    {viewMode==="redflags"&&<>
    {/* Red Flags Summary Cards */}
    <div className="four"style={{marginBottom:16}}>
      <div className="sc"style={{borderLeft:"3px solid #DC2626"}}><div className="scl2">Critical</div><div className="scv2"style={{color:"#DC2626"}}>{redFlags.filter(f=>f.severity==="CRITICAL").length}</div></div>
      <div className="sc"style={{borderLeft:"3px solid #EA580C"}}><div className="scl2">High</div><div className="scv2"style={{color:"#EA580C"}}>{redFlags.filter(f=>f.severity==="HIGH").length}</div></div>
      <div className="sc"style={{borderLeft:"3px solid #D97706"}}><div className="scl2">Moderate</div><div className="scv2"style={{color:"#D97706"}}>{redFlags.filter(f=>f.severity==="MODERATE").length}</div></div>
      <div className="sc"style={{borderLeft:"3px solid #16A34A"}}><div className="scl2">Clear</div><div className="scv2"style={{color:"#16A34A"}}>{redFlags.length===0?"✓":"—"}</div></div>
    </div>

    {redFlags.length===0&&<div className="card"style={{textAlign:"center",padding:40}}><div style={{fontSize:32,marginBottom:8}}>✅</div><div style={{color:C.g500,fontSize:14}}>No active red flags. All safety screening clear.</div></div>}

    {redFlags.length>0&&<div className="card"style={{padding:0,overflow:"hidden"}}>
      <div style={{padding:"14px 18px",background:"#FAFAFA",borderBottom:`1px solid ${C.g200}`,fontWeight:600,fontSize:13,color:C.purp}}>Active Red Flags & Clinical Alerts ({redFlags.length})</div>
      {redFlags.map((rf,i)=>{const sc=sevColors[rf.severity]||sevColors.MODERATE;return<div key={i}style={{padding:"14px 18px",borderBottom:`1px solid ${C.g100}`,borderLeft:`4px solid ${sc.border}`,background:sc.bg}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{background:sc.border,color:"white",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700}}>{rf.severity}</span>
            <span style={{background:"#E0E7FF",color:"#3730A3",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:600}}>{rf.type.replace(/_/g," ")}</span>
          </div>
          <span style={{fontSize:10,color:C.g400}}>{new Date(rf.ts).toLocaleString()}</span>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:sc.text,marginBottom:2}}>{rf.desc}</div>
        <div style={{fontSize:11,color:sc.text,opacity:.8}}>Patient: {mask(rf.patient)}</div>
        <div style={{fontSize:11,color:sc.text,marginTop:4,fontStyle:"italic"}}>→ {rf.action}</div>
      </div>})}
    </div>}
    </>}

    {viewMode==="audit"&&<>
    {/* Auditor Mode Toggle */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{fontSize:13,color:C.g600}}>Compliance Log — {log.length} entries</div>
      <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.g500,cursor:"pointer"}}>
        <input type="checkbox"checked={auditorMode}onChange={e=>setAuditorMode(e.target.checked)}/> Auditor Mode (De-identify PHI)
      </label>
    </div>
    {auditorMode&&<div style={{padding:"8px 14px",background:"#E0F2FE",border:"1px solid #7DD3FC",borderRadius:8,marginBottom:12,fontSize:12,color:"#0369A1"}}>
      🔒 <strong>ROLE: AUDITOR</strong> — Patient names are masked with hashed IDs. No direct PHI is visible. This view is safe for regulatory review.
    </div>}
    <div className="card"style={{padding:0,overflow:"hidden"}}>
      {log.length===0&&<div style={{padding:40,textAlign:"center",color:C.g400,fontSize:12}}>No events yet.</div>}
      {log.map(e=>{
        const details=Object.fromEntries(Object.entries(e).filter(([k])=>!["id","ts","type"].includes(k)));
        const maskedDetails=maskDetails(details,auditorMode);
        return<div key={e.id}style={{padding:"10px 16px",borderBottom:`1px solid ${C.g100}`,fontSize:12,display:"flex",gap:10,alignItems:"flex-start"}}>
          <div style={{width:140,flexShrink:0,color:C.g400,fontSize:10}}>{new Date(e.ts).toLocaleString()}</div>
          <span className="bdg"style={{background:`${AUDIT_COLORS[e.type]||C.g400}12`,color:AUDIT_COLORS[e.type]||C.g400,flexShrink:0}}>{e.type.replace(/_/g," ")}</span>
          <div style={{color:C.g500,fontSize:10,wordBreak:"break-all"}}>{JSON.stringify(maskedDetails)}</div>
        </div>;
      })}
    </div>
    </>}

    {viewMode==="followup"&&<>
    {/* Follow-Up Schedule */}
    {(()=>{
      const allPts=[...DPTS.map(p=>({id:p.id,nm:p.nm,approvedDate:p.planApprovedDate,w8:p.week8})),...(sharedIntake&&sharedIntake.plan?.status==="approved"?[{id:"NEW",nm:sharedIntake.name||"Current Patient",approvedDate:new Date().toISOString().split("T")[0],w8:sharedIntake.week8}]:[])];
      const checkpointStatus=(approvedDate,weeksOut,w8Data)=>{
        if(!approvedDate)return{status:"N/A",color:C.g300};
        const approved=new Date(approvedDate);const now=new Date();const daysSince=Math.floor((now-approved)/(1000*60*60*24));const dueDay=weeksOut*7;const overdueDays=daysSince-dueDay;
        if(weeksOut===8&&w8Data&&w8Data.submitted)return{status:"Completed",color:C.gn};
        if(overdueDays>7)return{status:`Overdue (${overdueDays}d)`,color:C.rd};
        if(overdueDays>=0)return{status:"Due now",color:C.or};
        if(dueDay-daysSince<=7)return{status:`Due in ${dueDay-daysSince}d`,color:C.or};
        return{status:`In ${Math.ceil((dueDay-daysSince)/7)}wk`,color:C.g300};
      };
      const w8Stats={completed:allPts.filter(p=>p.w8&&p.w8.submitted).length,pending:allPts.filter(p=>{const s=checkpointStatus(p.approvedDate,8,p.w8);return s.status==="Due now"||s.status.startsWith("Due in")}).length,overdue:allPts.filter(p=>{const s=checkpointStatus(p.approvedDate,8,p.w8);return s.status.startsWith("Overdue")}).length};
      return<>
        <div className="four"style={{marginBottom:16}}>
          <div className="sc"><div className="scl2">Week 8</div><div className="scv2"style={{color:C.gn}}>{w8Stats.completed}</div><div className="scs">completed</div></div>
          <div className="sc"><div className="scl2">Pending</div><div className="scv2"style={{color:C.or}}>{w8Stats.pending}</div></div>
          <div className="sc"><div className="scl2">Overdue</div><div className="scv2"style={{color:w8Stats.overdue>0?C.rd:C.gn}}>{w8Stats.overdue}</div></div>
          <div className="sc"><div className="scl2">Total Patients</div><div className="scv2"style={{color:C.purp}}>{allPts.length}</div></div>
        </div>
        <div className="card"style={{padding:0,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",padding:"10px 16px",background:C.g50,borderBottom:`1px solid ${C.g200}`,fontSize:12,fontWeight:600,color:C.g500}}>
            <span>Patient</span><span>Week 8</span><span>Week 16</span><span>Month 12</span>
          </div>
          {allPts.map(p=>{const w8s=checkpointStatus(p.approvedDate,8,p.w8);const w16s=checkpointStatus(p.approvedDate,16);const m12s=checkpointStatus(p.approvedDate,52);
            return<div key={p.id}style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",padding:"10px 16px",borderBottom:`1px solid ${C.g100}`,fontSize:12,alignItems:"center"}}>
              <span style={{fontWeight:600}}>{mask(p.nm)}</span>
              {[w8s,w16s,m12s].map((s,i)=><span key={i}className="bdg"style={{background:`${s.color}15`,color:s.color,justifySelf:"start"}}>{s.status}</span>)}
            </div>})}
        </div>
        <div style={{marginTop:12}}><button className="btn bo bsm"onClick={()=>{const m12=document.getElementById("month12-preview");if(m12)m12.style.display=m12.style.display==="none"?"block":"none"}}>Preview: Month 12 Check-In</button></div>
        <div id="month12-preview"style={{display:"none",marginTop:12}}><Month12CheckIn/></div>
      </>;
    })()}
    </>}

    {viewMode==="fhir"&&<>
    <div className="ra"style={{background:"#FEF3C7",borderColor:"#D97706",color:"#92400E",fontSize:13,fontWeight:500,marginBottom:16}}>FHIR R4 data model preview — export integration planned for Phase 3. Current interoperability via secure fax transmission.</div>
    {auditorMode&&<div style={{padding:"8px 14px",background:"#E0F2FE",border:"1px solid #7DD3FC",borderRadius:8,marginBottom:12,fontSize:12,color:"#0369A1"}}>
      Auditor mode active — PHI fields are masked in the FHIR preview below.
    </div>}
    <div className="card">
      <div className="chd">FHIR R4 Resources (Preview)</div>
      <div style={{fontSize:12,color:C.g500,marginBottom:12}}>Patient, Practitioner, and Observation resources generated from intake data.</div>
      {(()=>{const ts=sharedIntake?.plan?.at||new Date().toISOString();
        const ptId=sharedIntake?`PT-${Array.from(new Uint8Array(new TextEncoder().encode(sharedIntake.name||""))).reduce((h,b)=>((h<<5)-h+b)>>>0,5381).toString(16).slice(0,8).toUpperCase()}`:"PT-pending";
        const fam=auditorMode?"[REDACTED]":(sharedIntake?.ans?.name_last||"[Pending]");
        const giv=auditorMode?"[REDACTED]":(sharedIntake?.ans?.name_first||"[Pending]");
        const dob=auditorMode?"[REDACTED]":(sharedIntake?.ans?.dob||"[Pending]");
        const insId=auditorMode?"[REDACTED]":(sharedIntake?.ans?.insurance_id||"[Pending]");
        return<pre style={{background:"#1E1E2E",color:"#CDD6F4",borderRadius:10,padding:16,fontSize:11,overflow:"auto",maxHeight:500,lineHeight:1.6,fontFamily:"'Courier New',monospace"}}>{JSON.stringify({
        resourceType:"Bundle",id:`bundle-${ptId}`,type:"collection",timestamp:ts,
        entry:[
          {fullUrl:`urn:uuid:${ptId}`,resource:{
            resourceType:"Patient",
            id:ptId,
            name:[{use:"official",family:fam,given:[giv]}],
            birthDate:dob,
            address:[{state:"UT",use:"home"}],
            identifier:[{system:"http://terminology.hl7.org/CodeSystem/v2-0203",type:{coding:[{system:"http://terminology.hl7.org/CodeSystem/v2-0203",code:"MB"}]},value:insId}],
            meta:{profile:["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"],lastUpdated:ts}
          }},
          {fullUrl:`urn:uuid:practitioner-${sharedIntake?.physicianNPI||"pending"}`,resource:{
            resourceType:"Practitioner",
            id:sharedIntake?.physicianNPI||"NPI-pending",
            name:[{text:auditorMode?"[REDACTED]":(sharedIntake?.physicianName||"[Pending Verification]")}],
            identifier:[{system:"http://hl7.org/fhir/sid/us-npi",value:sharedIntake?.physicianNPI||"[Pending]"}],
            meta:{profile:["http://hl7.org/fhir/us/core/StructureDefinition/us-core-practitioner"]}
          }},
          {fullUrl:"urn:uuid:obs-iciq",resource:{
            resourceType:"Observation",id:"iciq-score",
            status:"final",
            subject:{reference:`Patient/${ptId}`},
            category:[{coding:[{system:"http://terminology.hl7.org/CodeSystem/observation-category",code:"survey"}]}],
            code:{coding:[{system:"http://snomed.info/sct",code:"129007004",display:"Urinary incontinence assessment"}],text:"ICIQ-UI Short Form"},
            valueInteger:sharedIntake?.iciq?.total??0,
            interpretation:[{text:sharedIntake?.iciq?.severity||"Pending"}],
            effectiveDateTime:ts,
            meta:{profile:["http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-survey"]}
          }},
          {fullUrl:"urn:uuid:obs-pain",resource:{
            resourceType:"Observation",id:"pain-score",
            status:"final",
            subject:{reference:`Patient/${ptId}`},
            category:[{coding:[{system:"http://terminology.hl7.org/CodeSystem/observation-category",code:"survey"}]}],
            code:{coding:[{system:"http://loinc.org",code:"72514-3",display:"Pain severity - 0-10 verbal numeric rating"}],text:"Pelvic Pain Composite Score"},
            valueQuantity:{value:sharedIntake?.pain?.composite??0,unit:"/10"},
            interpretation:[{text:sharedIntake?.pain?.severity||"Pending"}],
            effectiveDateTime:ts
          }},
          {fullUrl:"urn:uuid:obs-gupi",resource:{
            resourceType:"Observation",id:"gupi-score",
            status:"final",
            subject:{reference:`Patient/${ptId}`},
            category:[{coding:[{system:"http://terminology.hl7.org/CodeSystem/observation-category",code:"survey"}]}],
            code:{coding:[{system:"http://snomed.info/sct",code:"423083003",display:"Genitourinary pain assessment"}],text:"GUPI - Genitourinary Pain Index"},
            valueInteger:sharedIntake?.gupi?.total??0,
            interpretation:[{text:sharedIntake?.gupi?.severity||"Pending"}],
            effectiveDateTime:ts
          }}
        ]
      },null,2)}</pre>})()}
    </div>
    </>}

    {/* Outcome Research Tab */}
    {viewMode==="outcomes"&&<>
    {(()=>{
      const recs=OUTCOME_RECORDS;const completed=recs.filter(r=>r.outcome!==null);
      const meaningful=completed.filter(r=>r.outcome.clinically_meaningful);
      const meanDelta=completed.length>0?Math.round(completed.reduce((s,r)=>s+r.outcome.iciq_delta,0)/completed.length*10)/10:0;
      const analysis=analyzePatterns(OUTCOME_RECORDS);
      const sigColors={green:C.gn,yellow:C.or,gray:C.g400};
      return<>
      <div className="four"style={{marginBottom:16}}>
        <div className="sc"><div className="scl2">Total Records</div><div className="scv2"style={{color:C.purp}}>{recs.length}</div></div>
        <div className="sc"><div className="scl2">Completed</div><div className="scv2"style={{color:C.blue}}>{completed.length}</div></div>
        <div className="sc"><div className="scl2">Clin. Meaningful</div><div className="scv2"style={{color:C.gn}}>{meaningful.length}</div><div className="scs">{completed.length>0?Math.round(meaningful.length/completed.length*100):0}%</div></div>
        <div className="sc"><div className="scl2">Mean ICIQ Delta</div><div className="scv2"style={{color:meanDelta>0?C.gn:C.or}}>{meanDelta>0?"+":""}{meanDelta}</div></div>
      </div>
      {recs.length===0&&<div className="card"style={{textAlign:"center",padding:40}}>
        <div style={{fontSize:32,marginBottom:8}}>📊</div>
        <div style={{color:C.g500,fontSize:14}}>No outcome records yet. Records are created when a PT approves a plan.</div>
      </div>}
      {recs.length>0&&<div className="card"style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",background:C.g50,borderBottom:`1px solid ${C.g200}`,fontWeight:600,fontSize:13,color:C.purp}}>Outcome Records ({recs.length})</div>
        <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr 1fr 1fr 1fr",padding:"8px 16px",background:C.g50,borderBottom:`1px solid ${C.g200}`,fontSize:10,fontWeight:600,color:C.g500,textTransform:"uppercase",letterSpacing:1}}>
          <span>Record</span><span>Tier</span><span>ICIQ Base</span><span>Status</span><span>ICIQ Delta</span><span>NPS</span>
        </div>
        {recs.map(r=><div key={r.id}style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr 1fr 1fr 1fr",padding:"10px 16px",borderBottom:`1px solid ${C.g100}`,fontSize:12,alignItems:"center"}}>
          <span style={{fontWeight:500,fontSize:11,color:C.g600}}>{r.id.slice(0,12)}</span>
          <span className="bdg"style={{background:`${C.blue}15`,color:C.blue,justifySelf:"start"}}>{r.treatment.tier}</span>
          <span>{r.baseline.iciq.total}/21</span>
          <span className="bdg"style={{background:r.outcome?`${C.gn}15`:`${C.or}15`,color:r.outcome?C.gn:C.or,justifySelf:"start"}}>{r.outcome?"Complete":"Pending"}</span>
          <span style={{fontWeight:700,color:r.outcome?(r.outcome.iciq_delta>0?C.gn:r.outcome.iciq_delta<0?C.rd:C.or):C.g400}}>{r.outcome?((r.outcome.iciq_delta>0?"+":"")+r.outcome.iciq_delta):"\u2014"}</span>
          <span>{r.outcome?r.outcome.nps+"/10":"\u2014"}</span>
        </div>)}
      </div>}
      {completed.length>0&&<div className="card"style={{marginTop:16}}>
        <div className="chd">Outcomes by Tier</div>
        <div className="three">
          {["Beginner","Moderate","Advanced"].map(t=>{const tc=completed.filter(r=>r.treatment.tier===t);const md=tc.length>0?Math.round(tc.reduce((s,r)=>s+r.outcome.iciq_delta,0)/tc.length*10)/10:0;
            return<div key={t}className="sc"><div className="scl2">{t}</div><div className="scv2"style={{color:md>0?C.gn:C.or}}>{md>0?"+":""}{md}</div><div className="scs">n={tc.length}</div></div>})}
        </div>
      </div>}
      {/* AI-PT Agreement Rate */}
      {recs.length>0&&(()=>{const ar=computeAgreementRate(recs);const modRecs=recs.filter(r=>r.treatment.pt_diffs&&(r.treatment.pt_diffs.exercises.length||r.treatment.pt_diffs.adjuncts.length||r.treatment.pt_diffs.goals.length));
        return<div className="card"style={{marginTop:16}}>
        <div className="chd">AI-PT Agreement Rate</div>
        <div className="three"style={{marginBottom:12}}>
          <div className="sc"><div className="scl2">Agreement</div><div className="scv2"style={{color:ar.rate>=95?C.gn:ar.rate>=85?C.or:C.rd}}>{ar.rate}%</div><div className="scs">{ar.unmodified}/{ar.total} unmodified</div></div>
          <div className="sc"><div className="scl2">Modified</div><div className="scv2"style={{color:C.or}}>{ar.total-ar.unmodified}</div></div>
          <div className="sc"><div className="scl2">With Diffs</div><div className="scv2"style={{color:C.blue}}>{modRecs.length}</div><div className="scs">detailed tracking</div></div>
        </div>
        {modRecs.length>0&&<div style={{borderTop:`1px solid ${C.g200}`,paddingTop:12}}>
          <div style={{fontSize:12,fontWeight:600,color:C.g600,marginBottom:8}}>PT Modification Details</div>
          {modRecs.map(r=><div key={r.id}style={{padding:"8px 12px",marginBottom:6,background:C.g50,borderRadius:8,fontSize:11}}>
            <div style={{fontWeight:600,color:C.g700,marginBottom:4}}>{r.id.slice(0,12)} · {r.treatment.tier}</div>
            {r.treatment.pt_diffs.exercises.map((d,i)=><div key={"e"+i}style={{color:d.action==="removed"?C.rd:d.action==="added"?C.gn:C.or}}>Exercise {d.action}: {d.name}{d.changes?" ("+d.changes.join(", ")+")":""}{d.detail?" — "+d.detail:""}</div>)}
            {r.treatment.pt_diffs.adjuncts.map((d,i)=><div key={"a"+i}style={{color:d.action==="removed"?C.rd:d.action==="added"?C.gn:C.or}}>Adjunct {d.action}: {d.name}</div>)}
            {r.treatment.pt_diffs.goals.map((d,i)=><div key={"g"+i}style={{color:d.action==="removed"?C.rd:C.gn}}>Goal {d.action}: {d.text}</div>)}
          </div>)}
        </div>}
      </div>})()}
      {/* Research Signals — Biomarker Discovery */}
      <div className="card"style={{marginTop:16}}>
        <div className="chd">Research Signals (Biomarker Discovery)</div>
        <div style={{fontSize:12,color:C.g500,marginBottom:12}}>Hypothesis testing framework. Requires {analysis.required} completed outcome records. Currently: {analysis.n} records.</div>
        {!analysis.sufficient&&<div className="ra"style={{background:"#F0F4FF",borderLeft:`4px solid ${C.blue}`,borderRadius:8,padding:"10px 14px",color:"#1E40AF",fontSize:12}}>Insufficient data for signal analysis. {analysis.required-analysis.n} more completed records needed.</div>}
        {analysis.sufficient&&analysis.signals.map(s=><div key={s.biomarker_id}style={{padding:"12px 16px",borderBottom:`1px solid ${C.g100}`,display:"flex",gap:12,alignItems:"flex-start"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:sigColors[s.signal_strength]||C.g400,marginTop:6,flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontWeight:600,fontSize:13,color:C.g800}}>{s.name}</span><span className="bdg"style={{background:`${(sigColors[s.signal_strength]||C.g400)}15`,color:sigColors[s.signal_strength]||C.g400}}>{s.status}</span></div>
            <div style={{fontSize:11,color:C.g500,marginTop:2}}>{s.desc}</div>
            {s.status!=="insufficient"&&<div style={{display:"flex",gap:16,marginTop:6,fontSize:11,color:C.g600}}><span>n={s.cohort_size} vs {s.comparison_size}</span><span>Mean: {s.mean_match} vs {s.mean_comparison}</span><span>d={s.effect_size}</span><span>p~{s.p_estimate}</span></div>}
            {s.status==="insufficient"&&s.cohort_size>0&&<div style={{fontSize:11,color:C.g400,marginTop:4}}>Matched {s.cohort_size} records — need at least 5 per cohort</div>}
          </div>
        </div>)}
        <div style={{padding:"10px 16px",background:C.g50,fontSize:10,color:C.g400,borderTop:`1px solid ${C.g100}`}}>Signals are exploratory hypotheses, not validated predictions. Effect sizes (Cohen's d) and p-values are approximate. Full validation requires IRB-approved analysis.</div>
      </div>
      </>;
    })()}
    </>}

  </div>;
}
// Report Issue component — persistent in patient view
function ReportIssue({pView}){
  const[open,setOpen]=useState(false);
  const[step,setStep]=useState("menu");
  const[severity,setSeverity]=useState(5);
  const[isNew,setIsNew]=useState(true);
  const[techDesc,setTechDesc]=useState("");
  const[worseDesc,setWorseDesc]=useState("");
  const[painSeverity,setPainSeverity]=useState(5);
  const[adverseType,setAdverseType]=useState(null);
  const[adverseDetail,setAdverseDetail]=useState("");
  const[reviewNote,setReviewNote]=useState("");

  const openPanel=()=>{setOpen(true);setStep("menu");setSeverity(5);setIsNew(true);setTechDesc("");setWorseDesc("");setPainSeverity(5);setAdverseType(null);setAdverseDetail("");setReviewNote("")};
  const closePanel=()=>setOpen(false);

  const submit=(type)=>{
    const pt=sharedIntake?.name||"—";
    if(type==="worsening"){L("CLINICAL_REGRESSION_FLAG",{severity,symptomType:isNew?"new":"worsening",detail:worseDesc||undefined,patient:pt});if(sharedIntake?.plan?.review_flags&&!sharedIntake.plan.review_flags.some(f=>f.id==="CLINICAL_REGRESSION_REPORTED")){sharedIntake.plan.review_flags.push({id:"CLINICAL_REGRESSION_REPORTED",type:"triggered",label:"Worsening Reported"});notifyFlagChange()}}
    else if(type==="pain"){L("EXERCISE_PAIN_REPORT",{severity:painSeverity,context:"during_exercises",patient:pt})}
    else if(type==="adverse"){L("adverse_event_report",{category:adverseType,detail:adverseDetail,patient:pt});if(sharedIntake?.plan?.review_flags&&!sharedIntake.plan.review_flags.some(f=>f.id==="ADVERSE_EVENT")){sharedIntake.plan.review_flags.push({id:"ADVERSE_EVENT",type:"triggered",label:"Adverse Event Reported"});notifyFlagChange()}}
    else if(type==="clarity"){L("clinical_review_request",{category:"clarity",note:reviewNote||undefined,patient:pt})}
    else if(type==="optout"){L("clinical_review_request",{category:"optout",note:reviewNote||undefined,patient:pt})}
    else{L("TECHNICAL_ISSUE_REPORT",{description:techDesc||"No description provided",patient:pt})}
    setStep("done");
  };

  if(pView!=="done")return null;

  return<>
    <button onClick={()=>open?closePanel():openPanel()}aria-label="Report an issue"style={{background:"#FF4D8D",border:"none",color:"white",padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5,marginLeft:"auto"}}>Report Issue</button>

    {open&&<>
    <div onClick={closePanel}style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:199}}/>
    <div style={{position:"fixed",top:56,right:16,width:340,background:"white",borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,.15)",zIndex:200,border:`1px solid ${C.g200}`,animation:"fi .2s ease-out",maxHeight:"calc(100vh - 72px)",overflowY:"auto"}}>
      <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.g100}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontWeight:700,fontSize:14,color:C.purp}}>Report a Problem</span>
        <button onClick={closePanel}aria-label="Close"style={{cursor:"pointer",fontSize:18,color:C.g400,lineHeight:1,background:"none",border:"none",padding:0}}>x</button>
      </div>

      {step==="menu"&&<div style={{padding:16}}>
        {[["pain","I have pain during exercises",C.pink],["worsening","My symptoms are getting worse",C.rd],["adverse","I'm experiencing a new symptom, bleeding, or adverse reaction","#DC2626"],["clarity","I don't understand the instructions",C.or],["optout","I want to opt out of AI-assisted care",C.purp],["technical","Technical issue with the platform",C.blue]].map(([id,label,color],i)=>
          <div key={id}onClick={()=>setStep(id)}style={{padding:"12px 14px",border:`1px solid ${C.g200}`,borderRadius:8,marginBottom:8,cursor:"pointer",fontSize:13,color:C.g700,display:"flex",alignItems:"center",gap:10,transition:"all .15s"}}onMouseOver={e=>e.currentTarget.style.borderColor=color}onMouseOut={e=>e.currentTarget.style.borderColor=C.g200}>
            <span style={{fontSize:18}}>{i+1}.</span> {label}
          </div>
        )}
      </div>}

      {step==="pain"&&<div style={{padding:16}}>
        <div style={{fontSize:13,fontWeight:600,color:C.g800,marginBottom:8}}>Pain During Exercises</div>
        <div style={{fontSize:12,color:C.g500,lineHeight:1.6,marginBottom:12}}>If you're experiencing pain above 3/10 during your exercises, stop immediately. Your PT will be notified.</div>
        <div style={{marginBottom:14}}>
          <div className="il">Pain level (0-10)</div>
          <div style={{textAlign:"center",fontSize:28,fontWeight:700,color:C.rd}}>{painSeverity}</div>
          <input type="range"min={0}max={10}value={painSeverity}onChange={e=>setPainSeverity(parseInt(e.target.value))}style={{width:"100%",appearance:"none",height:6,borderRadius:3,background:C.g200,outline:"none"}}/>
        </div>
        <button className="btn bpk bsm"onClick={()=>submit("pain")}style={{width:"100%",justifyContent:"center"}}>Submit Report</button>
      </div>}

      {step==="worsening"&&<div style={{padding:16}}>
        <div style={{fontSize:13,fontWeight:600,color:C.g800,marginBottom:12}}>Symptom Regression Report</div>
        <div style={{marginBottom:14}}>
          <div className="il">Severity (0 = minimal, 10 = severe)</div>
          <div style={{textAlign:"center",fontSize:28,fontWeight:700,color:C.rd}}>{severity}</div>
          <input type="range"min={0}max={10}value={severity}onChange={e=>setSeverity(parseInt(e.target.value))}style={{width:"100%",appearance:"none",height:6,borderRadius:3,background:C.g200,outline:"none"}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.g400}}><span>Minimal</span><span>Severe</span></div>
        </div>
        <div style={{marginBottom:14}}>
          <div className="il">Is this symptom...</div>
          <div style={{display:"flex",gap:8}}>
            <button className={`ob ${isNew?"s":""}`}style={{flex:1,textAlign:"center"}}onClick={()=>setIsNew(true)}>New symptom</button>
            <button className={`ob ${!isNew?"s":""}`}style={{flex:1,textAlign:"center"}}onClick={()=>setIsNew(false)}>Getting worse</button>
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <div className="il">What is happening? (optional)</div>
          <textarea className="inp"value={worseDesc}onChange={e=>setWorseDesc(e.target.value)}placeholder="Describe what symptom is worsening..."style={{minHeight:60,resize:"vertical"}}/>
        </div>
        <button className="btn brd bsm"onClick={()=>submit("worsening")}style={{width:"100%",justifyContent:"center"}}>Flag for Clinical Review</button>
      </div>}

      {step==="adverse"&&<div style={{padding:16}}>
        <div style={{fontSize:13,fontWeight:600,color:"#991B1B",marginBottom:8}}>Report a Problem or Adverse Event</div>
        <div style={{fontSize:12,color:C.g500,lineHeight:1.6,marginBottom:12}}>Your clinical team will be notified immediately.</div>
        {[["new_symptom","I'm experiencing a new symptom"],["bleeding","I'm experiencing bleeding"],["adverse","I had an adverse reaction to treatment"],["other","Other problem"]].map(([val,label])=>
          <label key={val}style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:8,cursor:"pointer",fontSize:13,color:"#374151"}}><input type="radio"name="adverse_type"checked={adverseType===val}onChange={()=>setAdverseType(val)}style={{marginTop:2}}/>{label}</label>)}
        <textarea className="inp"value={adverseDetail}onChange={e=>setAdverseDetail(e.target.value)}placeholder="Please describe what happened..."style={{marginBottom:10,minHeight:60,resize:"vertical"}}/>
        <button className="btn brd bsm"disabled={!adverseType}onClick={()=>submit("adverse")}style={{width:"100%",justifyContent:"center",opacity:adverseType?1:.5}}>Submit Report</button>
      </div>}

      {step==="clarity"&&<div style={{padding:16}}>
        <div style={{fontSize:13,fontWeight:600,color:C.g800,marginBottom:8}}>I Need Clarification</div>
        <div style={{fontSize:12,color:C.g500,lineHeight:1.6,marginBottom:12}}>Your Physical Therapist will follow up to explain your care plan in more detail.</div>
        <textarea className="inp"value={reviewNote}onChange={e=>setReviewNote(e.target.value)}placeholder="What part of your care plan is unclear? (optional)"style={{marginBottom:10,minHeight:60,resize:"vertical"}}/>
        <button className="btn bpu bsm"onClick={()=>submit("clarity")}style={{width:"100%",justifyContent:"center"}}>Request PT Follow-Up</button>
      </div>}

      {step==="optout"&&<div style={{padding:16}}>
        <div style={{fontSize:13,fontWeight:600,color:C.g800,marginBottom:8}}>Opt Out of AI-Assisted Care</div>
        <div style={{fontSize:12,color:C.g500,lineHeight:1.6,marginBottom:12}}>You have the right to request that a Physical Therapist handle your care without AI assistance. A PT will contact you to discuss alternatives.</div>
        <textarea className="inp"value={reviewNote}onChange={e=>setReviewNote(e.target.value)}placeholder="Any additional context? (optional)"style={{marginBottom:10,minHeight:60,resize:"vertical"}}/>
        <button className="btn bpu bsm"onClick={()=>submit("optout")}style={{width:"100%",justifyContent:"center"}}>Request Opt-Out Review</button>
      </div>}

      {step==="technical"&&<div style={{padding:16}}>
        <div style={{fontSize:13,fontWeight:600,color:C.g800,marginBottom:8}}>Technical Issue</div>
        <textarea className="inp"placeholder="Describe the issue..."value={techDesc}onChange={e=>setTechDesc(e.target.value)}style={{marginBottom:10,minHeight:60,resize:"vertical"}}/>
        <button className="btn bbl bsm"onClick={()=>submit("technical")}style={{width:"100%",justifyContent:"center"}}>Submit Report</button>
      </div>}

      {step==="done"&&<div style={{padding:24,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>✓</div>
        <div style={{fontSize:14,fontWeight:600,color:"#166534",marginBottom:4}}>Report Submitted</div>
        <div style={{fontSize:12,color:C.g500}}>Your care team has been notified and will follow up.</div>
        <button className="btn bo bsm"onClick={closePanel}style={{marginTop:12}}>Close</button>
      </div>}
    </div>
    </>}
  </>;
}

// MAIN APP — Three Views
function PasswordGate({role,onAuth}){
  const[email,setEmail]=useState("");const[pw,setPw]=useState("");
  const[loading,setLoading]=useState(false);const[errMsg,setErrMsg]=useState("");
  const genTok=()=>(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^(crypto.getRandomValues(new Uint8Array(1))[0]&(15>>c/4))).toString(16));
  const submit=async()=>{if(loading)return;setLoading(true);setErrMsg("");try{const tok=genTok();const sessionArgs={userId:role+"_user",email:role+"@expect.care",sessionToken:tok,expiresAt:Date.now()+30*60*1000,createdAt:new Date().toISOString()};if(role==="pt"){sessionArgs.email=email;sessionArgs.password=pw}else{sessionArgs.accessCode=pw}await db("createSession",sessionArgs,{throw:true});ptSessionToken=tok;localStorage.setItem("expect_session",tok);const sess=await db("getSessionByToken",{sessionToken:tok});if(sess&&sess.ptName){ptIdentity={email:sess.email,name:sess.ptName,userId:sess.userId}}L(role+"_login",{email:role==="pt"?email:undefined});onAuth()}catch(e){const msg=e.message||"";if(msg.includes("Invalid")){setErrMsg(role==="pt"?"Invalid email or password.":"Incorrect access code.")}else{setErrMsg("Unable to connect. Please try again later.")}setPw("");setLoading(false)}};
  const isPt=role==="pt";
  return<div className="mn"><div className="card fi"style={{maxWidth:400,margin:"80px auto",textAlign:"center",padding:32}}>
    <div style={{fontSize:20,fontWeight:700,color:C.purp,marginBottom:8}}>{isPt?"PT Provider":"OAIP"} Portal</div>
    <p style={{fontSize:13,color:C.g500,marginBottom:20}}>{isPt?"Sign in with your provider account.":"Enter the oversight access code to continue."}</p>
    {errMsg&&<div style={{color:C.rd,fontSize:12,marginBottom:12}}>{errMsg}</div>}
    {isPt&&<input type="email"className="inp"value={email}onChange={e=>{setEmail(e.target.value);setErrMsg("")}}onKeyDown={e=>e.key==="Enter"&&submit()}placeholder="Email address"style={{textAlign:"center",marginBottom:10}}disabled={loading}/>}
    <input type="password"className="inp"value={pw}onChange={e=>{setPw(e.target.value);setErrMsg("")}}onKeyDown={e=>e.key==="Enter"&&submit()}placeholder={isPt?"Password":"Access code"}style={{textAlign:"center",marginBottom:16}}disabled={loading}/>
    <button className="btn bbl"onClick={submit}disabled={loading||(isPt&&!email)}style={{width:"100%",justifyContent:"center",opacity:loading?.6:1}}>{loading?"Verifying...":"Sign In"}</button>
  </div></div>;
}

function App(){
  const[mode,setMode]=useState("patient");const[pView,setPView]=useState("landing");const[landingEmail,setLandingEmail]=useState("");const[consentCk,setConsentCk]=useState({});
  const[ptView,setPtView]=useState("dash");
  const[rk,setRk]=useState(0);
  const mainRef=useRef(null);
  const[ptAuthed,setPtAuthed]=useState(false);
  const[oaipAuthed,setOaipAuthed]=useState(false);
  useEffect(()=>{(async()=>{try{const tok=localStorage.getItem("expect_session");if(!tok)return;const sess=await db("getSessionByToken",{sessionToken:tok});if(!sess||sess.expiresAt<Date.now()){localStorage.removeItem("expect_session");return}// Restore PT/OAIP session
if(sess.userId.startsWith("pt_")&&sess.userId!=="pt_user"){ptSessionToken=tok;ptIdentity={email:sess.email,name:sess.ptName||sess.email,userId:sess.userId};setPtAuthed(true);setMode("pt")}else if(sess.userId==="oaip_user"){ptSessionToken=tok;setOaipAuthed(true);setMode("oaip")}else{// Patient session
authSession={userId:sess.userId,email:sess.email,sessionToken:sess.sessionToken,expiresAt:sess.expiresAt,createdAt:sess.createdAt};const pt=await db("getPatientByUserId",{userId:sess.userId});if(pt){sharedIntake={ans:pt.ans,iciq:pt.iciq,pain:pt.pain,gupi:pt.gupi,fluts:pt.fluts,fsex:pt.fsex,plan:pt.plan,depressionFlag:pt.depressionFlag,prenatalFlag:pt.prenatalFlag,name:pt.name,physicianName:pt.physicianName,physicianFax:pt.physicianFax,physicianNPI:pt.physicianNPI,safetyAnswerChanged:pt.safetyAnswerChanged,safetyChanges:pt.safetyChanges,outcomeRecordId:pt.outcomeRecordId,week8:pt.week8,psiRefer:pt.psiRefer};setPView("done")}}const events=await db("listAuditEvents",{limit:500});if(events&&events.length>0){const existing=new Set(log.map(e=>e.id));events.forEach(e=>{if(!existing.has(e.eventId))log.push({id:e.eventId,ts:e.ts,type:e.type,...(e.details||{})})});log.sort((a,b)=>b.ts.localeCompare(a.ts));_lid=Math.max(_lid,events.length)}}catch(e){console.warn("[hydrate]",e)}})()},[]);
  const{warn,cd,rem,dismiss}=useSessionTimeout(()=>{if(ptSessionToken){db("deleteSession",{sessionToken:ptSessionToken});ptSessionToken=null}ptIdentity=null;localStorage.removeItem("expect_session");setPView("landing");setMode("patient");setPtAuthed(false);setOaipAuthed(false);setConsentCk({});setRk(r=>r+1)});
  const modes=[{id:"patient",l:"Patient View"},{id:"pt",l:"PT Provider View"},{id:"oaip",l:"Utah OAIP View"}];

  return<><style>{css}</style>
    {warn&&<SessionWarningModal cd={cd} onDismiss={dismiss}/>}
    <div className="topnav">
      <div className="topnav-logo"><img src="Expect_Logo_WhiteTM.png" alt="Expect Health" style={{height:"32px"}}/></div>
      <div className="topnav-tabs">
        {modes.map(m=><div key={m.id}className={`tt ${mode===m.id?"a":""}`}onClick={()=>{if(mode!==m.id)setMode(m.id)}}>{m.l}</div>)}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        {mode==="patient"&&authSession&&<span style={{fontSize:11,color:"rgba(255,255,255,.7)"}}>{authSession.email}</span>}
        {mode==="pt"&&ptIdentity&&<span style={{fontSize:11,color:"rgba(255,255,255,.7)"}}>{ptIdentity.name}</span>}
        {mode==="patient"&&rem!==null&&<span style={{fontSize:11,color:C.or,fontWeight:600}}>{Math.floor(rem/60)}:{String(rem%60).padStart(2,"0")}</span>}
        {mode==="patient"&&<ReportIssue pView={pView}/>}
      </div>
    </div>
    <div ref={mainRef} style={{overflowY:"auto",maxHeight:"calc(100vh - 56px)"}}>
      <div className="mn" key={"p"+rk} style={{display:mode==="patient"?"block":"none"}}>
        {pView==="landing"&&<LandingPage onDone={()=>setPView("consent")}/>}
        {pView==="consent"&&<Consent ck={consentCk} setCk={setConsentCk} onBack={()=>setPView("landing")} onDone={()=>{L("consent_completed");setPView("verify")}}/>}
        {pView==="verify"&&<IdentityVerify onBack={()=>setPView("consent")} onDone={(em)=>{setLandingEmail(em);L("email_verified",{email:em});setPView("intake")}}/>}
        {pView==="intake"&&<Intake onDone={()=>setPView("done")}mainRef={mainRef}initialEmail={landingEmail}/>}
        {pView==="done"&&sharedIntake&&sharedIntake.plan&&sharedIntake.plan.status!=="approved"&&<PatientWaiting name={sharedIntake.ans?.name_first}/>}
        {pView==="done"&&sharedIntake&&sharedIntake.plan&&sharedIntake.plan.status==="approved"&&<MyCareplan data={sharedIntake}/>}
        {pView==="done"&&(!sharedIntake||!sharedIntake.plan)&&<div className="fi"style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:48,marginBottom:16}}>&#x23F3;</div><div className="h1"style={{fontSize:22}}>Session Expired</div><p style={{fontSize:14,color:C.g500,maxWidth:400,margin:"12px auto",lineHeight:1.7}}>Your session could not be restored. Please start over.</p><button className="btn bpk"onClick={()=>setPView("landing")}>Start Over</button></div>}
      </div>
      {mode==="pt"&&(ptAuthed?<div className="mnw">
        <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:`1px solid ${C.g200}`}}>
          {[["dash","Dashboard"],["patients","Patients"],["audit","Audit Log"]].map(([id,l])=>
            <div key={id}style={{padding:"10px 18px",fontSize:13,fontWeight:ptView===id?600:400,color:ptView===id?C.purp:C.g400,borderBottom:`2px solid ${ptView===id?C.pink:"transparent"}`,cursor:"pointer"}}onClick={()=>setPtView(id)}>{l}</div>
          )}
        </div>
        {ptView==="dash"&&<PTDash/>}
        {ptView==="patients"&&<PTReview/>}
        {ptView==="audit"&&<AuditLog/>}
      </div>:<PasswordGate role="pt"onAuth={()=>setPtAuthed(true)}/>)}
      {mode==="oaip"&&(oaipAuthed?<div className="mnw"><OAIPView/></div>:<PasswordGate role="oaip"onAuth={()=>setOaipAuthed(true)}/>)}
    </div>
  </>;
}


ReactDOM.createRoot(document.getElementById('root')).render(<App />);
