"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Filters, Listing, Location } from "@/lib/aqar";
import { CATEGORIES, PRICE_PER_SQM_TYPES, ROOM_TYPES, generalSearchHasRequiredKeywords, hiddenNumericFilterKeys, hiddenResultColumnKeys, searchCategoriesFor } from "@/lib/aqar";
import { CITY_NAMES, canonicalCity, canonicalNeighborhood, neighborhoodSuggestions, placeSuggestions } from "@/lib/locations";
import { buildExcelExport } from "@/lib/excel-export";

const LEGACY_LAST_FILTERS_KEY = "aqar-last-filters-clean-v2";
const PULL_REFRESH_THRESHOLD = 72;
const PULL_REFRESH_MAX_DISTANCE = 116;
const defaults: Filters = { propertyType:"عام",purpose:"sale",locations:[{city:"الرياض",neighborhoods:[]}],keywords:[],mode:"strict",maxPages:2,maxListings:200,priceMin:0,priceMax:0,yieldMin:0,minMeters:0,minCount:0,minCommercialShops:0,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minAge:0,maxAge:0,minDensity:0,sqmMin:0,sqmMax:0 };
const nums: {key:keyof Filters;label:string;hint?:string}[] = [
  {key:"priceMin",label:"السعر من"},{key:"priceMax",label:"السعر إلى"},{key:"yieldMin",label:"أقل عائد%"},
  {key:"sqmMin",label:"سعر المتر من"},{key:"sqmMax",label:"سعر المتر إلى"},{key:"minDensity",label:"شقق لكل 100م²"},
  {key:"areaMin",label:"المساحة من"},{key:"areaMax",label:"المساحة إلى"},{key:"minStreet",label:"أقل عرض شارع"},
  {key:"minMeters",label:"أقل عدادات"},{key:"minCount",label:"أقل شقق / غرف"},{key:"minCommercialShops",label:"أقل محلات تجارية"},
  {key:"minAge",label:"أقل عمر"},{key:"maxAge",label:"أقصى عمر"},{key:"minFloors",label:"أقل أدوار"},
];
type SavedSet={id:number;name:string;propertyType:string;createdAt:string;count:number;resultsJson:string};
type Profile={id:number;name:string;filtersJson:string};
type SearchSource={category:string;city:string;neighborhood:string;page:number};
type TrialStatus={limit:number;used:number;remaining:number;globalLimit:number;globalUsed:number;globalRemaining:number;canStart:boolean};
type ResultSaveFeedback={tone:"working"|"success"|"error";text:string};
const fmt=(v:number|null,d=0)=>v==null?"غير مذكور":new Intl.NumberFormat("ar-SA",{maximumFractionDigits:d}).format(v);
const inputNumber=(value:unknown)=>Number(value)||0;
function automaticPageCount(filters:Filters,locations:Location[],maxListings:number){
  const scopes=Math.max(1,locations.reduce((total,location)=>total+Math.max(1,location.neighborhoods.length),0));
  const categoryCount=Math.max(1,searchCategoriesFor(filters.propertyType,filters.purpose,filters.keywords).length);
  const basePages=Math.max(1,Math.ceil(maxListings/(20*scopes*categoryCount)));
  return Math.min(25,basePages<=2?2:basePages+2);
}
function getDeviceId(){let id=localStorage.getItem("aqar-device-id");if(!id){id=crypto.randomUUID();localStorage.setItem("aqar-device-id",id)}return id}
function deviceHeaders(json=false){return {"x-aqar-device-id":getDeviceId(),...(json?{"content-type":"application/json"}:{})}}
function keywordsFromDraft(value:string){return value.split(/[،,]/).map(item=>item.trim()).filter(Boolean)}

