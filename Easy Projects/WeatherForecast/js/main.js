import{searchCities,getWeather,describe,reverseGeocode,geoErrorKey,fmtDate,fmtTime,shift}from './api.js';
const $=id=>document.getElementById(id);
const store={get:k=>{try{return localStorage.getItem('wf.'+k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem('wf.'+k,v)}catch{}}};
const S={en:{skip:'Skip to content',home:'Home',search:'Search',loc:'My Location',set:'Settings',ph:'Search for a city…',feels:'Feels like',hi:'High',lo:'Low',pp:'Rain chance',fc:'7-Day Forecast',
 loading:'Loading weather…',retry:'Try again',fail:'Could not load the weather. ',upd:'Updated',askLoc:'Waiting for location permission…',denied:'Location permission was denied. Showing your last city instead.',
 timeout:'Getting your location timed out. Showing your last city instead.',unavail:'Your location is unavailable right now. Showing your last city instead.',noGeo:'Location is not available in this browser.',
 current:'Current location',approx:'Your browser gave only an approximate position (about ±{km} km, usually from Wi-Fi or IP, or a VPN). For an exact one use a phone with GPS, or search your city.',nocity:'No cities found.',sfail:'Search failed. Try again.',hum:'Humidity',wind:'Wind',pres:'Pressure',vis:'Visibility',sr:'Sunrise',ss:'Sunset'},
 ka:{skip:'გადასვლა შინაარსზე',home:'მთავარი',search:'ძებნა',loc:'ჩემი ადგილმდებარეობა',set:'პარამეტრები',ph:'მოძებნეთ ქალაქი…',feels:'იგრძნობა როგორც',hi:'მაქსიმუმი',lo:'მინიმუმი',pp:'ნალექის შანსი',fc:'7-დღიანი პროგნოზი',
 loading:'ამინდის ჩატვირთვა…',retry:'სცადეთ ხელახლა',fail:'ამინდის ჩატვირთვა ვერ მოხერხდა. ',upd:'განახლებულია',askLoc:'ველოდები ლოკაციის ნებართვას…',denied:'ლოკაციაზე წვდომა უარყოფილია. ნაჩვენებია ბოლო ქალაქი.',
 timeout:'ლოკაციის განსაზღვრას ძალიან დიდხანს დასჭირდა. ნაჩვენებია ბოლო ქალაქი.',unavail:'თქვენი ლოკაცია ამჟამად მიუწვდომელია. ნაჩვენებია ბოლო ქალაქი.',noGeo:'ამ ბრაუზერში ლოკაცია მიუწვდომელია.',
 current:'მიმდინარე მდებარეობა',approx:'ბრაუზერმა მხოლოდ მიახლოებითი პოზიცია დააბრუნა (დაახლოებით ±{km} კმ; ჩვეულებრივ Wi-Fi-დან, IP-დან ან VPN-იდან). ზუსტი ლოკაციისთვის გამოიყენეთ GPS-იანი ტელეფონი ან მოძებნეთ ქალაქი.',nocity:'ქალაქი ვერ მოიძებნა.',sfail:'ძებნა ვერ შესრულდა. სცადეთ ხელახლა.',hum:'ტენიანობა',wind:'ქარი',pres:'წნევა',vis:'ხილვადობა',sr:'მზის ამოსვლა',ss:'მზის ჩასვლა'}};
const state={lang:store.get('lang')==='ka'?'ka':'en',unit:store.get('unit')==='f'?'f':'c',data:null,place:null,ctl:null,sctl:null,items:[],idx:-1};
const NS='http://www.w3.org/2000/svg';
const icon=(n,cls='ico')=>{const s=document.createElementNS(NS,'svg');if(n.startsWith('c-'))s.setAttribute('viewBox','0 0 64 64');s.setAttribute('class',cls);const u=document.createElementNS(NS,'use');u.setAttribute('href',n.startsWith('c-')?'#'+n:'#i-'+n);s.append(u);return s};
const T=c=>Math.round(state.unit==='f'?c*9/5+32:c)+'°';
const num=v=>Number.isFinite(v);
const t=k=>S[state.lang][k]||S.en[k]||k,L=()=>state.lang;
function applyLang(){document.documentElement.lang=L();$('lang').textContent=L()==='en'?'KA':'EN';$('lang').lang=L()==='en'?'ka':'en';
  document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));document.querySelectorAll('[data-i18n-ph]').forEach(e=>e.placeholder=t(e.dataset.i18nPh))}
