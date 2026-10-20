import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReviewPage, reviewPanelHeight} from '../ui/candidate-review.js';
import {candidateReviewCopy} from '../ui/candidate-review-i18n.js';

const topics = count => Array.from({length:count}, (_, i) => ({id:`topic-${i+1}`, topic:`Topic ${i+1}`}));

for (const [desktop, size] of [[false,5],[true,8]]) {
  test(`306 review topics stay reachable in bounded ${size}-item pages`, () => {
    const all = topics(306);
    const first = candidateReviewPage(all,1,desktop);
    assert.equal(first.items.length,size);
    const pages = Array.from({length:first.pageCount}, (_,i) => candidateReviewPage(all,i+1,desktop));
    assert.ok(pages.every(page => page.items.length <= size));
    assert.deepEqual(pages.flatMap(page => page.items),all);
    assert.equal(pages.at(-1).end,306);
  });
}

test('review workspace fits the remaining viewport and limits very tall windows', () => {
  assert.equal(reviewPanelHeight(900,230),642);
  assert.equal(reviewPanelHeight(850,300),522);
  assert.equal(reviewPanelHeight(600,350),260);
  assert.equal(reviewPanelHeight(1400,200),680);
});

test('draft controls and recovery reasons have matching English and Chinese interpolation fields',()=>{
  const fields=value=>[...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for(const [key,[en,zh]] of Object.entries(candidateReviewCopy)){
    assert.ok(en && zh,key);
    assert.deepEqual(fields(en),fields(zh),key);
  }
});
