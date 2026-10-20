import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,prepareObservation,reduceState,buildRequest} from '../core/index.js';
import {createBackup} from '../core/backup.js';
import {titleSignatures} from '../core/browsing-context.js';

const NOW=1_800_000_000_000, DAY=86400000;
const catalog=['Illinois','Machine learning','Basketball','Python programming','Geology','Art'].map(topic=>({id:topic,topic,domain:topic==='Illinois'?'Places':'Learning',description:''}));
const observation=(title,path='a',host='illinois.edu',at=NOW)=>prepareObservation({url:`https://${host}/${path}`,title,lastVisitTime:at},catalog,{salt:'fixture',blockedDomains:[]},NOW);
const act=(state,type,fields={},now=NOW)=>reduceState(state,{type,...fields},now);
const ingest=async(...rows)=>act(createState(NOW),'INGEST',{observations:await Promise.all(rows)});
const edit=(state,operation,ids)=>act(state,'REVIEW_CANDIDATES',{operation,ids});

test('institutional Illinois is folded, but Illinois article content and school-hosted learning survive',async()=>{
  const state=await ingest(
    observation('Machine learning | University of Illinois Urbana-Champaign','a'),
    observation('Admissions - Illinois State University','b'),
    observation('Illinois geology and landscapes | University of Illinois','c'),
  );
  assert.equal(state.candidates.find(row=>row.id==='Illinois').contentCount,1);
  assert.equal(state.candidates.find(row=>row.id==='Illinois').backgroundReason,null);
  assert.ok(state.candidateReview.selected.includes('Machine learning'));
  const background=await ingest(observation('Registration | University of Illinois Urbana-Champaign'));
  assert.equal(background.candidates[0].backgroundReason,'institution');
  assert.deepEqual(background.candidateReview.selected,[]);
  assert.deepEqual(background.approved,[]);
});

test('institution signatures also fold generic words inside the name without excluding university as a subject',async()=>{
  const topics=[...catalog,{id:'University',topic:'University',domain:'Education',description:''}];
  const result=await prepareObservation({url:'https://illinois.edu/course',title:'Machine learning | University of Illinois'},topics,{salt:'fixture',blockedDomains:[]},NOW);
  assert.ok(result.background.some(row=>row.id==='University'));
  assert.ok(result.background.some(row=>row.id==='Illinois'));
  assert.equal(result.background.some(row=>row.id==='Machine learning'),false);
  const content=await prepareObservation({url:'https://example.org/guide',title:'University education and its history'},topics,{salt:'fixture',blockedDomains:[]},NOW);
  assert.equal(content.background?.some(row=>row.id==='University')??false,false);
});

test('matching a hostname alone is insufficient to hide real article content',async()=>{
  const state=await ingest(
    observation('Illinois history: an introduction','a'),
    observation('Basketball coaching techniques','b','basketball.com'),
    observation('Machine learning - Illinois','c'),
  );
  assert.equal(state.candidates.find(row=>row.id==='Illinois').contentCount,1);
  assert.equal(state.candidates.find(row=>row.id==='Basketball').backgroundReason,null);
  const signature=await ingest(observation('Registration - Illinois'));
  assert.equal(signature.candidates[0].backgroundReason,'signature');
});

test('repeated site suffixes are scoped to their host and never hide a content mention',async()=>{
  const items=['Machine learning','Python','Basketball'].map((word,index)=>({url:`https://example.org/${index}`,title:`${word} tutorials | Art`,lastVisitTime:NOW}));
  const signatures=titleSignatures(items),options={salt:'fixture',blockedDomains:[],signatures};
  const state=act(createState(NOW),'INGEST',{observations:await Promise.all(items.map(row=>prepareObservation(row,catalog,options,NOW)))});
  assert.equal(state.candidates.find(row=>row.id==='Art').backgroundReason,'signature');
  assert.equal(state.candidateReview.selected.includes('Art'),false);
  const content=await prepareObservation({url:'https://example.org/real',title:'Art history | Art'},catalog,options,NOW);
  assert.equal(content.background?.some(row=>row.id==='Art')??false,false);
  const other=await prepareObservation({url:'https://different.org/real',title:'Learning | Art'},catalog,options,NOW);
  assert.equal(other.background?.some(row=>row.id==='Art')??false,false);
});

test('fresh evidence replaces stale classification for the same URL and retains only derived fields',async()=>{
  let state=await ingest(observation('Registration | University of Illinois'));
  state=act(state,'INGEST',{observations:[await observation('Illinois history','a','illinois.edu',NOW+1)]});
  assert.equal(state.candidates[0].contentCount,1);
  assert.equal(state.candidates[0].count,1);
  assert.equal(state.candidates[0].backgroundReason,null);
  assert.equal(JSON.stringify(state).includes('University of Illinois'),false);
  assert.equal('title' in state.evidence[0],false);
  assert.equal('url' in state.evidence[0],false);
});

