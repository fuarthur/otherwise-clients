import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, reduceState, buildRequest} from '../core/index.js';
import {createBackup, restoreBackup} from '../core/backup.js';
import {hiddenTopicsPage, hiddenTopicsView, dismissUndoView, hiddenText} from '../ui/hidden-topics.js';
import {createController} from '../controller.js';

const NOW = 1_800_000_000_000;
const topic = name => ({id:name, topic:name, domain:'Science', description:`About ${name}`});
const apply = (state, type, values = {}, now = NOW) => reduceState(state, {type, ...values}, now);
const ids = rows => rows.map(row => row.id);
function fixture() {
  let state = apply(createState(NOW), 'ADD_INTEREST', {topic:'Gardening'});
  state = apply(state, 'RECOMMENDATIONS', {generation:state.generation, items:[topic('Botany'), topic('Ecology'), topic('Forestry')]});
  return state;
}
const observation = name => ({sourceHash:`hash-${name}`,host:'example.org',seenAt:NOW,topicIds:[name],topics:[topic(name)],source:'Chrome'});

test('dismissal undo restores the original result position without changing the interest profile', () => {
  const before = fixture(), request = buildRequest(before);
  let state = apply(before, 'DISMISS', {id:'Ecology'});
  assert.deepEqual(ids(state.recommendations), ['Botany','Forestry']);
  assert.match(state.dismissalUndo?.token || '', /^[a-f\d]{64}$/);
  state = apply(state, 'UNDO_DISMISS', {token:state.dismissalUndo.token});
  assert.deepEqual(ids(state.recommendations), ['Botany','Ecology','Forestry']);
  assert.deepEqual(state.recommendationBatch, before.recommendationBatch);
  assert.deepEqual(state.suppressed, []);
  assert.equal(state.dismissalUndo, null);
  assert.equal(state.generation, before.generation);
  assert.deepEqual(state.approved, before.approved);
  assert.deepEqual(state.baseline, before.baseline);
  assert.equal(state.focus, before.focus);
  assert.deepEqual(buildRequest(state), request);
});

test('only the latest dismissal token works and repeated or invalid dismissals keep its undo', () => {
  let state = apply(fixture(), 'DISMISS', {id:'Botany'});
  const oldToken = state.dismissalUndo?.token;
  state = apply(state, 'DISMISS', {id:'Ecology'});
  const undo = state.dismissalUndo;
  assert.ok(undo);
  assert.notEqual(undo.token, oldToken);
  for (const id of ['Ecology', '', 'https://example.org', null, `Bad ID${' '.repeat(20000)}`]) {
    state = apply(state, 'DISMISS', {id});
    assert.deepEqual(state.dismissalUndo, undo);
  }
  for (const token of [oldToken, '', null]) {
    state = apply(state, 'UNDO_DISMISS', {token});
    assert.deepEqual(state.suppressed, ['Botany','Ecology']);
    assert.deepEqual(state.dismissalUndo, undo);
  }
  state = apply(state, 'UNDO_DISMISS', {token:undo.token});
  assert.deepEqual(state.suppressed, ['Botany']);
  assert.deepEqual(ids(state.recommendations), ['Ecology','Forestry']);
});

test('new batches permit unhiding while preventing old result resurrection even at the same timestamp', () => {
  let state = apply(fixture(), 'DISMISS', {id:'Ecology'});
  const token = state.dismissalUndo?.token;
  state = apply(state, 'RECOMMENDATIONS', {generation:state.generation,items:[topic('New topic'),topic('Ecology')]});
  state = apply(state, 'UNDO_DISMISS', {token});
  assert.deepEqual(state.suppressed, []);
  assert.deepEqual(ids(state.recommendations), ['New topic']);
  assert.deepEqual(ids(state.recommendationBatch.items), ['New topic']);
});

test('settings and derived-data clearing cannot let an undo resurrect an obsolete batch', () => {
  for (const action of [{type:'SET_SETTINGS',patch:{mode:'global'}},{type:'CLEAR_DERIVED'},{type:'INVALIDATE'}]) {
    let state = apply(fixture(), 'DISMISS', {id:'Ecology'});
    const token = state.dismissalUndo?.token;
    state = reduceState(state, action, NOW);
    const generation = state.generation;
    state = apply(state, 'UNDO_DISMISS', {token});
    assert.deepEqual(state.suppressed, [], action.type);
    assert.deepEqual(state.recommendations, [], action.type);
    assert.equal(state.recommendationBatch, null, action.type);
    assert.equal(state.generation, generation, action.type);
  }
});

