export const candidateReviewCopy={
  draft:['Interest draft','兴趣草稿'], groups:['By category','分类多选'], cards:['One at a time','单卡挑选'],
  help:['A small starting point. Remove what does not fit, then confirm.','先拟一小份兴趣。移出不合适的，再一次确认。'],
  unsaved:['Not saved yet · {count} selected','尚未保存 · 已选 {count} 个'],
  confirm:['Confirm {count} interests','确认保存 {count} 个兴趣'],
  emptyDraft:['Your draft is empty','草稿里还没有兴趣'],
  emptyHelp:['Choose a few candidates, or finish here. You do not need to review everything.','可以再挑几个，也可以就到这里，不必处理完所有候选。'],
  noCandidates:['No candidates yet','暂时没有候选'],
  noCandidatesHelp:['Review recent browsing to make a draft.','从近期浏览记录中生成一份兴趣草稿。'],
  support:['{pages} pages · {sites} sites','{pages} 个页面 · {sites} 个网站'],
  remove:['Remove {topic} from draft','从草稿中移出 {topic}'],
  add:['Add to draft','加入草稿'], ignore:['Ignore candidate','忽略候选'], skip:['Skip for now','暂时跳过'],
  cardHelp:['↑ Add · ↓ Ignore · → or tap to skip','↑ 加入 · ↓ 忽略 · → 或轻点跳过'],
  cardSwipe:['Drag up to add, down to ignore.','上滑加入，下滑忽略。'],
  queue:['{count} undecided · stop whenever you like','还有 {count} 个未选择 · 随时可以结束'],
  queueDone:['That is enough for now','可以就到这里'],
  queueDoneHelp:['Review your draft and confirm what you want to keep.','回到草稿，确认你想留下的兴趣。'],
  resume:['Revisit skipped candidates','再看看跳过的候选'],
  restart:['Make a new draft','重新起草'], undo:['Undo last change','撤销上一步'],
  selectedGroup:['{selected} / {count} selected','已选 {selected} / {count}'],
  selectGroup:['Select this category','选择这一类'], clearGroup:['Clear this category','取消选择这一类'],
  search:['Find a candidate','查找候选词'], noMatch:['No matching candidates','没有匹配的候选词'],
  more:['Show more ({count} remaining)','显示更多（剩余 {count} 个）'],
  folded:['Background & ignored · {count}','背景词与已忽略 · {count}'],
  foldedHelp:['These are left out of the draft. Restore any that matter to you.','这些词暂不放入草稿。判断不合适时，可以随时放回候选。'],
  institution:['Found only in an institution name','仅在学校或机构名称中出现'],
  signature:['Found only in a site signature','仅在网站署名中出现'],
  ignored:['You ignored this browsing candidate','你忽略了这个浏览候选'],
  restore:['Restore candidate','放回候选'],
  allCategories:['All categories','所有分类'],
  draftLink:['Review draft','查看草稿'],
  changed:['Draft updated. Nothing saved yet.','草稿已更新，尚未保存为兴趣。'],
};

export function reviewText(language,key,values={}) {
  const pair=candidateReviewCopy[key];
  return (pair?.[language==='zh-CN'?1:0]??key).replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??''));
}