test('draft is bounded, unsaved, durable and confirmed once without refilling',async()=>{
  let state=await ingest(observation('Machine learning and Basketball and Python and Art and Geology','a','example.org'));
  const selected=[...state.candidateReview.selected];
  assert.ok(selected.length>0 && selected.length<=6);
  assert.deepEqual(state.approved,[]);
  assert.throws(()=>buildRequest(state),/interest/i);
  state=act(structuredClone(state),'PRUNE');
  assert.deepEqual(state.candidateReview.selected,selected);
  state=edit(state,'remove',['Art']);
  state=act(state,'CONFIRM_CANDIDATE_DRAFT');
  assert.deepEqual(state.approved.map(row=>row.id).sort(),selected.filter(id=>id!=='Art').sort());
  assert.deepEqual(state.candidateReview.selected,[]);
  assert.deepEqual(act(state,'PRUNE').candidateReview.selected,[]);
  assert.ok(state.candidates.some(row=>row.id==='Art'));
});

test('candidate ignore, skip, restore and undo never suppress recommendations',async()=>{
  let state=await ingest(observation('Machine learning | University of Illinois'),observation('Basketball','b'));
  state=edit(state,'ignore',['Basketball']);
  assert.deepEqual(state.candidateReview.ignored,['Basketball']);
  assert.deepEqual(state.suppressed,[]);
  const generation=state.generation;
  state=act(state,'RECOMMENDATIONS',{generation,items:[catalog.find(row=>row.id==='Basketball')]});
  assert.deepEqual(state.recommendations.map(row=>row.id),['Basketball']);
  state=edit(state,'restore',['Illinois']);
  assert.ok(state.candidateReview.restored.includes('Illinois'));
  state=edit(state,'select',['Illinois']);
  state=edit(state,'undo');
  assert.equal(state.candidateReview.selected.includes('Illinois'),false);
  assert.ok(state.candidateReview.restored.includes('Illinois'));
  state=edit(state,'skip',['Machine learning']);
  assert.ok(state.candidateReview.skipped.includes('Machine learning'));
  assert.equal(state.candidateReview.ignored.includes('Machine learning'),false);
  state=act(state,'PRUNE');
  assert.ok(state.candidateReview.ignored.includes('Basketball'));
  assert.equal(state.generation,generation);
});

test('history cleanup prunes decisions and undo; backups exclude all browsing draft data',async()=>{
  let state=await ingest(observation('Machine learning | University of Illinois'));
  state=edit(state,'restore',['Illinois']);
  assert.equal(JSON.stringify(createBackup(state,NOW)).includes('candidateReview'),false);
  state=act(state,'PRUNE',{},NOW+31*DAY);
  for(const key of ['selected','skipped','ignored','restored'])assert.deepEqual(state.candidateReview[key],[]);
  assert.equal(state.candidateReview.undo,null);
  state=act(state,'CLEAR_DERIVED');
  assert.equal(state.candidateReview.initialized,false);
});

test('undo can return to an empty draft and rejected or stale IDs cannot be saved',async()=>{
  let state=await ingest(observation('Machine learning'));
  state=edit(state,'remove',['Machine learning']);
  state=edit(state,'select',['Machine learning']);
  state=edit(state,'undo');
  assert.deepEqual(state.candidateReview.selected,[]);
  state=edit(state,'select',['Not a candidate']);
  state=act(state,'CONFIRM_CANDIDATE_DRAFT');
  assert.deepEqual(state.approved,[]);
  state=edit(state,'select',['Machine learning']);
  state=act(state,'DELETE_SOURCES',{all:true});
  state=act(state,'CONFIRM_CANDIDATE_DRAFT');
  assert.deepEqual(state.approved,[]);
  assert.deepEqual(state.candidateReview.selected,[]);
});

test('an explicit draft choice survives later reclassification when older content evidence expires',async()=>{
  let state=await ingest(observation('Art history','old','example.org',NOW-29*DAY));
  state=edit(state,'select',['Art']);
  const items=['Machine learning','Python','Basketball'].map((word,index)=>({url:`https://example.org/new-${index}`,title:`${word} | Art`,lastVisitTime:NOW}));
  const signatures=titleSignatures(items);
  state=act(state,'INGEST',{observations:await Promise.all(items.map(item=>prepareObservation(item,catalog,{salt:'fixture',blockedDomains:[],signatures},NOW)))});
  state=act(state,'PRUNE',{},NOW+2*DAY);
  assert.equal(state.candidates.find(row=>row.id==='Art').backgroundReason,'signature');
  assert.ok(state.candidateReview.selected.includes('Art'));
});
