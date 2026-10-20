import test from 'node:test';
import assert from 'node:assert/strict';
import {tourInterestScope} from '../ui/galaxy-tour-scope.js';
import {makeTourData} from './fixtures/galaxy-tour.js';

const data=makeTourData({edges:[['A','B',.2],['B','C',.3]]});
const state={approved:[{id:'A',domain:'Science'},{id:'B',domain:'Science'},{id:'C',domain:'Science'},
  {id:'Outside',domain:'Other'},{id:'A',domain:'Science'}],interestGroups:[
  {id:'small',name:'Small',interestIds:['A','Outside','Outside','Deleted']},
  {id:'pair',name:'Pair',interestIds:['B','C','C']},
]};

test('all-interest and saved-group scopes retain off-map notices but count only distinct mapped saved topics',()=>{
  const before=structuredClone(state);
  const all=tourInterestScope(state,data);
  assert.equal(all.mode,'all');assert.equal(all.count,3);assert.deepEqual(all.topics,['A','B','C','Outside']);
  const grouped=tourInterestScope(state,data,{mode:'group',ids:['pair']});
  assert.deepEqual(grouped.ids,['pair']);assert.deepEqual(grouped.topics,['B','C']);assert.equal(grouped.count,2);
  assert.deepEqual(grouped.choices.map(({id,count})=>({id,count})),[{id:'small',count:1},{id:'pair',count:2}]);
  const small=tourInterestScope(state,data,{mode:'group',ids:['small']});
  assert.equal(small.count,1);assert.deepEqual(small.topics,['A','Outside']);
  const deleted=tourInterestScope(state,data,{mode:'group',ids:['deleted']});
  assert.deepEqual(deleted.ids,[]);assert.deepEqual(deleted.topics,[],'A removed group must not silently broaden the route');
  const combined=tourInterestScope(state,data,{mode:'group',ids:['small','pair','pair']});
  assert.deepEqual(combined.topics,['A','B','C','Outside']);assert.equal(combined.count,3);
  assert.equal(tourInterestScope(state,data,{mode:'group'}).count,0,'A new group scope waits for an explicit selection');
  assert.deepEqual(state,before);
});

test('category scopes use the catalog classification and keep categories with fewer than two topics visible',()=>{
  const mixed={...state,approved:[{id:'A',domain:'Outdated category'},{id:'B',domain:'Science'},
    {id:'C',domain:'Science'},{id:'Outside',domain:'Other'},{id:'Unclassified',domain:'Custom'}]};
  const category=tourInterestScope(mixed,data,{mode:'category',ids:['Science']});
  assert.equal(category.mode,'category');assert.deepEqual(category.ids,['Science']);
  assert.deepEqual(category.topics,['A','B','C']);assert.equal(category.count,3);
  const other=tourInterestScope(mixed,data,{mode:'category',ids:['Other']});
  assert.deepEqual(other.topics,['Outside']);assert.equal(other.count,0);
  assert.equal(category.choices.find(choice=>choice.id==='').count,0);
  const empty=tourInterestScope({approved:[],interestGroups:[]},data,{mode:'group'});
  assert.deepEqual(empty.choices,[]);assert.deepEqual(empty.ids,[]);assert.equal(empty.count,0);
});

test('several small groups can form a two-topic tour, while overlapping memberships never inflate the count',()=>{
  const grouped={approved:state.approved,interestGroups:[
    {id:'one',name:'One',interestIds:['A']},{id:'same',name:'Same',interestIds:['A']},
    {id:'two',name:'Two',interestIds:['B']},
  ]};
  assert.equal(tourInterestScope(grouped,data,{mode:'group',ids:['one','same']}).count,1);
  const combined=tourInterestScope(grouped,data,{mode:'group',ids:['one','same','two']});
  assert.equal(combined.count,2);assert.deepEqual(combined.topics,['A','B']);
});