test('a retained discovery batch from before Save is not restored by a later dismissal undo', () => {
  let state = apply(fixture(), 'ADD_INTEREST', {topic:'Botany'});
  state = apply(state, 'DISMISS', {id:'Ecology'});
  const token = state.dismissalUndo?.token;
  state = apply(state, 'UNDO_DISMISS', {token});
  assert.deepEqual(state.suppressed, []);
  assert.deepEqual(state.recommendations, []);
  assert.deepEqual(ids(state.recommendationBatch.items), ['Botany','Forestry']);
});

test('a live recommendation batch from an older install supports immediate dismissal undo', () => {
  const legacy = fixture();
  delete legacy.recommendationBatch.generation;
  delete legacy.dismissalUndo;
  let state = apply(JSON.parse(JSON.stringify(legacy)), 'PRUNE');
  state = apply(state, 'DISMISS', {id:'Ecology'});
  state = apply(state, 'UNDO_DISMISS', {token:state.dismissalUndo.token});
  assert.deepEqual(ids(state.recommendations), ['Botany','Ecology','Forestry']);
  assert.deepEqual(ids(state.recommendationBatch.items), ['Botany','Ecology','Forestry']);
  assert.deepEqual(state.suppressed, []);
});

test('legacy batch migration does not treat retained or mismatched results as current', () => {
  const retained = apply(fixture(), 'ADD_INTEREST', {topic:'Botany'});
  const mismatched = fixture();
  mismatched.recommendations = [topic('New topic')];
  for (const legacy of [retained,mismatched]) {
    delete legacy.recommendationBatch.generation;
    let state = apply(JSON.parse(JSON.stringify(legacy)), 'PRUNE');
    state = apply(state, 'DISMISS', {id:'Ecology'});
    state = apply(state, 'UNDO_DISMISS', {token:state.dismissalUndo.token});
    assert.deepEqual(state.recommendations, legacy.recommendations);
    assert.deepEqual(ids(state.recommendationBatch.items), ['Botany','Forestry']);
    assert.deepEqual(state.suppressed, []);
  }
});

test('serialized undo remains valid across restart and clearing requires its current token', () => {
  let state = apply(fixture(), 'DISMISS', {id:'Ecology'});
  assert.ok(state.dismissalUndo);
  const token = state.dismissalUndo.token;
  state = apply(JSON.parse(JSON.stringify(state)), 'PRUNE');
  const cleared = apply(state, 'CLEAR_DISMISS_UNDO', {token:'stale-token'});
  assert.equal(cleared.dismissalUndo?.token, token);
  const undone = apply(cleared, 'UNDO_DISMISS', {token});
  assert.deepEqual(ids(undone.recommendations), ['Botany','Ecology','Forestry']);
  state = apply(state, 'CLEAR_DISMISS_UNDO', {token});
  assert.equal(state.dismissalUndo, null);
  assert.deepEqual(state.suppressed, ['Ecology']);
  assert.deepEqual(ids(state.recommendations), ['Botany','Forestry']);
});

test('restoring hidden candidates rebuilds existing evidence after reload without saving them', () => {
  let state = apply(createState(NOW), 'INGEST', {observations:[observation('Botany'),observation('Ecology')]});
  state = apply(state, 'DISMISS', {id:'Botany'});
  state = apply(state, 'DISMISS', {id:'Ecology'});
  state = apply(state, 'CLEAR_DISMISS_UNDO', {token:state.dismissalUndo?.token});
  state = apply(JSON.parse(JSON.stringify(state)), 'RESTORE_HIDDEN', {ids:['Botany','Botany',null,'Unknown']});
  assert.deepEqual(ids(state.candidates), ['Botany']);
  assert.equal(state.candidates[0].count, 1);
  assert.deepEqual(state.suppressed, ['Ecology']);
  assert.deepEqual(state.approved, []);
  assert.equal(state.focus, null);
  assert.equal(state.generation, 0);
  state = apply(state, 'INGEST', {observations:[{...observation('Botany'),sourceHash:'new-source'}]});
  assert.equal(state.candidates[0].count, 2);
});

test('general restoration of a removed interest does not save it or change expansion', () => {
  let state = apply(fixture(), 'INGEST', {observations:[observation('Gardening')]});
  state = apply(state, 'SET_SETTINGS', {patch:{mode:'global'}});
  state = apply(state, 'REMOVE_INTEREST', {id:'Gardening'});
  const generation = state.generation, undo = state.interestUndo;
  state = apply(JSON.parse(JSON.stringify(state)), 'RESTORE_HIDDEN', {ids:['Gardening']});
  assert.deepEqual(state.suppressed, []);
  assert.deepEqual(ids(state.candidates), ['Gardening']);
  assert.deepEqual(state.approved, []);
  assert.deepEqual(state.baseline, []);
  assert.equal(state.focus, null);
  assert.equal(state.settings.globalLevel, 0);
  assert.equal(state.generation, generation);
  assert.deepEqual(state.interestUndo, undo);
});

