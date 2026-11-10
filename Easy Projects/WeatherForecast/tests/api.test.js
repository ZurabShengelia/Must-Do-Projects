import test from 'node:test';
import assert from 'node:assert/strict';
import{fmtDate,fmtTime,describe,parsePlace,toUnit,geoErrorKey,getJSON,searchCities,reverseGeocode}from '../js/api.js';
const ok=b=>({ok:true,status:200,json:async()=>b});
test('toUnit converts C to F and rounds',()=>{assert.equal(toUnit(0,'f'),32);assert.equal(toUnit(100,'f'),212);assert.equal(toUnit(-40,'f'),-40);assert.equal(toUnit(21.6,'c'),22)});
test('geoErrorKey maps codes',()=>{assert.equal(geoErrorKey(1),'denied');assert.equal(geoErrorKey(2),'unavail');assert.equal(geoErrorKey(3),'timeout')});
test('parsePlace builds city, region, country without duplicates',()=>{
  assert.equal(parsePlace({city:'Kutaisi',principalSubdivision:'Imereti',countryName:'Georgia'}),'Kutaisi, Imereti, Georgia');
  assert.equal(parsePlace({city:'Tbilisi',principalSubdivision:'Tbilisi',countryName:'Georgia'}),'Tbilisi, Georgia');
  assert.equal(parsePlace({locality:'Gori',countryName:'Georgia'}),'Gori, Georgia');
  assert.equal(parsePlace(null),'');assert.equal(parsePlace({}),'')});
test('getJSON retries on 500 then succeeds',async()=>{let n=0;globalThis.fetch=async()=>++n<3?{ok:false,status:500}:ok({a:1});
  assert.deepEqual(await getJSON('x',undefined,1000,3,1),{a:1});assert.equal(n,3)});
test('getJSON does not retry on 404',async()=>{let n=0;globalThis.fetch=async()=>{n++;return{ok:false,status:404}};
  await assert.rejects(getJSON('x',undefined,1000,3,1),/HTTP 404/);assert.equal(n,1)});
test('searchCities maps results and drops invalid coordinates',async()=>{
  globalThis.fetch=async()=>ok({results:[{name:'Paris',admin1:'Texas',country:'United States',latitude:33.6,longitude:-95.5},{name:'Bad',latitude:null,longitude:1}]});
  const r=await searchCities('paris');assert.equal(r.length,1);assert.equal(r[0].admin,'Texas')});
test('searchCities returns [] when no results',async()=>{globalThis.fetch=async()=>ok({});assert.deepEqual(await searchCities('zzzz'),[])});
test('reverseGeocode caches repeated lookups',async()=>{let n=0;globalThis.fetch=async()=>{n++;return ok({city:'Batumi',countryName:'Georgia'})};
  assert.equal(await reverseGeocode(41.65,41.63),'Batumi, Georgia');await reverseGeocode(41.65,41.63);assert.equal(n,1)});
test('date/time formatting does not depend on ICU',()=>{const d=new Date('2026-11-10T13:05:00Z');
  assert.equal(fmtDate(d,'en'),'Tue, 10 Nov');assert.equal(fmtDate(d,'ka'),'სამ, 10 ნოე');
  assert.equal(fmtTime(d,'en'),'1:05 PM');assert.equal(fmtTime(d,'ka'),'13:05');assert.equal(fmtTime(new Date('2026-11-10T00:30:00Z'),'en'),'12:30 AM')});
test('weather descriptions are translated',()=>{assert.equal(describe(0,'ka')[0],'მოწმენდილი');assert.equal(describe(0)[0],'Clear sky');assert.equal(describe(999,'ka')[0],'უცნობი')});
