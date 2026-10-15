import test from 'node:test';
import assert from 'node:assert/strict';
import {createStatsUI} from '../ui/stats.js';
test('growth start date uses reporting timezone, matching the activity calendar',()=>{
 const old=globalThis.location;globalThis.location={search:''};
 try {
  const state={approved:[],explored:[],stats:{version:1,startedAt:Date.parse('2026-10-15T01:00Z'),timeZone:'America/Chicago',baselineIds:[],excludedIds:[],acknowledged:[]}};
  const ui=createStatsUI({getState:()=>state,getLanguage:()=> 'en'});
  assert.match(ui.view(),/Oct 14, 2026/);
 } finally {globalThis.location=old;}
});