test('legacy and malformed dismissal records are safely discarded and cannot insert caller-supplied rows', () => {
  const before = fixture();
  delete before.dismissalUndo;
  assert.equal(apply(before, 'PRUNE').dismissalUndo, null);
  const hidden = apply(before, 'DISMISS', {id:'Ecology'});
  assert.ok(hidden.dismissalUndo);
  const valid = hidden.dismissalUndo;
  for (const value of [true, [], {}, {...valid,token:'x'}, {...valid,generation:-1}, {...valid,batchIndex:100}, {...valid,row:topic('Forged')}, {...valid,row:{...valid.row,description:'x'.repeat(20000)}}]) {
    const state = apply({...hidden,dismissalUndo:value}, 'UNDO_DISMISS', {token:valid.token,row:topic('Forged')});
    assert.equal(state.dismissalUndo, null);
    assert.deepEqual(state.suppressed, ['Ecology']);
    assert.deepEqual(ids(state.recommendations), ['Botany','Forestry']);
  }
});

test('reset removes undo, and portable backups contain hidden IDs without transient undo data', () => {
  const state = apply(fixture(), 'DISMISS', {id:'Ecology'});
  const backup = createBackup(state, NOW);
  assert.deepEqual(backup.data.suppressed, ['Ecology']);
  assert.equal(Object.hasOwn(backup.data, 'dismissalUndo'), false);
  const reset = apply(state, 'RESET');
  assert.equal(reset.dismissalUndo, null);
  assert.deepEqual(apply(reset, 'UNDO_DISMISS', {token:state.dismissalUndo?.token}).recommendations, []);
});

test('hidden-topic pagination filters string IDs and clamps pages to ten rows', () => {
  const state = {suppressed:[...Array.from({length:23}, (_, i) => `Topic ${i + 1}`),'Topic 1',null,{id:'Forged'}]};
  const first = hiddenTopicsPage(state, {});
  assert.deepEqual(first.items, ['Topic 1','Topic 2','Topic 3','Topic 4','Topic 5','Topic 6','Topic 7','Topic 8','Topic 9','Topic 10']);
  assert.deepEqual({total:first.total,hiddenCount:first.hiddenCount,page:first.page,pageCount:first.pageCount,start:first.start,end:first.end}, {total:23,hiddenCount:23,page:1,pageCount:3,start:1,end:10});
  assert.deepEqual(hiddenTopicsPage(state, {page:999}).items, ['Topic 21','Topic 22','Topic 23']);
  assert.equal(hiddenTopicsPage(state, {page:NaN}).page, 1);
  const filtered = hiddenTopicsPage(state, {query:'  TOPIC 2 ',page:20});
  assert.deepEqual(filtered.items, ['Topic 2','Topic 20','Topic 21','Topic 22','Topic 23']);
  assert.equal(filtered.total, 5);
  assert.equal(filtered.hiddenCount, 23);
  assert.equal(filtered.page, 1);
});

test('hidden-topic views escape topic names and attributes with safe stable focus keys', () => {
  const name = 'Topic "quote" <img src=x> & detail';
  const html = hiddenTopicsView({suppressed:[name]}, {language:'en',query:'"',page:1,pending:true});
  assert.ok(html.includes('Topic &quot;quote&quot; &lt;img src=x&gt; &amp; detail'));
  assert.equal(html.includes('<img'), false);
  assert.match(html, /data-action="restore-hidden"[^>]*data-id="Topic &quot;quote&quot; &lt;img src=x&gt; &amp; detail"/);
  assert.match(html, /data-action="restore-hidden"[^>]* disabled/);
  assert.match(html, /id="hidden-topic-search"[^>]*value="&quot;"/);
  for (const [,key] of html.matchAll(/data-focus="([^"]*)"/g)) assert.match(key, /^[a-z\d-]+$/);
  const again = hiddenTopicsView({suppressed:['Other',name]}, {language:'en',query:name,page:1});
  assert.equal(/data-focus="(hidden-restore-[^"]+)"/.exec(html)?.[1], /data-focus="(hidden-restore-[^"]+)"/.exec(again)?.[1]);
});

test('hidden-topic views provide bilingual empty, filtered-empty and page-navigation states', () => {
  const empty = hiddenTopicsView({suppressed:[]}, {language:'zh-CN'});
  assert.ok(empty.includes(hiddenText('zh-CN','empty')));
  assert.equal(empty.includes('data-action="restore-hidden"'), false);
  const noMatches = hiddenTopicsView({suppressed:['Botany']}, {language:'en',query:'missing'});
  assert.ok(noMatches.includes(hiddenText('en','noMatches')));
  assert.match(noMatches, /data-action="hidden-clear-search"/);
  const middle = hiddenTopicsView({suppressed:Array.from({length:23}, (_, i) => `Topic ${i + 1}`)}, {language:'zh-CN',page:2});
  assert.match(middle, /data-action="hidden-prev"/);
  assert.match(middle, /data-action="hidden-next"/);
  assert.ok(middle.includes('11–20'));
  assert.ok(middle.includes(hiddenText('zh-CN','restore')));
  assert.notEqual(hiddenText('en','title'), hiddenText('zh-CN','title'));
});

