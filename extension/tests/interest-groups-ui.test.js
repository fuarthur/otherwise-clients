import test from 'node:test';
import assert from 'node:assert/strict';
import {createInterestGroupsUI} from '../ui/interest-groups.js';

const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64);
const fixture = () => ({
  approved:['Botany','Ecology','Urban planning','Drawing'].map(id => ({id,topic:id})),
  interestGroups:[
    {id:a,name:'Plants',interestIds:['Botany','Ecology']},
    {id:b,name:'Cities',interestIds:['Ecology','Urban planning','Missing']},
    {id:c,name:'Empty group',interestIds:[]},
  ],
  recommendationGroupIds:null,
});
const ui = (state, options = {}) => createInterestGroupsUI({getState:() => state,getLanguage:() => 'en',...options});

test('browse counts overlapping saved memberships once and ignores missing topics', () => {
  const html = ui(fixture()).interestsView();
  assert.match(html, /<option value="all"[^>]*>All interests · 4<\/option>/);
  assert.match(html, /<option value="ungrouped"[^>]*>Ungrouped · 1<\/option>/);
  assert.match(html, new RegExp(`<option value="${b}"[^>]*>Cities · 2<\\/option>`));
});

test('user group names and IDs cannot escape generated markup', () => {
  const state = fixture();
  state.interestGroups[0].name = '<img src=x onerror="alert(1)"> & plants';
  const html = ui(state).interestsView(a);
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; plants/);
  assert.ok(!html.includes('data-action='), 'module controls must not enter the parent generic action handler');
});

test('selected empty groups expose editing while disabling recommendations', () => {
  const html = ui(fixture()).interestsView(c);
  assert.match(html, /data-group-action="edit"/);
  assert.match(html, /<button[^>]*data-group-action="recommend"[^>]* disabled/);
  assert.match(html, /Add interests to this group/);
});

test('Discover shows the deduplicated selected seed count and group labels', () => {
  const state = fixture(); state.recommendationGroupIds = [a,b];
  const html = ui(state).discoverView();
  assert.match(html, /Plants/);
  assert.match(html, /Cities/);
  assert.match(html, /3 interests/);
  assert.ok(!html.includes('data-action='));
});

test('legacy profiles default to all interests and both views support Chinese', () => {
  const state = {approved:[{id:'Botany',topic:'Botany'}]};
  assert.match(ui(state).discoverView(), /All interests/);
  assert.match(ui(state).discoverView(), /1 interest/);
  assert.doesNotMatch(ui(state).discoverView(), /1 interests/);
  const localized = ui(state,{getLanguage:() => 'zh-CN'});
  assert.match(localized.interestsView(), /所有兴趣/);
  assert.match(localized.interestsView(), /新建分组/);
  assert.match(localized.discoverView(), /选择分组/);
});

test('saved interests have no UI count cap', () => {
  const state = fixture();
  state.approved = Array.from({length:1200},(_,i) => ({id:`Interest ${i}`,topic:`Interest ${i}`}));
  state.interestGroups[0].interestIds = state.approved.map(row => row.id);
  state.recommendationGroupIds = [a];
  assert.match(ui(state).interestsView(a), /Plants · 1200/);
  assert.match(ui(state).discoverView(), /1200 interests/);
});

test('binding is idempotent and Recommend checks current membership before dispatch', async () => {
  const state = fixture(), listeners = {}, requested = [];
  const control = {dataset:{groupAction:'recommend',groupId:a},disabled:false,
    addEventListener(type, callback) {listeners[type] = [...(listeners[type] || []),callback];}};
  const root = {querySelectorAll(selector) {return selector === '[data-group-action]' ? [control] : [];}};
  const groups = ui(state,{onRecommend:ids => requested.push(ids)});
  groups.bind(root); groups.bind(root);
  assert.equal(listeners.click.length,1);
  await listeners.click[0]({preventDefault(){},currentTarget:control});
  assert.deepEqual(requested,[[a]]);
  state.interestGroups[0].interestIds = [];
  await listeners.click[0]({preventDefault(){},currentTarget:control});
  assert.deepEqual(requested,[[a]], 'a group emptied by another window cannot trigger a request');
});
