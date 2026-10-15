import test from 'node:test';
import assert from 'node:assert/strict';
import {createInterestInput} from '../ui/interest-input.js';

const island = {id:'Java',topic:'Java',domain:'Geography',description:'island of Indonesia'};
const programming = {id:'Java (programming language)',topic:'Java (programming language)',domain:'Computing',description:'object-oriented language'};
const senses = {schemaVersion:1,senses:[
  {id:'Q3757',label:'Java (island)',description:'An island.',catalogIds:['Java'],aliases:['Java','Java island']},
  {id:'Q251',label:programming.topic,description:'A language.',catalogIds:[programming.id],aliases:['Java','Java programming']},
]};

test('a bare exact title does not silently win over another meaning', () => {
  const input = createInterestInput([island,programming],senses);
  const result = input.query('Java');
  assert.equal(result.requiresChoice,true);
  assert.deepEqual(result.choices.map(row=>row.label),['Java (island)','Java (programming language)']);
  assert.equal(input.select('Q251').topic,programming.topic);
  assert.equal(input.select('Q3757').id,'Java');
});

test('a reviewed sense absent from the catalog is informational, never a generated custom input', () => {
  const asset = structuredClone(senses); asset.senses[1].catalogIds=[];
  const input = createInterestInput([island],asset);
  const result = input.query('Java');
  assert.equal(result.requiresChoice,true);
  assert.equal(result.choices.find(row=>row.id==='Q251').available,false);
  assert.equal(input.select('Q251'),null);
  assert.equal(input.query('Java software development').requiresChoice,false);
  assert.equal(input.query('Java programming').requiresChoice,false);
  assert.equal(input.query('Java programming').choices[0].available,false);
});

test('normalized leading and trailing separators cannot bypass catalog meaning confirmation', () => {
  const input = createInterestInput([island,programming],senses);
  for (const text of ['Java-', 'Java_', 'Java —', '_Java', '— Java -']) {
    const result = input.query(text);
    assert.equal(result.requiresChoice,true,text);
    assert.deepEqual(result.choices.map(row=>row.id),['Q3757','Q251'],text);
  }
});

test('even a sole exact catalog match asks the user to confirm its description', () => {
  const input = createInterestInput([island],{schemaVersion:1,senses:[]});
  assert.equal(input.query('Java').requiresChoice,true);
  assert.equal(input.select('catalog:Java').id,'Java');
});

test('catalog title qualifiers offer alternatives without merging distinct identities', () => {
  const input=createInterestInput([island,programming],{schemaVersion:1,senses:[]});
  assert.equal(input.query('Java').choices.length,2);
  assert.equal(input.select('catalog:Java (programming language)').id,programming.id);
});

test('suggestions retain punctuation and do not convert an unknown phrase', () => {
  const input=createInterestInput(['C','C++','C#'].map(topic=>({id:topic,topic,domain:'Computing',description:'Language'})),{schemaVersion:1,senses:[]});
  assert.deepEqual(input.query('C++').choices.map(row=>row.label),['C++']);
  assert.equal(input.query('my pottery experiments').requiresChoice,false);
  assert.equal(input.query('my pottery experiments').choices.length,0);
  assert.equal(input.query('').choices.length,0);
});

test('a saved equivalent keeps its existing title rather than adding a duplicate', () => {
  const catalog=[{id:'Python programming',topic:'Python programming',domain:'Computing',description:'Language'}, {id:'Python (programming language)',topic:'Python (programming language)',domain:'Computing',description:'Language'}];
  const input=createInterestInput(catalog,{schemaVersion:1,senses:[{id:'Q28865',label:'Python (programming language)',description:'Language',aliases:['Python'],catalogIds:catalog.map(r=>r.id)}]});
  assert.equal(input.select('Q28865', [catalog[1]]).id,catalog[1].id);
  assert.equal(input.query('Pyth').choices.length,1);
});