test('dismissal notices expose protected undo and dismiss actions without trusting raw markup', () => {
  const name = 'Topic <b> & "details"';
  const state = apply(fixture(), 'DISMISS', {id:name});
  const html = dismissUndoView(state, {language:'zh-CN',pending:true});
  assert.match(html, /Topic &lt;b&gt; &amp; &quot;details&quot;/);
  assert.equal(html.includes('<b>'), false);
  assert.ok(html.includes(hiddenText('zh-CN','undo')));
  assert.match(html, /data-action="undo-dismiss"[^>]*data-token="[a-f\d]{64}"[^>]* disabled/);
  assert.match(html, /data-action="clear-dismiss-undo"/);
  assert.equal(dismissUndoView(createState(NOW), {language:'en'}), '');
  assert.equal(dismissUndoView({...state,dismissalUndo:{...state.dismissalUndo,token:'" onclick="bad'}}, {}), '');
});

test('oversized recommendation metadata cannot remove the ability to undo its suppression', () => {
  let state = fixture();
  state = apply(state, 'RECOMMENDATIONS', {generation:state.generation,items:[{...topic('Large source'),discovery:{
    concept_id:'Q1',area_id:'science',graph_path:['Science','Large source'],level:1,exploration_pick:false,
    exploration_target:0,exploration_achieved:0,source_url:`https://www.wikidata.org/wiki/Q1?ref=${'x'.repeat(20000)}`,
  }}]});
  state = apply(state, 'DISMISS', {id:'Large source'});
  assert.ok(state.dismissalUndo);
  assert.ok(JSON.stringify(state.dismissalUndo).length < 12000);
  state = apply(state, 'UNDO_DISMISS', {token:state.dismissalUndo.token});
  assert.deepEqual(state.suppressed, []);
});

test('both backup import modes clear the local undo so it cannot undo an imported hidden choice', () => {
  const state = apply(fixture(), 'DISMISS', {id:'Ecology'});
  const backup = createBackup(state, NOW);
  for (const mode of ['merge','replace']) {
    const restored = restoreBackup(state, backup, mode, NOW);
    assert.equal(restored.dismissalUndo, null, mode);
    const next = apply(restored, 'UNDO_DISMISS', {token:state.dismissalUndo.token});
    assert.deepEqual(next.suppressed, ['Ecology'], mode);
    assert.deepEqual(next.recommendations, [], mode);
  }
});

test('controller serializes window actions and restores persisted visibility without a network request', async () => {
  const before = fixture();
  let stored = structuredClone(before);
  const requests = [];
  const controllerForStoredState = () => createController({catalog:[],clock:() => NOW,
    readState:async () => structuredClone(stored),writeState:async value => {stored = structuredClone(value);},
    historySearch:async () => [],hasHistoryPermission:async () => false,hasEndpointPermission:async () => false,
    fetchImpl:async (...args) => {requests.push(args);throw new Error('Visibility changes must stay local');},openTab:async () => {},
  });
  let controller = controllerForStoredState();
  const [firstWindow, secondWindow] = await Promise.all([
    controller.dispatch({type:'DISMISS',id:'Botany'}),controller.dispatch({type:'DISMISS',id:'Ecology'}),
  ]);
  await assert.doesNotReject(() => controller.dispatch({type:'UNDO_DISMISS',token:firstWindow.dismissalUndo.token}));
  assert.deepEqual((await controller.getState()).suppressed, ['Botany','Ecology']);
  controller = controllerForStoredState();
  await assert.doesNotReject(() => controller.dispatch({type:'UNDO_DISMISS',token:secondWindow.dismissalUndo.token}));
  let state = await controller.getState();
  assert.deepEqual(ids(state.recommendations), ['Ecology','Forestry']);
  await assert.doesNotReject(() => controller.dispatch({type:'RESTORE_HIDDEN',ids:['Botany']}));
  state = await controller.dispatch({type:'DISMISS',id:'Forestry'});
  await assert.doesNotReject(() => controller.dispatch({type:'CLEAR_DISMISS_UNDO',token:state.dismissalUndo.token}));
  state = await controller.getState();
  assert.equal(state.dismissalUndo, null);
  assert.deepEqual(state.suppressed, ['Forestry']);
  assert.equal(state.generation, before.generation);
  assert.deepEqual(buildRequest(state), buildRequest(before));
  assert.deepEqual(requests, []);
});
