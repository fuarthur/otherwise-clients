import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, reduceState, buildRequest} from '../core/index.js';
import * as guide from '../ui/getting-started.js';
import {translate} from '../ui/i18n.js';

test('an unfinished guide resumes at recommendations after the first interest is saved', () => {
  const saved = reduceState(createState(), {type:'ADD_INTEREST', topic:'Gardening'});
  const restored = reduceState(JSON.parse(JSON.stringify(saved)), {type:'PRUNE'});
  assert.deepEqual(guide.guideProgress?.(restored)?.completed, [true, false, false]);
  assert.equal(guide.guideProgress(restored).step, 1);
  assert.equal(guide.guideProgress(restored).active, true);
});

test('the first task explains the actual save action and offers keyword examples', () => {
  const html = guide.gettingStartedGuide({text:(key, values) => translate('en', key, values), view:'interests', step:0, progress:guide.guideProgress(createState())});
  assert.match(html, /Save your first interest/);
  assert.match(html, /Photography/);
  assert.match(html, /Gardening/);
  assert.match(html, /press Add\./);
  assert.doesNotMatch(html, /data-guide-action="next"/);
});

test('recommendations and a successful search complete the three actual tasks', () => {
  const saved = reduceState(createState(), {type:'ADD_INTEREST', topic:'Gardening'});
  const ideas = reduceState(saved, {type:'RECOMMENDATIONS', generation:saved.generation, items:[{id:'Botany', topic:'Botany', domain:'Nature', description:'Plants.'}]});
  assert.deepEqual(guide.guideProgress(ideas).completed, [true, true, false]);
  assert.equal(guide.guideProgress(ideas).step, 2);
  const searched = reduceState(ideas, {type:'EXPLORE', topic:ideas.recommendations[0], parentId:'Gardening'});
  assert.deepEqual(guide.guideProgress(searched).completed, [true, true, true]);
  assert.equal(guide.guideProgress(searched).step, 3);
  assert.equal(guide.guideProgress(searched).searched.topic, 'Botany');
  assert.equal(guide.guideProgress(searched).count, 1);
});

test('closing and replaying the guide changes only local presentation preferences', () => {
  const saved = reduceState(createState(), {type:'ADD_INTEREST', topic:'Gardening'});
  const closed = reduceState(saved, {type:'SET_SETTINGS', patch:{tutorialSeen:true, tutorialActive:false}});
  assert.equal(closed.settings.tutorialActive, false);
  assert.equal(closed.generation, saved.generation);
  assert.deepEqual(buildRequest(closed), buildRequest(saved));
  const replay = reduceState(closed, {type:'SET_SETTINGS', patch:{tutorialSeen:false, tutorialActive:true}});
  assert.equal(guide.guideProgress(replay).active, true);
  assert.equal(replay.generation, saved.generation);
  assert.equal(reduceState(closed, {type:'RESET'}).settings.tutorialActive, true);
});

test('upgrading an existing saved profile keeps the automatic guide dismissed', () => {
  const legacy = reduceState(createState(), {type:'ADD_INTEREST', topic:'Gardening'});
  delete legacy.settings.tutorialActive;
  const migrated = reduceState(legacy, {type:'PRUNE'});
  assert.equal(migrated.settings.tutorialActive, false);
  assert.equal(guide.guideProgress(migrated).active, false);
  assert.deepEqual(migrated.approved, legacy.approved);
});