const note=m=>{$('note').textContent=m||''};
const validPlace=p=>p&&typeof p.label==='string'&&p.label.length<=100&&num(p.lat)&&num(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
function recents(){try{const a=JSON.parse(store.get('recent'));return Array.isArray(a)?a.filter(validPlace).slice(0,5):[]}catch{return[]}}
function addRecent(p){const a=[{label:p.label,lat:p.lat,lon:p.lon},...recents().filter(r=>r.label!==p.label)].slice(0,5);store.set('recent',JSON.stringify(a));paintRecent()}
function paintRecent(){$('recent').replaceChildren(...recents().map(p=>{const li=document.createElement('li'),b=document.createElement('button');b.textContent=p.label;if(state.place&&p.label===state.place.label)b.setAttribute('aria-current','true');b.onclick=()=>load(p);li.append(b);return li}))}

function status(kind,msg,retry){
  const s=$('status');s.hidden=false;s.className='status'+(kind==='err'?' err':'');s.replaceChildren();
  if(kind==='load')for(const c of['skel big','skel','skel']){const d=document.createElement('div');d.className=c;s.append(d)}
  const p=document.createElement('p');p.textContent=msg;s.append(p);
  if(retry){const b=document.createElement('button');b.className='btn';b.textContent=t('retry');b.onclick=retry;s.append(b)}
  $('nowBody').hidden=true;
}

function render(){
  const d=state.data;if(!d)return;
  const c=d.current,dy=d.daily,[desc,ic]=describe(c.weather_code,L());
  $('status').hidden=true;$('nowBody').hidden=false;
  $('place').textContent=state.place.label;$('chipText').textContent=state.place.label;
  {const n=shift(Date.now(),d.utc_offset_seconds||0);$('time').textContent=fmtDate(n,L())+' • '+fmtTime(n,L())}
  $('temp').textContent=num(c.temperature_2m)?T(c.temperature_2m).slice(0,-1):'–';
  $('unit').textContent='°'+state.unit.toUpperCase();
  $('cond').textContent=desc;
  $('upd').textContent=t('upd')+' '+fmtTime(shift(d.fetchedAt||Date.now(),-new Date().getTimezoneOffset()*60),L());
  $('hi').textContent=num(dy.temperature_2m_max[0])?T(dy.temperature_2m_max[0]):'–';
  $('lo').textContent=num(dy.temperature_2m_min[0])?T(dy.temperature_2m_min[0]):'–';
  $('feels').textContent=num(c.apparent_temperature)?T(c.apparent_temperature):'–';
  const nowL=shift(Date.now(),d.utc_offset_seconds||0),sr0=dy.sunrise?.[0],ss0=dy.sunset?.[0];
  const night=!!(sr0&&ss0&&(nowL<new Date(sr0+'Z')||nowL>=new Date(ss0+'Z')));
  const de=document.documentElement;de.dataset.wx=({sun:'clear',partly:'clear'})[ic]||ic;
  if(night)de.dataset.night='';else delete de.dataset.night;
  $('heroIco').firstElementChild.setAttribute('href','#c-'+(night&&ic==='sun'?'moon':night&&ic==='partly'?'nightpartly':ic));
  const hm=s=>s?fmtTime(new Date(s+'Z'),L()):null;
  const dirs=['N','NE','E','SE','S','SW','W','NW'];
  const rows=[['drop',t('hum'),num(c.relative_humidity_2m)&&c.relative_humidity_2m+'%'],
   ['wind',t('wind'),num(c.wind_speed_10m)&&Math.round(c.wind_speed_10m)+' km/h'+(num(c.wind_direction_10m)?' '+dirs[Math.round(c.wind_direction_10m/45)%8]:'')],
   ['drop',t('pp'),num(dy.precipitation_probability_max?.[0])&&dy.precipitation_probability_max[0]+'%'],
   ['gauge',t('pres'),num(c.pressure_msl)&&Math.round(c.pressure_msl)+' hPa'],
   ['eye',t('vis'),num(c.visibility)&&(c.visibility/1000).toFixed(c.visibility>=10000?0:1)+' km'],
   ['sunrise',t('sr'),hm(dy.sunrise?.[0])],['sunset',t('ss'),hm(dy.sunset?.[0])]].filter(r=>r[2]);
  $('stats').replaceChildren(...rows.map(([i,l,v])=>{const e=document.createElement('div');e.className='stat';
    const w=document.createElement('div'),s=document.createElement('small'),b=document.createElement('b');s.textContent=l;b.textContent=v;w.append(s,b);e.append(icon(i),w);return e}));
  $('days').replaceChildren(...dy.time.map((t,i)=>{
    const li=document.createElement('li'),[dsc,di]=describe(dy.weather_code[i],L());
    const dt=new Date(t+'T12:00:00Z');
    const mk=(cls,txt)=>{const e=document.createElement('div');e.className=cls;e.textContent=txt;return e};
    const tt=mk('t','');const mx=document.createTextNode(num(dy.temperature_2m_max[i])?T(dy.temperature_2m_max[i]):'–'),mi=document.createElement('i');mi.textContent=' / '+(num(dy.temperature_2m_min[i])?T(dy.temperature_2m_min[i]):'–');tt.append(mx,mi);
    li.append(mk('d',fmtDate(dt,L())),icon('c-'+di,'dico'),mk('w',dsc),tt);
    const pp=dy.precipitation_probability_max?.[i];
    if(num(pp)){const p=mk('p','');p.append(icon('drop'),document.createTextNode(pp+'%'));p.title='Precipitation probability';li.append(p)}
    return li}));
}

async function load(place,{remember=true,force=false}={}){
  state.ctl?.abort();const ctl=state.ctl=new AbortController();
  state.place=place;state.data=null;$('chipText').textContent=place.label;
  status('load',t('loading'));$('refresh').disabled=true;
  try{
    const d=await getWeather(place.lat,place.lon,ctl.signal,force);
    if(ctl!==state.ctl)return;
    state.data=d;render();if(!place.geo)addRecent(place);
    if(remember&&!place.geo)store.set('city',JSON.stringify({label:place.label,lat:place.lat,lon:place.lon}));
  }catch(e){
    if(ctl.signal.aborted&&ctl!==state.ctl||e.name==='AbortError'&&ctl!==state.ctl)return;
    status('err',t('fail')+(e.message||''),()=>load(place,{remember,force:true}));
  }finally{if(ctl===state.ctl)$('refresh').disabled=false}
}

const q=$('q'),sg=$('sugg'),box=q.closest('.search');let deb;
const closeS=()=>{sg.hidden=true;box.setAttribute('aria-expanded','false');state.idx=-1};
function pick(i){const r=state.items[i];if(!r)return;closeS();q.value='';
  load({label:[r.name,r.country].filter(Boolean).join(', '),lat:r.lat,lon:r.lon})}
function paintS(){
  sg.replaceChildren(...state.items.map((r,i)=>{const li=document.createElement('li');li.role='option';li.id='opt'+i;li.setAttribute('aria-selected',i===state.idx);
    const a=document.createElement('span'),b=document.createElement('small');a.textContent=r.name;b.textContent=[r.admin,r.country].filter(Boolean).join(', ');
    li.append(a,b);li.onmousedown=e=>{e.preventDefault();pick(i)};return li}));
  if(!state.items.length){const li=document.createElement('li');li.className='empty';li.textContent=t('nocity');sg.append(li)}
  sg.hidden=false;box.setAttribute('aria-expanded','true');
  q.setAttribute('aria-activedescendant',state.idx>=0?'opt'+state.idx:'');
}
q.addEventListener('input',()=>{
  clearTimeout(deb);const v=q.value.trim().replace(/[<>]/g,'');
  if(v.length<2){state.sctl?.abort();closeS();return}
  deb=setTimeout(async()=>{
    state.sctl?.abort();const c=state.sctl=new AbortController();
    try{const r=await searchCities(v,c.signal,L());if(c!==state.sctl)return;state.items=r;state.idx=-1;paintS()}
    catch(e){if(c!==state.sctl||e.name==='AbortError')return;state.items=[];sg.replaceChildren();const li=document.createElement('li');li.className='empty';li.textContent=t('sfail');sg.append(li);sg.hidden=false}
  },300);
});
q.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeS();return}
  if(sg.hidden||!state.items.length)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();state.idx=e.key==='ArrowDown'?Math.min(state.idx+1,state.items.length-1):Math.max(state.idx-1,0);paintS()}
  else if(e.key==='Enter'){e.preventDefault();pick(state.idx>=0?state.idx:0)}
});
q.addEventListener('blur',()=>setTimeout(closeS,100));

