const GEO='https://geocoding-api.open-meteo.com/v1/search';
const WX='https://api.open-meteo.com/v1/forecast';
const RG='https://api.bigdatacloud.net/data/reverse-geocode-client';
const cache=new Map();const TTL=10*60*1000;

const stamps=[];
function limit(){const n=Date.now();while(stamps.length&&n-stamps[0]>10000)stamps.shift();
  if(stamps.length>=20)throw new Error('Too many requests. Please wait a moment.');stamps.push(n)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function once(url,signal,ms){
  const ctl=new AbortController();
  const t=setTimeout(()=>ctl.abort(new Error('timeout')),ms);
  const onAbort=()=>ctl.abort(signal.reason);
  signal?.addEventListener('abort',onAbort);
  try{
    const r=await fetch(url,{signal:ctl.signal});
    if(!r.ok){const e=new Error('HTTP '+r.status);e.retry=r.status>=500||r.status===429;throw e}
    return await r.json();
  }catch(e){
    if(ctl.signal.reason?.message==='timeout'){const x=new Error('The request timed out.');x.retry=true;throw x}
    throw e;
  }finally{clearTimeout(t);signal?.removeEventListener('abort',onAbort)}
}
export async function getJSON(url,signal,ms=10000,tries=3,base=400){
  for(let i=0;;i++){
    limit();
    try{return await once(url,signal,ms)}
    catch(e){
      if(signal?.aborted||i>=tries-1||!(e.retry||e instanceof TypeError))throw e;
      await sleep(base*2**i);
    }
  }
}

export const toUnit=(c,u)=>Math.round(u==='f'?c*9/5+32:c);
export const geoErrorKey=code=>code===1?'denied':code===3?'timeout':'unavail';
export function parsePlace(r){
  if(!r||typeof r!=='object')return'';
  const city=String(r.city||r.locality||'').trim(),reg=String(r.principalSubdivision||'').trim(),co=String(r.countryName||'').trim();
  return [city||reg,city&&reg!==city?reg:'',co].filter((x,i,a)=>x&&a.indexOf(x)===i).join(', ').slice(0,100);
}
export async function reverseGeocode(lat,lon,signal,lang='en'){
  const key='rg'+lat.toFixed(3)+','+lon.toFixed(3)+lang;
  if(cache.has(key))return cache.get(key);
  const d=await getJSON(`${RG}?latitude=${lat}&longitude=${lon}&localityLanguage=${lang==='ka'?'ka':'en'}`,signal,8000,2);
  const label=parsePlace(d);if(label)cache.set(key,label);return label;
}

export async function searchCities(q,signal,lang='en'){
  const d=await getJSON(`${GEO}?name=${encodeURIComponent(q)}&count=8&language=${lang==='ka'?'ka':'en'}&format=json`,signal);
  if(d&&d.results===undefined)return[];
  if(!Array.isArray(d?.results))throw new Error('Unexpected search response.');
  return d.results.filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)).map(r=>({
    name:String(r.name),admin:r.admin1?String(r.admin1):'',country:r.country?String(r.country):'',lat:r.latitude,lon:r.longitude}));
}

export async function getWeather(lat,lon,signal,force=false){
  const key=lat.toFixed(2)+','+lon.toFixed(2);
  const hit=cache.get(key);
  if(!force&&hit&&Date.now()-hit.at<TTL)return hit.data;
  const p=new URLSearchParams({latitude:lat,longitude:lon,timezone:'auto',forecast_days:7,wind_speed_unit:'kmh',
    current:'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,visibility',
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'});
  const d=await getJSON(`${WX}?${p}`,signal);
  if(!d?.current||!d?.daily?.time?.length)throw new Error('Unexpected weather response.');
  d.fetchedAt=Date.now();
  cache.set(key,{at:Date.now(),data:d});
  return d;
}

const W={0:['Clear sky','sun'],1:['Mainly clear','sun'],2:['Partly cloudy','partly'],3:['Overcast','cloud'],45:['Fog','fog'],48:['Rime fog','fog'],
51:['Light drizzle','rain'],53:['Drizzle','rain'],55:['Dense drizzle','rain'],56:['Freezing drizzle','rain'],57:['Freezing drizzle','rain'],
61:['Light rain','rain'],63:['Rain','rain'],65:['Heavy rain','rain'],66:['Freezing rain','rain'],67:['Freezing rain','rain'],
71:['Light snow','snow'],73:['Snow','snow'],75:['Heavy snow','snow'],77:['Snow grains','snow'],
80:['Rain showers','rain'],81:['Rain showers','rain'],82:['Violent showers','rain'],85:['Snow showers','snow'],86:['Snow showers','snow'],
95:['Thunderstorm','storm'],96:['Thunderstorm, hail','storm'],99:['Thunderstorm, hail','storm']};
const KA={'Clear sky':'მოწმენდილი','Mainly clear':'ძირითადად მოწმენდილი','Partly cloudy':'ნაწილობრივ ღრუბლიანი','Overcast':'მოღრუბლული','Fog':'ნისლი','Rime fog':'ცვარნისლი',
'Light drizzle':'მცირე ჟინჟღლი','Drizzle':'ჟინჟღლი','Dense drizzle':'ძლიერი ჟინჟღლი','Freezing drizzle':'გამყინავი ჟინჟღლი','Light rain':'მცირე წვიმა','Rain':'წვიმა','Heavy rain':'ძლიერი წვიმა','Freezing rain':'გამყინავი წვიმა',
'Light snow':'მცირე თოვლი','Snow':'თოვლი','Heavy snow':'ძლიერი თოვლი','Snow grains':'ყინულის მარცვლები','Rain showers':'კოკისპირული წვიმა','Violent showers':'ძლიერი კოკისპირული','Snow showers':'თოვლის ნალექი',
'Thunderstorm':'ჭექა-ქუხილი','Thunderstorm, hail':'ჭექა-ქუხილი და სეტყვა','Unknown':'უცნობი'};
export const describe=(c,lang='en')=>{const d=W[c]||['Unknown','cloud'];return[lang==='ka'?KA[d[0]]||d[0]:d[0],d[1]]};
const WD={en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],ka:['კვი','ორშ','სამ','ოთხ','ხუთ','პარ','შაბ']};
const MO={en:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],ka:['იან','თებ','მარ','აპრ','მაი','ივნ','ივლ','აგვ','სექ','ოქტ','ნოე','დეკ']};
export const fmtDate=(d,lang='en')=>`${WD[lang][d.getUTCDay()]}, ${d.getUTCDate()} ${MO[lang][d.getUTCMonth()]}`;
export const fmtTime=(d,lang='en')=>{const h=d.getUTCHours(),m=String(d.getUTCMinutes()).padStart(2,'0');return lang==='ka'?`${String(h).padStart(2,'0')}:${m}`:`${h%12||12}:${m} ${h<12?'AM':'PM'}`};
export const shift=(ms,tzSeconds)=>new Date(ms+tzSeconds*1000);
