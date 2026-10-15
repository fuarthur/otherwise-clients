import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, reduceState, buildRequest} from '../core/index.js';
import {createBackup, restoreBackup} from '../core/backup.js';

const now = 1770000000000;
const topic = {topic:'Botany',domain:'Nature',description:'Studying plants'};
const initial = () => reduceState(createState(now), {type:'ADD_INTEREST',topic:'Gardening'}, now);
const explore = (state, time = now) => {
  const next = reduceState(state, {type:'EXPLORE',topic,parentId:'Gardening',promptInterest:true}, time);
  assert.ok(Array.isArray(next.explorationPrompts), 'recommended exploration must retain a confirmation queue');
  return next;
};

test('a recommended search queues confirmation without changing interests or recommendation inputs', () => {
  const before = initial();
  const after = explore(before);
  assert.equal(after.explorationPrompts.length, 1);
  assert.equal(after.explorationPrompts[0].id, 'Botany');
  assert.ok(after.explorationPrompts[0].token);
  assert.deepEqual(after.approved, before.approved);
  assert.equal(after.focus, 'Gardening');
  assert.equal(after.generation, before.generation);
  assert.deepEqual(buildRequest(after), buildRequest(before));
});

test('postponing a confirmation survives reload and leaves search records and ranking unchanged', () => {
  const searched = explore(initial());
  const after = reduceState(searched, {type:'POSTPONE_EXPLORATION',tokens:[searched.explorationPrompts[0].token]}, now);
  const reloaded = reduceState(JSON.parse(JSON.stringify(after)), {type:'PRUNE'}, now);
  assert.deepEqual(reloaded.explorationPrompts, []);
  assert.deepEqual(reloaded.explored, searched.explored);
  assert.deepEqual(reloaded.suppressed, []);
  assert.equal(reloaded.generation, searched.generation);
  assert.deepEqual(buildRequest(reloaded), buildRequest(searched));
});

test('multiple searches merge by topic and a stale dismissal cannot discard a newer exploration', () => {
  const first = explore(initial());
  const stale = first.explorationPrompts[0].token;
  const repeated = explore(first, now + 1);
  assert.equal(repeated.explorationPrompts.length, 1);
  assert.notEqual(repeated.explorationPrompts[0].token, stale);
  const second = reduceState(repeated, {type:'EXPLORE',topic:'Ecology',promptInterest:true}, now + 2);
  assert.deepEqual(second.explorationPrompts.map(row => row.id), ['Botany','Ecology']);
  assert.equal(reduceState(second, {type:'POSTPONE_EXPLORATION',tokens:[stale]}, now).explorationPrompts.length, 2);
});

test('explicit save clears confirmation and follows the existing focus and widening rules', () => {
  let state = reduceState(initial(), {type:'SET_SETTINGS',patch:{mode:'global'}}, now);
  state = explore(state);
  const level = state.settings.globalLevel;
  state = reduceState(state, {type:'ADD_INTEREST',topic}, now);
  assert.deepEqual(state.explorationPrompts, []);
  assert.equal(state.focus, 'Botany');
  assert.equal(state.settings.globalLevel, level + 1);
  const removed = reduceState(state, {type:'REMOVE_INTEREST',id:'Botany'}, now);
  assert.deepEqual(removed.explorationPrompts, []);
});

test('ordinary map searches, saved interests and legacy exploration do not generate reminders', () => {
  const ordinary = reduceState(initial(), {type:'EXPLORE',topic}, now);
  assert.deepEqual(ordinary.explorationPrompts, []);
  const saved = reduceState(initial(), {type:'EXPLORE',topic:'Gardening',promptInterest:true}, now);
  assert.deepEqual(saved.explorationPrompts, []);
  delete ordinary.explorationPrompts;
  assert.deepEqual(reduceState(ordinary, {type:'PRUNE'}, now).explorationPrompts, []);
});

test('invalid prompts are pruned, reset clears them and backup replacement never revives reminders', () => {
  const state = explore(initial());
  state.explorationPrompts.push({id:'Unknown',token:'forged',at:now});
  assert.equal(reduceState(state, {type:'PRUNE'}, now).explorationPrompts.length, 1);
  assert.deepEqual(reduceState(state, {type:'RESET'}, now).explorationPrompts, []);
  const backup = createBackup(state, now);
  assert.equal(Object.hasOwn(backup.data, 'explorationPrompts'), false);
  assert.deepEqual(restoreBackup(state, backup, 'replace', now).explorationPrompts, []);
});
