"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Filters, Listing, Location } from "@/lib/aqar";
import { CATEGORIES, PRICE_PER_SQM_TYPES, ROOM_TYPES, generalSearchHasRequiredKeywords, hiddenNumericFilterKeys, hiddenResultColumnKeys, searchCategoriesFor } from "@/lib/aqar";
import { CITY_NAMES, canonicalCity, canonicalNeighborhood, neighborhoodSuggestions, placeSuggestions } from "@/lib/locations";

const LEGACY_LAST_FILTERS_KEY = "aqar-last-filters-clean-v2";
const defaults: Filters = { propertyType:"عام",purpose:"sale",locations:[{city:"",neighborhoods:[]}],keywords:[],mode:"near",maxPages:2,maxListings:200,priceMin:0,priceMax:0,yieldMin:0,minMeters:0,minCount:0,minFloors:0,minStreet:0,areaMin:0,areaMax:0,minDensity:0,sqmMin:0,sqmMax:0 };
const nums: {key:keyof Filters;label:string;hint?:string}[] = [
  {key:"priceMin",label:"السعر من"},{key:"priceMax",label:"السعر إلى"},{key:"yieldMin",label:"أقل عائد فعلي %"},
  {key:"minMeters",label:"أقل عدادات"},{key:"minCount",label:"أقل شقق / غرف"},{key:"minFloors",label:"أقل أدوار"},
  {key:"minStreet",label:"أقل عرض شارع"},{key:"areaMin",label:"المساحة من"},{key:"areaMax",label:"المساحة إلى"},
  {key:"minDensity",label:"شقق لكل 100م²"},{key:"sqmMin",label:"سعر المتر من"},{key:"sqmMax",label:"سعر المتر إلى"},
];
const wideNumericKeys=new Set<keyof Filters>(["priceMin","priceMax"]);
const mediumNumericKeys=new Set<keyof Filters>(["areaMin","areaMax","sqmMin","sqmMax"]);
type SavedSet={id:number;name:string;propertyType:string;createdAt:string;count:number;resultsJson:string};
type Profile={id:number;name:string;filtersJson:string};
type SearchSource={category:string;city:string;neighborhood:string;page:number};
type TrialStatus={limit:number;used:number;remaining:number;globalLimit:number;globalUsed:number;globalRemaining:number;canStart:boolean};
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
  const [message,setMessage]=useState("عدّل المواصفات ثم اضغط «ابدأ البحث»"),[progress,setProgress]=useState(0),[warnings,setWarnings]=useState<string[]>([]);
  const [tab,setTab]=useState<"search"|"saved">("search"),[sets,setSets]=useState<SavedSet[]>([]),[profiles,setProfiles]=useState<Profile[]>([]);
  const [trial,setTrial]=useState<TrialStatus|null>(null);
  const [keywordDraft,setKeywordDraft]=useState("");
  useEffect(()=>{const timer=setTimeout(()=>{getDeviceId();localStorage.removeItem(LEGACY_LAST_FILTERS_KEY);void loadProfiles();void loadTrialStatus()},0);return()=>clearTimeout(timer)},[]);
  const trialBlocked=trial?.remaining===0||trial?.globalRemaining===0;
  const countLabel=ROOM_TYPES.has(filters.propertyType)?"أقل غرف (مع المجلس والمقلط)":"أقل شقق";
  const rentalSearch=filters.purpose==="rent";
  const hiddenNumericKeys=hiddenNumericFilterKeys(filters.propertyType,filters.purpose);
  const visibleNums=nums.filter(item=>{
    if((["sqmMin","sqmMax"] as (keyof Filters)[]).includes(item.key))return PRICE_PER_SQM_TYPES.has(filters.propertyType);
    return !hiddenNumericKeys.has(item.key);
  });
  function update<K extends keyof Filters>(key:K,value:Filters[K]){setFilters(f=>({...f,[key]:value}))}
  function addLocation(){update("locations",[...filters.locations,{city:"",neighborhoods:[]}])}
  function changeLocation(i:number,key:"city"|"neighborhoods",value:string){const next=filters.locations.map((l,j)=>j===i?{...l,[key]:key==="neighborhoods"?value.split(/[،,]/).map(x=>x.trim()).filter(Boolean):value}:l);update("locations",next as Location[])}
  function changeKeywordDraft(value:string){setKeywordDraft(value);update("keywords",keywordsFromDraft(value))}
  function clearFields(){setFilters(defaults);setKeywordDraft("");setResults([]);setMessage("تم مسح جميع حقول البحث.")}
  async function loadProfiles(){try{const r=await fetch("/api/profiles",{headers:deviceHeaders()});const data=await r.json() as {profiles:Profile[]};if(r.ok)setProfiles(data.profiles)}catch{/* يعمل البحث حتى لو تعذر التخزين */}}
  async function loadTrialStatus(){try{const r=await fetch("/api/trial",{cache:"no-store",headers:deviceHeaders()});const data=await r.json() as TrialStatus;if(r.ok)setTrial(data)}catch{/* يتحقق الخادم مرة أخرى عند بدء البحث */}}
  async function saveProfile(){const name=prompt("اسم مواصفات البحث:");if(!name)return;const r=await fetch("/api/profiles",{method:"POST",headers:deviceHeaders(true),body:JSON.stringify({name,filters})});if(r.ok){await loadProfiles();setMessage("حُفظت مواصفات البحث.")}else setMessage("تعذر حفظ المواصفات.")}
  function loadProfile(id:string){const p=profiles.find(x=>x.id===Number(id));if(p){const loaded={...defaults,...JSON.parse(p.filtersJson)} as Filters;setFilters(loaded);setKeywordDraft(loaded.keywords.join("، "));setMessage(`تم تحميل: ${p.name}`)}}
  async function search(){
    const locations=filters.locations.filter(l=>l.city.trim()).map(location=>{const city=canonicalCity(location.city);return{city,neighborhoods:location.neighborhoods.map(value=>canonicalNeighborhood(city,value)).filter(Boolean)}}),maxListings=Math.min(500,Math.max(5,filters.maxListings));
    const clean={...filters,...Object.fromEntries([...hiddenNumericKeys].map(key=>[key,0])),locations,maxListings,maxPages:automaticPageCount(filters,locations,maxListings),...(!PRICE_PER_SQM_TYPES.has(filters.propertyType)?{sqmMin:0,sqmMax:0}:{})} as Filters;
    if(!clean.locations.length){setMessage("أضف مدينة واحدة على الأقل.");return}
    if(!generalSearchHasRequiredKeywords(clean.propertyType,clean.keywords)){setMessage("عند اختيار «عام»، اكتب نوع العقار أو وصفه في «كلمات مطلوبة» أولًا.");return}
    let trialToken="";
    try{const reservationResponse=await fetch("/api/trial",{method:"POST",headers:deviceHeaders()});const reservation=await reservationResponse.json() as {token?:string|null;status:TrialStatus;error?:string};setTrial(reservation.status);if(!reservationResponse.ok||!reservation.token){setMessage(reservation.error||"لا يمكن بدء بحث جديد الآن.");return}trialToken=reservation.token}catch{setMessage("تعذر التحقق من المحاولات التجريبية. حاول مرة أخرى.");return}
    setBusy(true);setResults([]);setWarnings([]);setProgress(0);
    const found=new Map<string,Listing>(),checked=new Set<string>();let discovered=0,stoppedAt=-1,stopReason="";const allSources=(()=>{const a:SearchSource[]=[];for(let page=1;page<=clean.maxPages;page++)for(const category of searchCategoriesFor(clean.propertyType,clean.purpose,clean.keywords))for(const l of clean.locations)for(const neighborhood of(l.neighborhoods.length?l.neighborhoods:[""]))a.push({category,city:l.city,neighborhood,page});return a})();
    for(let i=0;i<allSources.length&&checked.size<clean.maxListings;i++){
      const s=allSources[i];setMessage(`قراءة ${s.city}${s.neighborhood?` — ${s.neighborhood}`:""}، صفحة ${s.page}…`);setProgress(Math.round(i/allSources.length*100));
      try{const r=await fetch("/api/search",{method:"POST",headers:{...deviceHeaders(true),"x-aqar-trial-token":trialToken},body:JSON.stringify({filters:clean,...s,remaining:Math.min(20,clean.maxListings-checked.size),excludeListingIds:[...checked]})});const data=await r.json() as {error?:string;discovered?:number;checkedListingIds?:string[];results?:Listing[];warnings?:string[]};if(!r.ok){if(r.status===401||r.status===403){stopReason=data.error||"انتهت صلاحية محاولة البحث.";stoppedAt=i;break}throw new Error(data.error||"تعذر البحث")}discovered+=data.discovered||0;for(const id of data.checkedListingIds||[])checked.add(id);for(const item of data.results||[])found.set(item.listingId,item);if(data.warnings?.length)setWarnings(w=>[...w,...data.warnings!].slice(-20));setResults([...found.values()].sort((a,b)=>b.score-a.score||(b.yieldPct||0)-(a.yieldPct||0)));const blocked=data.warnings?.find(w=>/429|منع|تحقق|تسجيل دخول/.test(w));if(blocked){stopReason=blocked;stoppedAt=i;break}}catch(e){const m=e instanceof Error?e.message:"تعذر البحث";setWarnings(w=>[...w,m]);if(/429|منع|تحقق|تسجيل دخول/.test(m)){stopReason=m;stoppedAt=i;break}}
    }
    if(stopReason){const pending=[...new Set(allSources.slice(stoppedAt).map(s=>s.city))];setProgress(Math.max(1,Math.round(stoppedAt/allSources.length*100)));setMessage(`توقف البحث قبل إكمال جميع المدن. فُحص ${checked.size} إعلان، وظهرت ${found.size} نتيجة. المدن غير المكتملة: ${pending.join("، ")}. انتظر عدة دقائق ثم أعد البحث.`)}else{setProgress(100);setMessage(`اكتمل البحث: اكتُشف ${discovered} رابطًا، وفُحص ${checked.size} إعلان، وظهرت ${found.size} نتيجة بعد التصفية.`)}setBusy(false);void loadTrialStatus();
  }
  function exportCsv(){
    if(!results.length)return;
    const hiddenColumns=hiddenResultColumnKeys(filters.propertyType,filters.purpose);
    const fields:[keyof Listing,string][]=[["listingId","رقم الإعلان"],["status","الحالة"],["propertyType","نوع العقار"],["age","العمر"],["city","المدينة"],["neighborhood","الحي"],["price","السعر"]];
    if(PRICE_PER_SQM_TYPES.has(filters.propertyType))fields.push(["sqmPrice","سعر المتر"]);
    if(!rentalSearch)fields.push(["income","الدخل السنوي"],["yieldPct","العائد %"]);
    fields.push(["area","المساحة"]);
    if(!hiddenColumns.has("count"))fields.push([ROOM_TYPES.has(filters.propertyType)?"rooms":"apartments",ROOM_TYPES.has(filters.propertyType)?"الغرف مع المجلس والمقلط":"الشقق"]);
    if(filters.propertyType==="عمارة")fields.push(["housingUnits","وحدة سكنية"],["commercialShops","المحلات التجارية"],["totalRooms","إجمالي الغرف"]);
    if(!hiddenColumns.has("meters"))fields.push(["meters","العدادات"]);
    if(!hiddenColumns.has("floors"))fields.push(["floors","الأدوار"]);
    fields.push(["street","عرض الشارع"]);
    if(!hiddenColumns.has("density"))fields.push(["density","شقق لكل 100م²"]);
    fields.push(["url","الرابط"]);
    const csv="\ufeff"+[fields.map(x=>x[1]),...results.map(r=>fields.map(([k])=>String(r[k]??"")))].map(row=>row.map(x=>`"${x.replace(/"/g,'""')}"`).join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=`نتائج-${filters.propertyType}-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)
  }
  async function saveResults(){if(!results.length){setMessage("لا توجد نتائج لحفظها.");return}const r=await fetch("/api/saved-results",{method:"POST",headers:deviceHeaders(true),body:JSON.stringify({propertyType:filters.propertyType,results})});const d=await r.json() as {set?:{name:string};error?:string};setMessage(r.ok?`حُفظت المجموعة: ${d.set?.name}`:d.error||"تعذر الحفظ")}
  async function loadSets(){const r=await fetch("/api/saved-results",{headers:deviceHeaders()});const data=await r.json() as {sets:SavedSet[]};if(r.ok)setSets(data.sets);setTab("saved")}
  async function deleteSet(id:number){if(!confirm("هل تريد حذف هذه المجموعة المحفوظة؟"))return;await fetch(`/api/saved-results?id=${id}`,{method:"DELETE",headers:deviceHeaders()});await loadSets()}
  function openSet(s:SavedSet){setResults(JSON.parse(s.resultsJson));setTab("search");setMessage(`تم فتح المجموعة: ${s.name}`);setTimeout(()=>document.getElementById("results")?.scrollIntoView({behavior:"smooth"}),50)}
  return <main dir="rtl">
    <header className="top"><div><span className="eyebrow">نسخة الجوال المستقلة</span><h1>باحث العقارات</h1><p>ابحث في إعلانات عقار، واحسب العائد والكثافة تلقائيًا.</p></div><div className="topActions"><button className="ghost" onClick={loadSets}>المجموعات المحفوظة</button><button className="ghost" onClick={exportCsv}>تصدير CSV</button></div></header>
    {tab==="saved"?<section className="panel saved"><div className="sectionHead"><div><h2>المجموعات المحفوظة</h2><p>لا تُحفظ النتائج إلا عند ضغط زر الحفظ.</p></div><button className="ghost" onClick={()=>setTab("search")}>العودة للبحث</button></div>{sets.length?sets.map(s=><article className="savedRow" key={s.id}><div><strong>{s.name}</strong><small>{s.propertyType} · {s.count} نتيجة</small></div><div><button onClick={()=>openSet(s)}>فتح</button><button className="danger" onClick={()=>deleteSet(s.id)}>حذف المجموعة</button></div></article>):<div className="empty">لا توجد مجموعات محفوظة بعد.</div>}</section>:<>
    <section className="panel searchPanel"><div className="sectionHead"><div><h2>مواصفات البحث</h2><p>تبدأ الحقول فارغة عند كل فتح. يمكنك تحميل بحث محفوظ يدويًا.</p></div><div className="profileControls"><select defaultValue="" onChange={e=>loadProfile(e.target.value)}><option value="">اختر بحثًا محفوظًا</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="ghost" onClick={saveProfile}>حفظ الشروط</button><button className="ghost" onClick={clearFields}>مسح الحقول</button></div></div>
      <div className="searchFields">
        <div className="formBlock choiceBlock"><div className="choiceRow"><label>نوع العقار<select value={filters.propertyType} onChange={e=>update("propertyType",e.target.value)}>{Object.keys(CATEGORIES).map(x=><option key={x}>{x}</option>)}</select></label><fieldset><legend>الغرض</legend><label className="radio"><input type="radio" checked={filters.purpose==="sale"} onChange={()=>update("purpose","sale")}/> بيع</label><label className="radio"><input type="radio" checked={filters.purpose==="rent"} onChange={()=>update("purpose","rent")}/> تأجير</label></fieldset><fieldset><legend>طريقة المطابقة</legend><label className="radio"><input type="radio" checked={filters.mode==="strict"} onChange={()=>update("mode","strict")}/> جميع الشروط تمامًا</label><label className="radio"><input type="radio" checked={filters.mode==="near"} onChange={()=>update("mode","near")}/> القريبة والناقصة ±20%</label></fieldset></div><div className="choiceDetailsRow"><label>كلمات مطلوبة (بفواصل)<input value={keywordDraft} onChange={e=>changeKeywordDraft(e.target.value)} placeholder={filters.propertyType==="عام"?"مثل: مكيف، موقف، سيارة. أو نوع العقار: مزرعة فندق":"مثال: مكيفات، مدخل سيارة، صناعات"}/>{filters.propertyType!=="عام"&&<small>يمكن استخدام الفاصلة العربية «،» أو الإنجليزية «,». وتُقبل المسافات داخل العبارة مثل: مدخل سيارة.</small>}</label></div></div>
        <div className="formBlock locationsBlock"><div className="blockTitle"><h3>المدن والأحياء</h3><button className="add" onClick={addLocation}>+ إضافة مدينة</button></div><div className="locations">{filters.locations.map((location,index)=><LocationAutocomplete key={index} location={location} index={index} onChange={changeLocation} onRemove={()=>update("locations",filters.locations.filter((_,itemIndex)=>itemIndex!==index))}/>)}</div></div>
        <div className="formBlock numericBlock"><h3>الشروط الرقمية</h3><div className="numericGrid">{visibleNums.map(n=><label className={`numericField ${wideNumericKeys.has(n.key)?"numericFieldWide":mediumNumericKeys.has(n.key)?"numericFieldMedium":"numericFieldShort"}`} key={String(n.key)}>{n.key==="minCount"?countLabel:n.label}<input inputMode="decimal" type="number" min="0" value={String(filters[n.key]||"")} onChange={e=>update(n.key,inputNumber(e.target.value) as never)}/></label>)}</div></div>
      </div>
      <div className="trialNotice" aria-live="polite"><strong>التجربة المرتبطة بالمتصفح</strong><span>{trial?`متبقّي لهذا المتصفح ${trial.remaining} من ${trial.limit} عملية بحث`:`حد هذا المتصفح 100 عملية بحث`}</span><span>{trial?`المتبقي الإجمالي ${trial.globalRemaining} من ${trial.globalLimit}`:`الحد الإجمالي 1000 عملية بحث`}</span>{trial?.globalRemaining===0?<span>انتهى الحد الإجمالي للتجربة.</span>:trial?.remaining===0?<span>استخدم هذا المتصفح جميع عملياته.</span>:null}</div>
      <div className="run"><label className="listingLimit runListingLimit">أقصى إعلانات<input type="number" min="5" max="500" value={filters.maxListings||""} onChange={e=>update("maxListings",inputNumber(e.target.value))}/></label><button className="primary" disabled={busy||trialBlocked} onClick={search}>{busy?"جارٍ البحث…":trial?.globalRemaining===0?"انتهت التجربة":trial?.remaining===0?"انتهى حد هذا المتصفح":"ابدأ البحث في عقار"}</button></div>{busy&&<progress value={progress} max="100"/>}<div className="status">{message}</div>{warnings.length>0&&<details className="warnings"><summary>ملاحظات أثناء القراءة ({warnings.length})</summary>{warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
    </section>
    <Results rows={results} roomMode={ROOM_TYPES.has(filters.propertyType)} propertyType={filters.propertyType} purpose={filters.purpose} cities={[...new Set(filters.locations.map(location=>location.city.trim()).filter(Boolean))]} onSave={saveResults} saveDisabled={!results.length||busy}/></>}
    <footer>أداة مستقلة · لا تتجاوز تسجيل الدخول أو حماية موقع عقار · البيانات غير المذكورة تبقى «غير مذكور»</footer>
  </main>
}

function LocationAutocomplete({location,index,onChange,onRemove}:{location:Location;index:number;onChange:(index:number,key:"city"|"neighborhoods",value:string)=>void;onRemove:()=>void}){
  const [cityOpen,setCityOpen]=useState(false),[neighborhoodOpen,setNeighborhoodOpen]=useState(false),[editingNeighborhoods,setEditingNeighborhoods]=useState(false);
  const joinedNeighborhoods=location.neighborhoods.join("، "),[neighborhoodDraft,setNeighborhoodDraft]=useState(joinedNeighborhoods);
  useEffect(()=>{if(!editingNeighborhoods)setNeighborhoodDraft(joinedNeighborhoods)},[joinedNeighborhoods,editingNeighborhoods]);
  const cityMatches=placeSuggestions(location.city,CITY_NAMES);
  const neighborhoodToken=(neighborhoodDraft.split(/[،,]/).at(-1)||"").trim();
  const neighborhoodMatches=neighborhoodSuggestions(location.city,neighborhoodToken);
  function selectCity(value:string){onChange(index,"city",value);setCityOpen(false)}
  function finishCity(){onChange(index,"city",canonicalCity(location.city));setCityOpen(false)}
  function updateNeighborhoodDraft(value:string){setNeighborhoodDraft(value);onChange(index,"neighborhoods",value)}
  function selectNeighborhood(value:string){const parts=neighborhoodDraft.split(/[،,]/);parts[parts.length-1]=value;const joined=parts.map(item=>item.trim()).filter(Boolean).join("، ");setNeighborhoodDraft(joined);onChange(index,"neighborhoods",joined);setNeighborhoodOpen(false)}
  function finishNeighborhoods(){const joined=neighborhoodDraft.split(/[،,]/).map(value=>canonicalNeighborhood(location.city,value)).filter(Boolean).join("، ");setNeighborhoodDraft(joined);onChange(index,"neighborhoods",joined);setEditingNeighborhoods(false);setNeighborhoodOpen(false)}
  return <div className="location">
    <label className="autocomplete">المدينة<input value={location.city} autoComplete="off" onFocus={()=>setCityOpen(true)} onBlur={finishCity} onChange={event=>{onChange(index,"city",event.target.value);setCityOpen(true)}} onKeyDown={event=>{if(event.key==="Enter"&&cityMatches[0]){event.preventDefault();selectCity(cityMatches[0])}else if(event.key==="Escape")setCityOpen(false)}} placeholder="ابدأ الكتابة: جد…"/>{cityOpen&&location.city.trim()&&cityMatches.length>0&&<span className="suggestions" role="listbox">{cityMatches.map(value=><button type="button" key={value} role="option" onMouseDown={event=>event.preventDefault()} onClick={()=>selectCity(value)}>{value}</button>)}</span>}</label>
    <label className="autocomplete">الأحياء (بفواصل)<input value={neighborhoodDraft} autoComplete="off" onFocus={()=>{setEditingNeighborhoods(true);setNeighborhoodOpen(true)}} onBlur={finishNeighborhoods} onChange={event=>{updateNeighborhoodDraft(event.target.value);setNeighborhoodOpen(true)}} onKeyDown={event=>{if(event.key==="Enter"&&neighborhoodMatches[0]){event.preventDefault();selectNeighborhood(neighborhoodMatches[0])}else if(event.key==="Escape")setNeighborhoodOpen(false)}} placeholder={location.city?"ابدأ الكتابة: الشف…":"اختر المدينة أولًا"}/>{neighborhoodOpen&&neighborhoodToken&&neighborhoodMatches.length>0&&<span className="suggestions" role="listbox">{neighborhoodMatches.map(value=><button type="button" key={value} role="option" onMouseDown={event=>event.preventDefault()} onClick={()=>selectNeighborhood(value)}>{value}</button>)}</span>}</label>
    <button type="button" aria-label="حذف المدينة" className="icon danger" onClick={onRemove}>×</button>
  </div>
}

type ColumnKey="price"|"income"|"yieldPct"|"area"|"sqmPrice"|"count"|"housingUnits"|"commercialShops"|"totalRooms"|"meters"|"floors"|"street"|"density"|"age";
type TableColumn={key:ColumnKey;label:string;value:(row:Listing)=>string|number|null;render:(row:Listing)=>ReactNode;className?:string};
const DEFAULT_COLUMN_ORDER:ColumnKey[]=["count","housingUnits","commercialShops","totalRooms","meters","floors","street","area","price","income","yieldPct","density","age","sqmPrice"];
const COLUMN_ORDER_KEY="aqar-mobile-table-column-order-v7";

function Results({rows,roomMode,propertyType,purpose,cities,onSave,saveDisabled}:{rows:Listing[];roomMode:boolean;propertyType:string;purpose:Filters["purpose"];cities:string[];onSave:()=>void;saveDisabled:boolean}){
  const [preferredStatus,setPreferredStatus]=useState<Listing["status"]|null>(null);
  const [sort,setSort]=useState<{key:ColumnKey;direction:"asc"|"desc"}|null>(null);
  const [columnOrder,setColumnOrder]=useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [columnOrderLoaded,setColumnOrderLoaded]=useState(false);
  const [draggedColumn,setDraggedColumn]=useState<ColumnKey|null>(null);
  const pointerDrag=useRef<{key:ColumnKey;pointerId:number;startX:number;moved:boolean}|null>(null);
  const lastTouch=useRef<{listingId:string;at:number}|null>(null);
  const suppressDoubleOpenUntil=useRef(0);
  const suppressSortUntil=useRef(0);
  useEffect(()=>{try{const stored=JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY)||"[]") as ColumnKey[];if(stored.length===DEFAULT_COLUMN_ORDER.length&&DEFAULT_COLUMN_ORDER.every(key=>stored.includes(key)))setColumnOrder(stored)}catch{/* تجاهل ترتيب محلي تالف */}setColumnOrderLoaded(true)},[]);
  useEffect(()=>{if(columnOrderLoaded)localStorage.setItem(COLUMN_ORDER_KEY,JSON.stringify(columnOrder))},[columnOrder,columnOrderLoaded]);
  const rentalSearch=purpose==="rent";
  const hiddenColumns=hiddenResultColumnKeys(propertyType,purpose);
  const columns:TableColumn[]=[
    {key:"price",label:"السعر",value:r=>r.price,render:r=>fmt(r.price),className:"money"},
    {key:"income",label:"الدخل السنوي",value:r=>r.income,render:r=>fmt(r.income)},
    {key:"yieldPct",label:"العائد",value:r=>r.yieldPct,render:r=>r.yieldPct==null?"غير مذكور":`${fmt(r.yieldPct,2)}%${r.incomeKind==="expected"?" متوقع":""}`},
    {key:"area",label:"المساحة",value:r=>r.area,render:r=>r.area==null?"غير مذكور":`${fmt(r.area,1)} م²`},
    {key:"sqmPrice",label:"سعر المتر",value:r=>r.sqmPrice,render:r=>r.sqmPrice==null?"":fmt(r.sqmPrice,2)},
    {key:"count",label:roomMode?"الغرف":"الشقق",value:r=>roomMode?r.rooms:r.apartments,render:r=><>{fmt(roomMode?r.rooms:r.apartments)}{roomMode&&r.rooms!=null&&<small>{fmt(r.bedrooms)} غرفة + {r.majlis} مجلس + {r.maqlat} مقلط</small>}</>},
    {key:"housingUnits",label:"وحدة سكنية",value:r=>r.housingUnits,render:r=>fmt(r.housingUnits)},
    {key:"commercialShops",label:"المحلات التجارية",value:r=>r.commercialShops,render:r=>fmt(r.commercialShops)},
    {key:"totalRooms",label:"إجمالي الغرف",value:r=>r.totalRooms,render:r=>fmt(r.totalRooms)},
    {key:"meters",label:"العدادات",value:r=>r.meters,render:r=>fmt(r.meters)},
    {key:"floors",label:"الأدوار",value:r=>r.floors,render:r=>fmt(r.floors)},
    {key:"street",label:"عرض الشارع",value:r=>r.street,render:r=>r.street==null?"غير مذكور":`${fmt(r.street)} م`},
    {key:"density",label:"شقق لكل 100م²",value:r=>r.density,render:r=>r.density==null?"غير مذكور":fmt(r.density,2)},
    {key:"age",label:"العمر",value:r=>r.age||null,render:r=>r.age?String(r.age).replace(/\s*(?:سنوات|سنة)\s*$/u,""):"غير مذكور"},
  ].filter(column=>(propertyType==="عمارة"||!["housingUnits","commercialShops","totalRooms"].includes(column.key))&&(PRICE_PER_SQM_TYPES.has(propertyType)||column.key!=="sqmPrice")&&(!rentalSearch||!["income","yieldPct"].includes(column.key))&&!hiddenColumns.has(column.key));
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
  function beginPointerDrag(event:ReactPointerEvent<HTMLTableCellElement>,key:ColumnKey){if(event.button!==0)return;pointerDrag.current={key,pointerId:event.pointerId,startX:event.clientX,moved:false}}
  function continuePointerDrag(event:ReactPointerEvent<HTMLTableCellElement>){const drag=pointerDrag.current;if(!drag||drag.pointerId!==event.pointerId)return;if(!drag.moved){if(Math.abs(event.clientX-drag.startX)<10)return;drag.moved=true;if(!event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.setPointerCapture(event.pointerId);setDraggedColumn(drag.key)}event.preventDefault();const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>("th[data-column-key]")?.dataset.columnKey as ColumnKey|undefined;if(target)moveColumnTo(drag.key,target)}
  function endPointerDrag(event:ReactPointerEvent<HTMLTableCellElement>){const drag=pointerDrag.current;if(!drag||drag.pointerId!==event.pointerId)return;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);if(drag.moved)suppressSortUntil.current=Date.now()+300;pointerDrag.current=null;setDraggedColumn(null)}
  function openListing(row:Listing){window.open(row.url,"_blank","noopener,noreferrer")}
  function openOnRepeatedTouch(event:ReactPointerEvent<HTMLTableRowElement>,row:Listing){if(event.pointerType!=="touch")return;const now=Date.now(),previous=lastTouch.current;if(previous?.listingId===row.listingId&&now-previous.at<=500){lastTouch.current=null;suppressDoubleOpenUntil.current=now+800;openListing(row)}else lastTouch.current={listingId:row.listingId,at:now}}
  const rowClass=(status:Listing["status"])=>status==="مطابقة"?"match":status==="قريبة"?"near":"missing";
  const resultCities=[...new Set(rows.map(row=>(row.city||"").trim()).filter(Boolean))],displayCities=resultCities.length?resultCities:cities;
  return <section className="panel results" id="results">
    <div className="sectionHead resultsHead">
      <div><span className="eyebrow">النتائج</span><div className="resultsSummary"><h2>{rows.length} عقار</h2>{displayCities.length>0&&<span>المدن: {displayCities.join("، ")}</span>}<button type="button" className="save resultSave" disabled={saveDisabled} onClick={onSave}>حفظ هذه النتائج</button></div></div>
      <div className="resultKey" aria-label="نوع العقار ودليل ألوان المطابقة">
        <strong>نوع العقار: {propertyType}</strong>
        <div className="legend">
          {(["مطابقة","قريبة","بيانات ناقصة"] as Listing["status"][]).map(status=><button key={status} type="button" aria-pressed={preferredStatus===status} className={rowClass(status)} onClick={()=>setPreferredStatus(status)}>{status==="بيانات ناقصة"?"ناقصة":status}</button>)}
        </div>
      </div>
    </div>
    <>
      <div className="tableTools"><p className="swipeHint">اضغط رأس العمود للفرز، أو أمسكه واسحبه يمينًا أو يسارًا لترتيب الأعمدة. اضغط صف الإعلان مرتين لفتحه.</p></div>
      <div className="resultsTableWrap" role="region" aria-label="جدول مقارنة نتائج العقارات" tabIndex={0}>
        <table className="resultsTable">
          <thead><tr>{orderedColumns.map(column=><th key={column.key} data-column-key={column.key} className={draggedColumn===column.key?"draggingColumn":undefined} aria-sort={sort?.key===column.key?(sort.direction==="asc"?"ascending":"descending"):"none"} onPointerDown={event=>beginPointerDrag(event,column.key)} onPointerMove={continuePointerDrag} onPointerUp={endPointerDrag} onPointerCancel={endPointerDrag}><button type="button" className="sortHeader" onClick={()=>sortBy(column.key)}>{column.label}<span aria-hidden="true">{sort?.key===column.key?(sort.direction==="asc"?"▲":"▼"):"↕"}</span></button></th>)}</tr></thead>
          <tbody>{!orderedRows.length?<tr><td className="emptyTableCell" colSpan={orderedColumns.length}>ستظهر النتائج هنا بعد البحث.</td></tr>:orderedRows.map(r=><tr className={rowClass(r.status)} key={r.listingId} tabIndex={0} title="اضغط مرتين لفتح الإعلان" onDoubleClick={()=>{if(Date.now()>=suppressDoubleOpenUntil.current)openListing(r)}} onPointerUp={event=>openOnRepeatedTouch(event,r)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();openListing(r)}}}>
            {orderedColumns.map(column=><td key={column.key} className={column.className}>{column.render(r)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </>
  </section>
}