let locating=false;
function lastCity(){try{const c=JSON.parse(store.get('city'));return validPlace(c)?c:null}catch{return null}}
function locate(){
  if(locating)return;
  if(!navigator.geolocation){note(t('noGeo'));return}
  locating=true;note('');const btns=document.querySelectorAll('[data-nav=locate]');btns.forEach(x=>x.disabled=true);
  const end=()=>{locating=false;btns.forEach(x=>x.disabled=false)};
  navigator.geolocation.getCurrentPosition(async p=>{
    const{latitude:lat,longitude:lon}=p.coords;let label=t('current');
    status('load',t('loading'));
    try{label=await reverseGeocode(lat,lon,new AbortController().signal,L())||label}catch{}
    end();load({label,lat,lon,geo:true},{remember:false});
    const km=Math.round((p.coords.accuracy||0)/1000);if(km>=5)note(t('approx').replace('{km}',km));
  },e=>{
    end();const msg=t(geoErrorKey(e.code));
    if(state.data)note(msg);else{load(lastCity()||{label:'Tbilisi, Georgia',lat:41.7151,lon:44.8271},{remember:false});note(msg)}
  },{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
}

const tb=$('themeBtn');
function theme(t){const r=document.documentElement;r.classList.add('theming');clearTimeout(theme.t);theme.t=setTimeout(()=>r.classList.remove('theming'),350);const mc=document.querySelector('meta[name=theme-color]');if(mc)mc.content=t==='light'?'#e6edf4':'#0e1c2a';const u=$('themeTop').querySelector('use');u.setAttribute('href',t==='dark'?'#i-moon':'#i-sun');document.documentElement.dataset.theme=t;tb.setAttribute('aria-checked',t==='dark');store.set('theme',t)}
const flip=()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark');
tb.onclick=$('themeTop').onclick=flip;
tb.setAttribute('aria-checked',document.documentElement.dataset.theme==='dark');
const dlg=$('settings');$('themeTop').querySelector('use').setAttribute('href',document.documentElement.dataset.theme==='dark'?'#i-moon':'#i-sun');
document.querySelectorAll('[name=u]').forEach(r=>{r.checked=r.value===state.unit;r.onchange=()=>{state.unit=r.value;store.set('unit',r.value);render()}});
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>{
  const k=b.dataset.nav;
  if(k==='search')q.focus();else if(k==='locate')locate();else if(k==='settings')dlg.showModal();else scrollTo({top:0,behavior:'smooth'});
  if(k==='home'||k==='search'){document.querySelectorAll('.nav').forEach(n=>n.removeAttribute('aria-current'));b.setAttribute('aria-current','page')}
});
$('chip').onclick=()=>q.focus();

$('lang').onclick=()=>{state.lang=L()==='en'?'ka':'en';store.set('lang',L());applyLang();state.data?render():0};
$('refresh').onclick=()=>{if(state.place&&!$('refresh').disabled)load(state.place,{remember:false,force:true})};
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|TEXTAREA)$/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
  const k=e.key.toLowerCase();if(k==='/'){e.preventDefault();q.focus()}else if(k==='l')locate();else if(k==='r')$('refresh').click();else if(k==='u'){state.unit=state.unit==='c'?'f':'c';store.set('unit',state.unit);
    document.querySelectorAll('[name=u]').forEach(r=>r.checked=r.value===state.unit);render()}});
applyLang();paintRecent();
let last=null;try{last=JSON.parse(store.get('city'))}catch{}
load(last&&num(last.lat)&&num(last.lon)&&typeof last.label==='string'?last:{label:'Tbilisi, Georgia',lat:41.7151,lon:44.8271},{remember:false});