export default function Home(){
  const [filters,setFilters]=useState<Filters>(defaults),[results,setResults]=useState<Listing[]>([]),[busy,setBusy]=useState(false);
  const [savingResults,setSavingResults]=useState(false),[resultSaveFeedback,setResultSaveFeedback]=useState<ResultSaveFeedback|null>(null);
  const [exportingExcel,setExportingExcel]=useState(false);
  const [pullDistance,setPullDistance]=useState(0),[pullRefreshing,setPullRefreshing]=useState(false);
  const [message,setMessage]=useState(""),[progress,setProgress]=useState(0),[warnings,setWarnings]=useState<string[]>([]);
  const [tab,setTab]=useState<"search"|"saved">("search"),[sets,setSets]=useState<SavedSet[]>([]),[profiles,setProfiles]=useState<Profile[]>([]),[contextProfileId,setContextProfileId]=useState<number|null>(null);
  const [trial,setTrial]=useState<TrialStatus|null>(null);
  const [keywordDraft,setKeywordDraft]=useState("");
  const profileMenuRef=useRef<HTMLDetailsElement>(null);
  const pullDistanceRef=useRef(0),pullGesture=useRef<{startX:number;startY:number;vertical:boolean;cancelled:boolean}|null>(null),refreshTimer=useRef<number|null>(null);
  useEffect(()=>{const timer=setTimeout(()=>{getDeviceId();localStorage.removeItem(LEGACY_LAST_FILTERS_KEY);void loadProfiles();void loadTrialStatus()},0);return()=>clearTimeout(timer)},[]);
  useEffect(()=>{
    const updatePullDistance=(distance:number)=>{pullDistanceRef.current=distance;setPullDistance(distance)};
    const cancelPull=()=>{pullGesture.current=null;updatePullDistance(0)};
    const start=(event:TouchEvent)=>{if(refreshTimer.current!==null||event.touches.length!==1||window.scrollY>0)return;const touch=event.touches[0];pullGesture.current={startX:touch.clientX,startY:touch.clientY,vertical:false,cancelled:false}};
    const move=(event:TouchEvent)=>{const gesture=pullGesture.current;if(!gesture||event.touches.length!==1)return;const touch=event.touches[0],deltaX=touch.clientX-gesture.startX,deltaY=touch.clientY-gesture.startY;if(!gesture.vertical&&!gesture.cancelled&&Math.max(Math.abs(deltaX),Math.abs(deltaY))>=8){if(Math.abs(deltaX)>Math.abs(deltaY)){gesture.cancelled=true;updatePullDistance(0);return}gesture.vertical=true}if(gesture.cancelled||!gesture.vertical)return;if(deltaY<=0||window.scrollY>0){cancelPull();return}event.preventDefault();updatePullDistance(Math.min(PULL_REFRESH_MAX_DISTANCE,Math.round(deltaY*.5)))};
    const finish=()=>{if(!pullGesture.current)return;pullGesture.current=null;if(pullDistanceRef.current>=PULL_REFRESH_THRESHOLD){setPullRefreshing(true);updatePullDistance(PULL_REFRESH_THRESHOLD);refreshTimer.current=window.setTimeout(()=>window.location.reload(),220)}else updatePullDistance(0)};
    window.addEventListener("touchstart",start,{passive:true});window.addEventListener("touchmove",move,{passive:false});window.addEventListener("touchend",finish,{passive:true});window.addEventListener("touchcancel",cancelPull,{passive:true});
    return()=>{window.removeEventListener("touchstart",start);window.removeEventListener("touchmove",move);window.removeEventListener("touchend",finish);window.removeEventListener("touchcancel",cancelPull);if(refreshTimer.current!==null)window.clearTimeout(refreshTimer.current)};
  },[]);
  const trialBlocked=trial?.remaining===0||trial?.globalRemaining===0;
  const countLabel=filters.propertyType==="عام"?"أقل شقق / غرف":ROOM_TYPES.has(filters.propertyType)?"أقل غرف (مع المجلس والمقلط)":"أقل شقق";
  const rentalSearch=filters.purpose==="rent";
  const hiddenNumericKeys=hiddenNumericFilterKeys(filters.propertyType,filters.purpose);
  const numericLabel=(key:keyof Filters)=>key==="minCount"?countLabel:nums.find(item=>item.key===key)?.label||String(key);
  const numericVisible=(key:keyof Filters)=>!hiddenNumericKeys.has(key)&&(!(["sqmMin","sqmMax"] as (keyof Filters)[]).includes(key)||PRICE_PER_SQM_TYPES.has(filters.propertyType));
  const ageCompanionKey:keyof Filters|null=numericVisible("minDensity")?"minDensity":null;
  const componentKeys=(["minMeters","minCount","minCommercialShops"] as (keyof Filters)[]).filter(key=>numericVisible(key));
  const minimumGroupItems:{key:keyof Filters;label:string}[]=[{key:"minStreet",label:"عرض شارع"},{key:"minFloors",label:"أدوار"},{key:"yieldMin",label:"عائد%"}].filter(item=>numericVisible(item.key));
  function update<K extends keyof Filters>(key:K,value:Filters[K]){setFilters(f=>({...f,[key]:value}))}
  function addLocation(){update("locations",[...filters.locations,{city:"",neighborhoods:[]}])}
  function changeLocation(i:number,key:"city"|"neighborhoods",value:string){const next=filters.locations.map((l,j)=>j===i?{...l,[key]:key==="neighborhoods"?value.split(/[،,]/).map(x=>x.trim()).filter(Boolean):value}:l);update("locations",next as Location[])}
  function changeKeywordDraft(value:string){setKeywordDraft(value);update("keywords",keywordsFromDraft(value))}
  function verticalLabelSize(label:string){return label.length>12?"numericVerticalLong":label.length>6?"numericVerticalMedium":"numericVerticalShort"}
  function numericField(key:keyof Filters,label=numericLabel(key)){const fromLabel=label==="من";return <label className={`numericInlineField ${fromLabel?"numericFromField":""}`} key={String(key)}>{fromLabel?<span className="numericFromLabel">{label}</span>:<span className={`numericVerticalLabel ${verticalLabelSize(label)}`}><span>{label}</span></span>}<input inputMode="decimal" type="number" min="0" value={String(filters[key]||"")} onChange={e=>update(key,inputNumber(e.target.value) as never)}/></label>}
  function numericMinimumField(key:keyof Filters,label:string){return <label className="numericMinimumField" key={String(key)}><span>{label}</span><input aria-label={`أقل ${label}`} inputMode="decimal" type="number" min="0" value={String(filters[key]||"")} onChange={e=>update(key,inputNumber(e.target.value) as never)}/></label>}
  function numericRange(title:string,fromKey:keyof Filters,toKey:keyof Filters,fromLabel="من",toLabel="إلى"){return <div className="numericRangeGroup"><span className={`numericRangeTitle ${verticalLabelSize(title)}`}><span>{title}</span></span><div className="numericRangeInputs">{numericField(fromKey,fromLabel)}{numericField(toKey,toLabel)}</div></div>}
  function clearFields(){setFilters({...defaults,locations:[{city:"",neighborhoods:[]}]});setKeywordDraft("");setResults([]);setResultSaveFeedback(null);setContextProfileId(null);setMessage("تم مسح جميع حقول البحث.")}
  async function loadProfiles(){try{const r=await fetch("/api/profiles",{headers:deviceHeaders()});const data=await r.json() as {profiles:Profile[]};if(r.ok)setProfiles(data.profiles)}catch{/* يعمل البحث حتى لو تعذر التخزين */}}
  async function loadTrialStatus(){try{const r=await fetch("/api/trial",{cache:"no-store",headers:deviceHeaders()});const data=await r.json() as TrialStatus;if(r.ok)setTrial(data)}catch{/* يتحقق الخادم مرة أخرى عند بدء البحث */}}
  async function saveProfile(){const name=prompt("اسم مواصفات البحث:");if(!name)return;const r=await fetch("/api/profiles",{method:"POST",headers:deviceHeaders(true),body:JSON.stringify({name,filters})});if(r.ok){await loadProfiles();setMessage("حُفظت مواصفات البحث.")}else setMessage("تعذر حفظ المواصفات.")}
  function loadProfile(profile:Profile){const loaded={...defaults,...JSON.parse(profile.filtersJson)} as Filters;setFilters(loaded);setKeywordDraft(loaded.keywords.join("، "));setContextProfileId(null);profileMenuRef.current?.removeAttribute("open");setMessage(`تم تحميل: ${profile.name}`)}
  async function renameProfile(profile:Profile){const name=prompt("المسمى الجديد لشروط البحث:",profile.name)?.trim();if(!name||name===profile.name){setContextProfileId(null);return}const r=await fetch(`/api/profiles?id=${profile.id}`,{method:"PUT",headers:deviceHeaders(true),body:JSON.stringify({name})});if(r.ok){await loadProfiles();setContextProfileId(null);profileMenuRef.current?.removeAttribute("open");setMessage(`تم تعديل المسمى إلى: ${name}`)}else setMessage("تعذر تعديل مسمى شروط البحث.")}
  async function deleteProfile(profile:Profile){if(!confirm(`هل تريد حذف شروط البحث المحفوظة «${profile.name}»؟`))return;const r=await fetch(`/api/profiles?id=${profile.id}`,{method:"DELETE",headers:deviceHeaders()});if(r.ok){await loadProfiles();setContextProfileId(null);profileMenuRef.current?.removeAttribute("open");setMessage(`حُذفت شروط البحث: ${profile.name}`)}else setMessage("تعذر حذف شروط البحث.")}
  async function search(){
    const locations=filters.locations.filter(l=>l.city.trim()).map(location=>{const city=canonicalCity(location.city);return{city,neighborhoods:location.neighborhoods.map(value=>canonicalNeighborhood(city,value)).filter(Boolean)}}),maxListings=Math.min(500,Math.max(5,filters.maxListings));
    const clean={...filters,...Object.fromEntries([...hiddenNumericKeys].map(key=>[key,0])),locations,maxListings,maxPages:automaticPageCount(filters,locations,maxListings),...(!PRICE_PER_SQM_TYPES.has(filters.propertyType)?{sqmMin:0,sqmMax:0}:{})} as Filters;
    if(!clean.locations.length){setMessage("أضف مدينة واحدة على الأقل.");return}
    if(clean.minAge>0&&clean.maxAge>0&&clean.minAge>clean.maxAge){setMessage("يجب ألا يتجاوز «أقل عمر» قيمة «أقصى عمر».");return}
    if(!generalSearchHasRequiredKeywords(clean.propertyType,clean.keywords)){setMessage("عند اختيار «عام»، اكتب نوع العقار أو وصفه في «كلمات للبحث» أولًا.");return}
    let trialToken="";
    try{const reservationResponse=await fetch("/api/trial",{method:"POST",headers:deviceHeaders()});const reservation=await reservationResponse.json() as {token?:string|null;status:TrialStatus;error?:string};setTrial(reservation.status);if(!reservationResponse.ok||!reservation.token){setMessage(reservation.error||"لا يمكن بدء بحث جديد الآن.");return}trialToken=reservation.token}catch{setMessage("تعذر التحقق من المحاولات التجريبية. حاول مرة أخرى.");return}
    setBusy(true);setResults([]);setResultSaveFeedback(null);setWarnings([]);setProgress(0);
    const found=new Map<string,Listing>(),checked=new Set<string>();let discovered=0,stoppedAt=-1,stopReason="";const allSources=(()=>{const a:SearchSource[]=[];for(let page=1;page<=clean.maxPages;page++)for(const category of searchCategoriesFor(clean.propertyType,clean.purpose,clean.keywords))for(const l of clean.locations)for(const neighborhood of(l.neighborhoods.length?l.neighborhoods:[""]))a.push({category,city:l.city,neighborhood,page});return a})();
    for(let i=0;i<allSources.length&&checked.size<clean.maxListings;i++){
      const s=allSources[i];setMessage(`قراءة ${s.city}${s.neighborhood?` — ${s.neighborhood}`:""}، صفحة ${s.page}…`);setProgress(Math.round(i/allSources.length*100));
      try{const r=await fetch("/api/search",{method:"POST",headers:{...deviceHeaders(true),"x-aqar-trial-token":trialToken},body:JSON.stringify({filters:clean,...s,remaining:Math.min(20,clean.maxListings-checked.size),excludeListingIds:[...checked]})});const data=await r.json() as {error?:string;discovered?:number;checkedListingIds?:string[];results?:Listing[];warnings?:string[]};if(!r.ok){if(r.status===401||r.status===403){stopReason=data.error||"انتهت صلاحية محاولة البحث.";stoppedAt=i;break}throw new Error(data.error||"تعذر البحث")}discovered+=data.discovered||0;for(const id of data.checkedListingIds||[])checked.add(id);for(const item of data.results||[])found.set(item.listingId,item);if(data.warnings?.length)setWarnings(w=>[...w,...data.warnings!].slice(-20));setResults([...found.values()].sort((a,b)=>b.score-a.score||(b.yieldPct||0)-(a.yieldPct||0)));const blocked=data.warnings?.find(w=>/429|منع|تحقق|تسجيل دخول/.test(w));if(blocked){stopReason=blocked;stoppedAt=i;break}}catch(e){const m=e instanceof Error?e.message:"تعذر البحث";setWarnings(w=>[...w,m]);if(/429|منع|تحقق|تسجيل دخول/.test(m)){stopReason=m;stoppedAt=i;break}}
    }
    if(stopReason){const pending=[...new Set(allSources.slice(stoppedAt).map(s=>s.city))];setProgress(Math.max(1,Math.round(stoppedAt/allSources.length*100)));setMessage(`توقف البحث قبل إكمال جميع المدن. فُحص ${checked.size} إعلان، وظهرت ${found.size} نتيجة. المدن غير المكتملة: ${pending.join("، ")}. انتظر عدة دقائق ثم أعد البحث.`)}else{setProgress(100);setMessage(`اكتمل البحث: اكتُشف ${discovered} رابطًا، وفُحص ${checked.size} إعلان، وظهرت ${found.size} نتيجة بعد التصفية.`)}setBusy(false);void loadTrialStatus();
  }
  async function exportExcel(){
    if(!results.length){setMessage("لا توجد نتائج لتصديرها إلى Excel.");return}
    setExportingExcel(true);setMessage("جارٍ إنشاء ملف Excel…");
    try{
      const {default:writeExcelFile}=await import("write-excel-file/browser");
      const {sheetData,sheetOptions}=buildExcelExport(results,{propertyType:filters.propertyType,purpose:filters.purpose,roomMode:ROOM_TYPES.has(filters.propertyType),includeSquareMeterPrice:PRICE_PER_SQM_TYPES.has(filters.propertyType),hiddenColumns:hiddenResultColumnKeys(filters.propertyType,filters.purpose)});
      const fileName=`نتائج-${filters.propertyType}-${new Date().toISOString().slice(0,10)}.xlsx`;
      await writeExcelFile(sheetData,sheetOptions,{fontFamily:"Arial",fontSize:11}).toFile(fileName);
      setMessage(`تم تصدير ${results.length} نتيجة إلى Excel.`);
    }catch{setMessage("تعذر إنشاء ملف Excel. حاول مجددًا.")}finally{setExportingExcel(false)}
  }
  async function saveResults(){if(!results.length||savingResults){if(!results.length)setMessage("لا توجد نتائج لحفظها.");return}const savedCount=results.length;setSavingResults(true);setResultSaveFeedback({tone:"working",text:`جارٍ حفظ ${savedCount} نتيجة…`});try{const r=await fetch("/api/saved-results",{method:"POST",headers:deviceHeaders(true),body:JSON.stringify({propertyType:filters.propertyType,results})});const d=await r.json().catch(()=>({})) as {set?:{name:string};error?:string};const text=r.ok?`حُفظت ${savedCount} نتيجة في المجموعة: ${d.set?.name||"نتائج محفوظة"}`:d.error||"تعذر حفظ النتائج. حاول مجددًا.";setResultSaveFeedback({tone:r.ok?"success":"error",text});setMessage(text)}catch{const text="تعذر حفظ النتائج بسبب مشكلة في الاتصال. حاول مجددًا.";setResultSaveFeedback({tone:"error",text});setMessage(text)}finally{setSavingResults(false)}}
  async function loadSets(){const r=await fetch("/api/saved-results",{headers:deviceHeaders()});const data=await r.json() as {sets:SavedSet[]};if(r.ok)setSets(data.sets);setTab("saved");setTimeout(()=>document.getElementById("saved-results")?.scrollIntoView({behavior:"smooth"}),50)}
  async function deleteSet(id:number){if(!confirm("هل تريد حذف هذه المجموعة المحفوظة؟"))return;await fetch(`/api/saved-results?id=${id}`,{method:"DELETE",headers:deviceHeaders()});await loadSets()}
  function openSet(s:SavedSet){setResults(JSON.parse(s.resultsJson));setResultSaveFeedback(null);setTab("search");setMessage(`تم فتح المجموعة: ${s.name}`);setTimeout(()=>document.getElementById("results")?.scrollIntoView({behavior:"smooth"}),50)}
  const pullReady=pullDistance>=PULL_REFRESH_THRESHOLD;
  return <main dir="rtl" className={`pullRefreshRoot ${pullDistance===0?"pullRefreshSettled":""}`} style={pullDistance?{transform:`translateY(${pullDistance}px)`}:undefined}>
    <div className={`pullRefreshIndicator ${pullReady?"ready":""} ${pullRefreshing?"refreshing":""}`} role="status" aria-live="polite" aria-hidden={pullDistance===0&&!pullRefreshing}><span className="pullRefreshIcon" aria-hidden="true">{pullRefreshing?"↻":pullReady?"↑":"↓"}</span><span>{pullRefreshing?"جارٍ التحديث…":pullReady?"أفلت للتحديث":"اسحب إلى الأسفل للتحديث"}</span></div>
    <header className="top"><div><h1>باحث عقار</h1></div></header>
    <section className="panel searchPanel"><div className="profileControls searchProfileControls"><details ref={profileMenuRef} className="profileMenu" onToggle={e=>{if(!e.currentTarget.open)setContextProfileId(null)}}><summary>شروط البحث المحفوظة</summary><div className="profileMenuList">{profiles.length?profiles.map(profile=><div className="profileItem" key={profile.id}><button type="button" className="profileName" onClick={()=>loadProfile(profile)} onContextMenu={event=>{event.preventDefault();setContextProfileId(profile.id)}}>{profile.name}</button>{contextProfileId===profile.id&&<div className="profileItemActions" role="menu"><button type="button" onClick={()=>renameProfile(profile)}>تعديل المسمى</button><button type="button" className="danger" onClick={()=>deleteProfile(profile)}>حذف</button></div>}</div>):<span className="profileEmpty">لا توجد شروط محفوظة</span>}</div></details><button className="ghost" onClick={saveProfile}>حفظ الشروط</button><button className="ghost" onClick={clearFields}>مسح الحقول</button></div>
      <div className="searchFields">
        <div className="formBlock choiceBlock"><div className="propertyKeywordsRow"><label>نوع العقار<select value={filters.propertyType} onChange={e=>update("propertyType",e.target.value)}>{Object.keys(CATEGORIES).map(x=><option key={x}>{x}</option>)}</select></label><label>كلمات للبحث<input value={keywordDraft} onChange={e=>changeKeywordDraft(e.target.value)} placeholder="مثل: تجاري، دوبلكس، مكيف، موقف"/>{filters.propertyType!=="عام"&&<small>يمكن استخدام الفاصلة العربية «،» أو الإنجليزية «,». وتُقبل المسافات داخل العبارة مثل: مدخل سيارة.</small>}</label></div><div className="choiceRow"><fieldset><legend>الغرض</legend><label className="radio"><input type="radio" checked={filters.purpose==="sale"} onChange={()=>update("purpose","sale")}/> بيع</label><label className="radio"><input type="radio" checked={filters.purpose==="rent"} onChange={()=>update("purpose","rent")}/> تأجير</label></fieldset><fieldset><legend>طريقة المطابقة</legend><label className="radio"><input type="radio" checked={filters.mode==="strict"} onChange={()=>update("mode","strict")}/> جميع الشروط</label><label className="radio"><input type="radio" checked={filters.mode==="near"} onChange={()=>update("mode","near")}/> القريبة والناقصة ±20%</label></fieldset></div></div>
        <div className="formBlock locationsBlock"><div className="locations">{filters.locations.map((location,index)=><LocationAutocomplete key={index} location={location} index={index} onChange={changeLocation} onAdd={index===filters.locations.length-1?addLocation:undefined} onRemove={()=>update("locations",filters.locations.length===1?[{city:"",neighborhoods:[]}]:filters.locations.filter((_,itemIndex)=>itemIndex!==index))}/>)}</div>{filters.locations.length===0&&<button type="button" aria-label="إضافة مدينة" className="icon locationAddIcon emptyLocationAdd" onClick={addLocation}>+</button>}</div>
        <div className="formBlock numericBlock"><div className="numericCompactGrid">
          <div className="numericPrimaryGrid"><div className="numericPrimaryRows">
            <div className="numericCompactRow numericCompactRowSolo">{numericRange("السعر","priceMin","priceMax")}</div>
            {numericVisible("sqmMin")&&<div className="numericCompactRow numericCompactRowSolo">{numericRange("سعر المتر","sqmMin","sqmMax")}</div>}
            <div className="numericCompactRow numericCompactRowSolo">{numericRange("المساحة","areaMin","areaMax")}</div>
          </div>{minimumGroupItems.length>0&&<fieldset className="numericMinimumGroup"><legend>أقل</legend><div className="numericMinimumFields">{minimumGroupItems.map(item=>numericMinimumField(item.key,item.label))}</div></fieldset>}</div>
          {componentKeys.length>0&&<div className="numericCompactComponents" style={{gridTemplateColumns:`repeat(${componentKeys.length},minmax(0,1fr))`}}>{componentKeys.map(key=>numericField(key))}</div>}
          {numericVisible("minAge")&&<div className={`numericCompactRow ${ageCompanionKey?"":"numericCompactRowSolo"}`}>{numericRange("العمر","minAge","maxAge","أقل","أقصى")}{ageCompanionKey&&numericField(ageCompanionKey)}</div>}
        </div></div>
      </div>
      <div className="trialNotice" aria-live="polite"><span>{trial?`المتبقي ${trial.remaining} من ${trial.limit} عملية بحث`:`المتبقي 100 من 100 عملية بحث`}</span>{trial?.globalRemaining===0?<span>انتهى الحد الإجمالي للتجربة.</span>:trial?.remaining===0?<span>استخدم هذا المتصفح جميع عملياته.</span>:null}</div>
      <div className="run"><label className="listingLimit runListingLimit">أقصى إعلانات<input type="number" min="5" max="500" value={filters.maxListings||""} onChange={e=>update("maxListings",inputNumber(e.target.value))}/></label><button className="primary" disabled={busy||trialBlocked} onClick={search}>{busy?"جارٍ البحث…":trial?.globalRemaining===0?"انتهت التجربة":trial?.remaining===0?"انتهى حد هذا المتصفح":"ابدأ البحث"}</button></div>{busy&&<progress value={progress} max="100"/>}{message&&<div className="status">{message}</div>}{warnings.length>0&&<details className="warnings"><summary>ملاحظات أثناء القراءة ({warnings.length})</summary>{warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
    </section>
    <Results rows={results} roomMode={ROOM_TYPES.has(filters.propertyType)} propertyType={filters.propertyType} purpose={filters.purpose} cities={[...new Set(filters.locations.map(location=>location.city.trim()).filter(Boolean))]} onSave={saveResults} saveDisabled={!results.length||savingResults} saving={savingResults} searchBusy={busy} saveFeedback={resultSaveFeedback} onShowSaved={loadSets} onExport={exportExcel} exportingExcel={exportingExcel}/>
    {tab==="saved"&&<section className="panel saved" id="saved-results"><div className="sectionHead"><div><h2>المجموعات المحفوظة</h2><p>لا تُحفظ النتائج إلا عند ضغط زر الحفظ.</p></div><button className="ghost" onClick={()=>setTab("search")}>إخفاء المجموعات</button></div>{sets.length?sets.map(s=><article className="savedRow" key={s.id}><div><strong>{s.name}</strong><small>{s.propertyType} · {s.count} نتيجة</small></div><div><button onClick={()=>openSet(s)}>فتح</button><button className="danger" onClick={()=>deleteSet(s.id)}>حذف المجموعة</button></div></article>):<div className="empty">لا توجد مجموعات محفوظة بعد.</div>}</section>}
    <footer>أداة مستقلة · لا تتجاوز تسجيل الدخول أو حماية موقع عقار · البيانات غير المذكورة تبقى «غير مذكور»</footer>
  </main>
}

function LocationAutocomplete({location,index,onChange,onAdd,onRemove}:{location:Location;index:number;onChange:(index:number,key:"city"|"neighborhoods",value:string)=>void;onAdd?:()=>void;onRemove:()=>void}){
  const [cityOpen,setCityOpen]=useState(false),[neighborhoodOpen,setNeighborhoodOpen]=useState(false),[editingNeighborhoods,setEditingNeighborhoods]=useState(false);
  const joinedNeighborhoods=location.neighborhoods.join("، "),[neighborhoodDraft,setNeighborhoodDraft]=useState(joinedNeighborhoods);
  useEffect(()=>{if(!editingNeighborhoods)setNeighborhoodDraft(joinedNeighborhoods)},[joinedNeighborhoods,editingNeighborhoods]);
  const cityQuery=location.city.trim();
  const cityMatches=!cityQuery||CITY_NAMES.includes(cityQuery)?CITY_NAMES:placeSuggestions(location.city,CITY_NAMES);
  const citySuggestionsId=`city-suggestions-${index}`;
  const neighborhoodToken=(neighborhoodDraft.split(/[،,]/).at(-1)||"").trim();
  const neighborhoodMatches=neighborhoodSuggestions(location.city,neighborhoodToken);
  function selectCity(value:string){onChange(index,"city",value);setCityOpen(false)}
  function finishCity(){onChange(index,"city",canonicalCity(location.city));setCityOpen(false)}
  function updateNeighborhoodDraft(value:string){setNeighborhoodDraft(value);onChange(index,"neighborhoods",value)}
  function selectNeighborhood(value:string){const parts=neighborhoodDraft.split(/[،,]/);parts[parts.length-1]=value;const joined=parts.map(item=>item.trim()).filter(Boolean).join("، ");setNeighborhoodDraft(joined);onChange(index,"neighborhoods",joined);setNeighborhoodOpen(false)}
  function finishNeighborhoods(){const joined=neighborhoodDraft.split(/[،,]/).map(value=>canonicalNeighborhood(location.city,value)).filter(Boolean).join("، ");setNeighborhoodDraft(joined);onChange(index,"neighborhoods",joined);setEditingNeighborhoods(false);setNeighborhoodOpen(false)}
  return <div className={`location ${onAdd?"locationHasAdd":""}`}>
    <label className="autocomplete">المدينة<input value={location.city} role="combobox" aria-expanded={cityOpen&&cityMatches.length>0} aria-controls={citySuggestionsId} autoComplete="off" onFocus={()=>setCityOpen(true)} onBlur={finishCity} onChange={event=>{onChange(index,"city",event.target.value);setCityOpen(true)}} onKeyDown={event=>{if(event.key==="Enter"&&cityMatches[0]){event.preventDefault();selectCity(cityMatches[0])}else if(event.key==="Escape")setCityOpen(false)}} placeholder="ابدأ الكتابة: جد…"/>{cityOpen&&cityMatches.length>0&&<span id={citySuggestionsId} className="suggestions" role="listbox">{cityMatches.map(value=><button type="button" key={value} role="option" onMouseDown={event=>event.preventDefault()} onClick={()=>selectCity(value)}>{value}</button>)}</span>}</label>
    <label className="autocomplete">الأحياء (بفواصل)<input value={neighborhoodDraft} autoComplete="off" onFocus={()=>{setEditingNeighborhoods(true);setNeighborhoodOpen(true)}} onBlur={finishNeighborhoods} onChange={event=>{updateNeighborhoodDraft(event.target.value);setNeighborhoodOpen(true)}} onKeyDown={event=>{if(event.key==="Enter"&&neighborhoodMatches[0]){event.preventDefault();selectNeighborhood(neighborhoodMatches[0])}else if(event.key==="Escape")setNeighborhoodOpen(false)}} placeholder={location.city?"ابدأ الكتابة: الروضة…":"اختر المدينة أولًا"}/>{neighborhoodOpen&&neighborhoodToken&&neighborhoodMatches.length>0&&<span className="suggestions" role="listbox">{neighborhoodMatches.map(value=><button type="button" key={value} role="option" onMouseDown={event=>event.preventDefault()} onClick={()=>selectNeighborhood(value)}>{value}</button>)}</span>}</label>
    {onAdd&&<button type="button" aria-label="إضافة مدينة" title="إضافة مدينة" className="icon locationAddIcon" onClick={onAdd}>+</button>}
    <button type="button" aria-label="حذف المدينة" className="icon danger" onClick={onRemove}>×</button>
  </div>
}

type ColumnKey="neighborhood"|"price"|"income"|"yieldPct"|"area"|"sqmPrice"|"count"|"housingUnits"|"commercialShops"|"totalRooms"|"meters"|"floors"|"street"|"density"|"age";
type TableColumn={key:ColumnKey;label:string;value:(row:Listing)=>string|number|null;render:(row:Listing)=>ReactNode;className?:string};
const DEFAULT_COLUMN_ORDER:ColumnKey[]=["neighborhood","count","housingUnits","commercialShops","totalRooms","meters","floors","street","area","price","income","yieldPct","density","age","sqmPrice"];
const COLUMN_ORDER_KEY="aqar-mobile-table-column-order-v7";
const COLUMN_WIDTHS_KEY="aqar-mobile-table-column-widths-v1";
const MAX_COLUMN_WIDTH=360;
const DEFAULT_COLUMN_WIDTHS:Record<ColumnKey,number>={neighborhood:132,price:92,income:108,yieldPct:76,area:88,sqmPrice:90,count:94,housingUnits:96,commercialShops:112,totalRooms:96,meters:76,floors:72,street:88,density:100,age:72};
const MIN_COLUMN_WIDTHS:Record<ColumnKey,number>={neighborhood:92,price:72,income:96,yieldPct:68,area:78,sqmPrice:78,count:72,housingUnits:90,commercialShops:100,totalRooms:88,meters:70,floors:68,street:80,density:90,age:68};
const clampColumnWidth=(key:ColumnKey,width:number)=>Math.max(MIN_COLUMN_WIDTHS[key],Math.min(MAX_COLUMN_WIDTH,Math.round(width)));

function Results({rows,roomMode,propertyType,purpose,cities,onSave,saveDisabled,saving,searchBusy,saveFeedback,onShowSaved,onExport,exportingExcel}:{rows:Listing[];roomMode:boolean;propertyType:string;purpose:Filters["purpose"];cities:string[];onSave:()=>void;saveDisabled:boolean;saving:boolean;searchBusy:boolean;saveFeedback:ResultSaveFeedback|null;onShowSaved:()=>void;onExport:()=>void;exportingExcel:boolean}){
  const [preferredStatus,setPreferredStatus]=useState<Listing["status"]|null>(null);
  const [sort,setSort]=useState<{key:ColumnKey;direction:"asc"|"desc"}|null>(null);
  const [columnOrder,setColumnOrder]=useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [columnOrderLoaded,setColumnOrderLoaded]=useState(false);
  const [columnWidths,setColumnWidths]=useState<Record<ColumnKey,number>>(DEFAULT_COLUMN_WIDTHS);
  const [columnWidthsLoaded,setColumnWidthsLoaded]=useState(false);
  const [draggedColumn,setDraggedColumn]=useState<ColumnKey|null>(null);
  const [dropTargetColumn,setDropTargetColumn]=useState<ColumnKey|null>(null);
  const pointerDrag=useRef<{key:ColumnKey;pointerId:number;target:ColumnKey}|null>(null);
  const resizeDrag=useRef<{key:ColumnKey;pointerId:number;startX:number;startWidth:number}|null>(null);
  const lastTouch=useRef<{listingId:string;at:number}|null>(null);
  const suppressDoubleOpenUntil=useRef(0);
  const suppressSortUntil=useRef(0);
  useEffect(()=>{try{const stored=JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY)||"[]") as ColumnKey[];if(stored.length===DEFAULT_COLUMN_ORDER.length&&DEFAULT_COLUMN_ORDER.every(key=>stored.includes(key)))setColumnOrder(stored)}catch{/* تجاهل ترتيب محلي تالف */}setColumnOrderLoaded(true)},[]);
  useEffect(()=>{if(columnOrderLoaded)localStorage.setItem(COLUMN_ORDER_KEY,JSON.stringify(columnOrder))},[columnOrder,columnOrderLoaded]);
  useEffect(()=>{try{const stored=JSON.parse(localStorage.getItem(COLUMN_WIDTHS_KEY)||"{}") as Partial<Record<ColumnKey,number>>;setColumnWidths(Object.fromEntries(DEFAULT_COLUMN_ORDER.map(key=>[key,typeof stored[key]==="number"?clampColumnWidth(key,stored[key]!):DEFAULT_COLUMN_WIDTHS[key]])) as Record<ColumnKey,number>)}catch{/* تجاهل مقاسات محلية تالفة */}setColumnWidthsLoaded(true)},[]);
  useEffect(()=>{if(columnWidthsLoaded)localStorage.setItem(COLUMN_WIDTHS_KEY,JSON.stringify(columnWidths))},[columnWidths,columnWidthsLoaded]);
  const rentalSearch=purpose==="rent";
  const mixedCountMode=propertyType==="عام";
  const rowUsesRooms=(row:Listing)=>roomMode||(mixedCountMode&&ROOM_TYPES.has(row.propertyType));
  const hiddenColumns=hiddenResultColumnKeys(propertyType,purpose);
  const columns:TableColumn[]=[
    {key:"neighborhood",label:"الحي",value:r=>r.neighborhood||null,render:r=>r.neighborhood||"غير مذكور"},
    {key:"price",label:"السعر",value:r=>r.price,render:r=>fmt(r.price),className:"money"},
    {key:"income",label:"الدخل السنوي",value:r=>r.income,render:r=>fmt(r.income)},
    {key:"yieldPct",label:"العائد",value:r=>r.yieldPct,render:r=>r.yieldPct==null?"غير مذكور":`${fmt(r.yieldPct,2)}%${r.incomeKind==="expected"?" متوقع":""}`},
    {key:"area",label:"المساحة",value:r=>r.area,render:r=>r.area==null?"غير مذكور":`${fmt(r.area,1)} م²`},
    {key:"sqmPrice",label:"سعر المتر",value:r=>r.sqmPrice,render:r=>r.sqmPrice==null?"":fmt(r.sqmPrice,2)},
    {key:"count",label:mixedCountMode?"شقق / غرف":roomMode?"الغرف":"الشقق",value:r=>rowUsesRooms(r)?r.rooms:r.apartments,render:r=>{const usesRooms=rowUsesRooms(r);return <>{fmt(usesRooms?r.rooms:r.apartments)}{usesRooms&&r.rooms!=null&&<small>{fmt(r.bedrooms)} غرفة + {r.majlis} مجلس + {r.maqlat} مقلط</small>}</>}},
    {key:"housingUnits",label:"وحدة سكنية",value:r=>r.housingUnits,render:r=>fmt(r.housingUnits)},
    {key:"commercialShops",label:"المحلات التجارية",value:r=>r.commercialShops,render:r=>fmt(r.commercialShops)},
    {key:"totalRooms",label:"إجمالي الغرف",value:r=>r.totalRooms,render:r=>fmt(r.totalRooms)},
    {key:"meters",label:"العدادات",value:r=>r.meters,render:r=>fmt(r.meters)},
    {key:"floors",label:"الأدوار",value:r=>r.floors,render:r=>fmt(r.floors)},
    {key:"street",label:"عرض الشارع",value:r=>r.street,render:r=>r.street==null?"غير مذكور":`${fmt(r.street)} م`},
    {key:"density",label:"شقق لكل 100م²",value:r=>r.density,render:r=>r.density==null?"غير مذكور":fmt(r.density,2)},
    {key:"age",label:"العمر",value:r=>r.age||null,render:r=>r.age?String(r.age).replace(/\s*(?:سنوات|سنة)\s*$/u,""):"غير مذكور"},
  ].filter(column=>(propertyType==="عمارة"||propertyType==="عام"||!["housingUnits","commercialShops","totalRooms"].includes(column.key))&&(PRICE_PER_SQM_TYPES.has(propertyType)||column.key!=="sqmPrice")&&(!rentalSearch||!["income","yieldPct"].includes(column.key))&&!hiddenColumns.has(column.key));
  const columnsByKey=new Map(columns.map(column=>[column.key,column]));
  const orderedColumns=columnOrder.map(key=>columnsByKey.get(key)).filter((column):column is TableColumn=>Boolean(column));
  const orderedRows=[...rows].sort((a,b)=>{
    const statusOrder=preferredStatus?Number(b.status===preferredStatus)-Number(a.status===preferredStatus):0;
    if(statusOrder)return statusOrder;
    if(!sort)return 0;
    const column=columnsByKey.get(sort.key),left=column?.value(a)??null,right=column?.value(b)??null;
    if(left==null&&right==null)return 0;if(left==null)return 1;if(right==null)return -1;
    const comparison=typeof left==="number"&&typeof right==="number"?left-right:String(left).localeCompare(String(right),"ar",{numeric:true,sensitivity:"base"});
    return sort.direction==="asc"?comparison:-comparison;
  });
  function sortBy(key:ColumnKey){if(Date.now()<suppressSortUntil.current)return;setSort(current=>current?.key===key?{key,direction:current.direction==="asc"?"desc":"asc"}:{key,direction:"asc"})}
  function moveColumnTo(source:ColumnKey,target:ColumnKey){if(source===target)return;setColumnOrder(order=>{const targetIndex=order.indexOf(target);if(targetIndex<0)return order;const next=order.filter(key=>key!==source);next.splice(targetIndex,0,source);return next})}
  function moveColumnByKeyboard(event:ReactKeyboardEvent<HTMLSpanElement>,key:ColumnKey){if(!["ArrowLeft","ArrowRight"].includes(event.key))return;event.preventDefault();event.stopPropagation();const currentIndex=orderedColumns.findIndex(column=>column.key===key),target=orderedColumns[currentIndex+(event.key==="ArrowLeft"?1:-1)];if(target)moveColumnTo(key,target.key)}
  function beginPointerDrag(event:ReactPointerEvent<HTMLSpanElement>,key:ColumnKey){if(event.button!==0)return;event.preventDefault();event.stopPropagation();pointerDrag.current={key,pointerId:event.pointerId,target:key};event.currentTarget.setPointerCapture(event.pointerId);setDraggedColumn(key);setDropTargetColumn(key);suppressSortUntil.current=Date.now()+500}
  function continuePointerDrag(event:ReactPointerEvent<HTMLSpanElement>){const drag=pointerDrag.current;if(!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>("th[data-column-key]")?.dataset.columnKey as ColumnKey|undefined;if(target&&target!==drag.target){drag.target=target;setDropTargetColumn(target)}}
  function endPointerDrag(event:ReactPointerEvent<HTMLSpanElement>,cancelled=false){const drag=pointerDrag.current;if(!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);if(!cancelled)moveColumnTo(drag.key,drag.target);pointerDrag.current=null;setDraggedColumn(null);setDropTargetColumn(null);suppressSortUntil.current=Date.now()+300}
  function beginColumnResize(event:ReactPointerEvent<HTMLSpanElement>,key:ColumnKey){if(event.button!==0)return;event.preventDefault();event.stopPropagation();resizeDrag.current={key,pointerId:event.pointerId,startX:event.clientX,startWidth:columnWidths[key]};event.currentTarget.setPointerCapture(event.pointerId);suppressSortUntil.current=Date.now()+500}
  function continueColumnResize(event:ReactPointerEvent<HTMLSpanElement>){const drag=resizeDrag.current;if(!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();const width=clampColumnWidth(drag.key,drag.startWidth+drag.startX-event.clientX);setColumnWidths(current=>current[drag.key]===width?current:{...current,[drag.key]:width})}
  function endColumnResize(event:ReactPointerEvent<HTMLSpanElement>){const drag=resizeDrag.current;if(!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);resizeDrag.current=null;suppressSortUntil.current=Date.now()+300}
  function resetColumnWidth(event:ReactMouseEvent<HTMLSpanElement>,key:ColumnKey){event.preventDefault();event.stopPropagation();setColumnWidths(current=>current[key]===DEFAULT_COLUMN_WIDTHS[key]?current:{...current,[key]:DEFAULT_COLUMN_WIDTHS[key]});suppressSortUntil.current=Date.now()+300}
  function resizeColumnByKeyboard(event:ReactKeyboardEvent<HTMLSpanElement>,key:ColumnKey){if(!["ArrowLeft","ArrowRight","Home"].includes(event.key))return;event.preventDefault();event.stopPropagation();const width=event.key==="Home"?DEFAULT_COLUMN_WIDTHS[key]:clampColumnWidth(key,columnWidths[key]+(event.key==="ArrowLeft"?10:-10));setColumnWidths(current=>({...current,[key]:width}))}
  function openListing(row:Listing){window.open(row.url,"_blank","noopener,noreferrer")}
  function openOnRepeatedTouch(event:ReactPointerEvent<HTMLTableRowElement>,row:Listing){if(event.pointerType!=="touch")return;const now=Date.now(),previous=lastTouch.current;if(previous?.listingId===row.listingId&&now-previous.at<=500){lastTouch.current=null;suppressDoubleOpenUntil.current=now+800;openListing(row)}else lastTouch.current={listingId:row.listingId,at:now}}
  const rowClass=(status:Listing["status"])=>status==="مطابقة"?"match":status==="قريبة"?"near":"missing";
  const resultCities=[...new Set(rows.map(row=>(row.city||"").trim()).filter(Boolean))],displayCities=resultCities.length?resultCities:cities;
  const resultCityText=displayCities.join("، "),separateResultsSummary=rows.length>=100||displayCities.length>3||resultCityText.length>42;
  return <section className="panel results" id="results">
    <div className={`resultsToolbar ${separateResultsSummary?"separateSummary":"compactSummary"}`}>
      <div className="resultsHead"><span className="eyebrow">النتائج</span><div className="resultsSummary"><h2>{rows.length} عقار</h2>{displayCities.length>0&&<span>المدن: {resultCityText}</span>}</div></div>
      <div className="resultPanelActions"><button type="button" className="save resultSave" disabled={saveDisabled} aria-busy={saving} onClick={onSave}>{saving?"جارٍ الحفظ…":searchBusy&&rows.length?"حفظ النتائج الحالية":"حفظ هذه النتائج"}</button><button className="ghost" onClick={onShowSaved}>المجموعات المحفوظة</button><button className="ghost" disabled={exportingExcel} onClick={onExport}>{exportingExcel?"جارٍ إنشاء Excel…":"تصدير Excel"}</button></div>
    </div>
    <div className="resultKey" aria-label="نوع العقار ودليل ألوان المطابقة">
      <strong>نوع العقار: {propertyType}</strong>
      <div className="legend">
        {(["مطابقة","قريبة","بيانات ناقصة"] as Listing["status"][]).map(status=><button key={status} type="button" aria-pressed={preferredStatus===status} className={rowClass(status)} onClick={()=>setPreferredStatus(status)}>{status==="بيانات ناقصة"?"ناقصة":status}</button>)}
      </div>
    </div>
    {saveFeedback&&<span className={`resultSaveStatus ${saveFeedback.tone}`} role="status" aria-live="polite">{saveFeedback.text}</span>}
    <>
      <div className="tableTools"><p className="swipeHint">مرّر الجدول يمينًا ويسارًا بالسحب العادي. اضغط العنوان للفرز، واسحب مقبض ↔ لترتيب العمود. اسحب مقبض الحافة لتغيير العرض، أو انقر الحافة مرتين لإعادته. اضغط صف الإعلان مرتين لفتحه.</p></div>
      <div className="resultsTableWrap" role="region" aria-label="جدول مقارنة نتائج العقارات" tabIndex={0}>
        <table className="resultsTable" style={{width:orderedColumns.reduce((total,column)=>total+columnWidths[column.key],0)}}>
          <colgroup>{orderedColumns.map(column=><col key={column.key} style={{width:columnWidths[column.key]}}/>)}</colgroup>
          <thead><tr>{orderedColumns.map(column=><th key={column.key} data-column-key={column.key} className={[draggedColumn===column.key?"draggingColumn":"",dropTargetColumn===column.key&&draggedColumn!==column.key?"dropTargetColumn":""].filter(Boolean).join(" ")||undefined} aria-sort={sort?.key===column.key?(sort.direction==="asc"?"ascending":"descending"):"none"}><span className="columnDragHandle" role="button" aria-label={`سحب لترتيب عمود ${column.label}`} tabIndex={0} title="اسحب لترتيب العمود" onPointerDown={event=>beginPointerDrag(event,column.key)} onPointerMove={continuePointerDrag} onPointerUp={event=>endPointerDrag(event)} onPointerCancel={event=>endPointerDrag(event,true)} onKeyDown={event=>moveColumnByKeyboard(event,column.key)}/><button type="button" className="sortHeader" onClick={()=>sortBy(column.key)}>{column.label}<span aria-hidden="true">{sort?.key===column.key?(sort.direction==="asc"?"▲":"▼"):"↕"}</span></button><span className="columnResizeHandle" role="separator" aria-orientation="vertical" aria-label={`تغيير عرض عمود ${column.label}`} aria-valuemin={MIN_COLUMN_WIDTHS[column.key]} aria-valuemax={MAX_COLUMN_WIDTH} aria-valuenow={columnWidths[column.key]} tabIndex={0} title="اسحب لتغيير العرض، وانقر مرتين لإعادة العرض الافتراضي" onPointerDown={event=>beginColumnResize(event,column.key)} onPointerMove={continueColumnResize} onPointerUp={endColumnResize} onPointerCancel={endColumnResize} onDoubleClick={event=>resetColumnWidth(event,column.key)} onKeyDown={event=>resizeColumnByKeyboard(event,column.key)}/></th>)}</tr></thead>
          <tbody>{!orderedRows.length?<tr><td className="emptyTableCell" colSpan={orderedColumns.length}>ستظهر النتائج هنا بعد البحث.</td></tr>:orderedRows.map(r=><tr className={rowClass(r.status)} key={r.listingId} tabIndex={0} title="اضغط مرتين لفتح الإعلان" onDoubleClick={()=>{if(Date.now()>=suppressDoubleOpenUntil.current)openListing(r)}} onPointerUp={event=>openOnRepeatedTouch(event,r)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();openListing(r)}}}>
            {orderedColumns.map(column=><td key={column.key} className={column.className}>{column.render(r)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </>
  </section>
}
