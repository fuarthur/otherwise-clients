import {validStatsSnapshot,initializeStats,acknowledgeHistory,summarizeStats} from './stats.js';
import {createState, reduceState, sanitizeTopic, isAllowedUrl} from './index.js';
import {isConceptId, isAreaId, validRating} from './discovery.js';
import {normalizeInterestGroups,normalizeGroupScope} from './interest-groups.js';
import {DEFAULT_THEME,normalizeThemeId} from './themes.js';
import {DEFAULT_TOUR_MUSIC_VOLUME,DEFAULT_TOUR_MUSIC_MODE} from './galaxy-tour-music.js';

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const preferenceKeys = ['language','theme','mode','globalLevel','recommendationView','galaxyExplorationMode','galaxyLayoutOptions','galaxyShowDomainLabels','galaxyShowInterestLabels','recommendationOptions','recommendationKind','discoveryExploration','soundEffectsEnabled','soundEffectsVolume','galaxyTourMusic','galaxyTourMusicVolume','galaxyTourMusicMode','blockedDomains','statsFollowSystemTimeZone','statsTimeZone'];
const optionalPreferences = ['galaxyTourMusic','galaxyTourMusicVolume','galaxyTourMusicMode','theme','statsFollowSystemTimeZone','statsTimeZone'];
const invalid = () => { throw new Error('This is not a valid OtherWise backup.'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const time = value => Number.isSafeInteger(value) && value >= 0;
const text = (value, max = 120) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
function sameValue(left, right) {
  if (left === right) return true;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value,index) => sameValue(value,right[index]));
  if (!object(left) || !object(right)) return false;
  const names = Object.keys(left);
  return names.length === Object.keys(right).length && names.every(name => Object.hasOwn(right,name) && sameValue(left[name],right[name]));
}
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid();
}
function list(value, max, clean) {
  if (!Array.isArray(value) || value.length > max) invalid();
  return value.map(clean);
}
function topic(value, history = false) {
  keys(value, ['id','topic','domain','description','discovery',history ? 'at' : 'addedAt',...(history ? ['parentId'] : [])]);
  const cleaned = sanitizeTopic(value);
  if (!cleaned || cleaned.id !== value.id || cleaned.topic !== value.topic || !time(value[history ? 'at' : 'addedAt']) ||
      typeof value.domain !== 'string' || value.domain.length > 80 || typeof value.description !== 'string' || value.description.length > 500 ||
      history && value.parentId !== null && !text(value.parentId)) invalid();
  return {...cleaned, ...(history ? {at:value.at, parentId:value.parentId} : {addedAt:value.addedAt})};
}
function preferences(value) {
  keys(value, preferenceKeys);
  if (preferenceKeys.some(key => !optionalPreferences.includes(key) && !Object.hasOwn(value, key))) invalid();
  const {globalLevel, ...patch} = {theme:DEFAULT_THEME,galaxyTourMusicVolume:DEFAULT_TOUR_MUSIC_VOLUME,galaxyTourMusicMode:DEFAULT_TOUR_MUSIC_MODE,statsFollowSystemTimeZone:true,statsTimeZone:createState().settings.statsTimeZone,...value};
  if (!Number.isInteger(globalLevel) || globalLevel < 0 || globalLevel > 8 ||
      !Array.isArray(patch.blockedDomains) || patch.blockedDomains.length > 500) invalid();
  const normalized = reduceState(createState(), {type:'SET_SETTINGS',patch});
  if (normalized.lastError || Object.keys(patch).some(key => !sameValue(patch[key],normalized.settings[key]))) invalid();
  return {...patch, globalLevel};
}

// Files are an explicit portable format, never a dump of Chrome storage.
export function validateBackup(value) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BACKUP_BYTES) throw new Error('Choose an OtherWise JSON backup smaller than 5 MB.');
  keys(value, ['format','version','exportedAt','data']);
  if (value.format !== 'OtherWise-backup') invalid();
  if (![1,2,3].includes(value.version)) throw new Error('This backup version is not supported. Update OtherWise and try again.');
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) invalid();
  const data = value.data;
  keys(data, ['approved','baseline','focus','explored','edges','suppressed','discovery','preferences',...(value.version >= 2 ? ['interestGroups','recommendationGroupIds'] : []),...(value.version === 3 ? ['stats'] : [])]);
  const approved = list(data.approved, Infinity, row => topic(row));
  if (new Set(approved.map(row => row.id.toLowerCase())).size !== approved.length) invalid();
  const ids = new Set(approved.map(row => row.id));
  const baseline = list(data.baseline, Infinity, id => {if (!ids.has(id)) invalid(); return id;});
  if (data.focus !== null && !ids.has(data.focus)) invalid();
  const rawGroups = value.version >= 2 ? data.interestGroups : [];
  if (!Array.isArray(rawGroups)) invalid();
  for (const group of rawGroups) {
    keys(group,['id','name','interestIds','source']);
    if (!['manual','semantic'].includes(group.source)) invalid();
  }
  const interestGroups = normalizeInterestGroups(rawGroups,approved);
  if (!sameValue(interestGroups,rawGroups)) invalid();
  const rawScope = value.version >= 2 ? data.recommendationGroupIds : null;
  if (rawScope !== null && !Array.isArray(rawScope)) invalid();
  const recommendationGroupIds = normalizeGroupScope(rawScope,interestGroups);
  if (!sameValue(recommendationGroupIds,rawScope)) invalid();
  const explored = list(data.explored, 10000, row => topic(row, true));
  const edges = list(data.edges, 10000, row => {
    keys(row, ['from','to','at']);
    if (!text(row.from) || !text(row.to) || row.from === row.to || !time(row.at)) invalid();
    return {from:row.from,to:row.to,at:row.at};
  });
  const suppressed = list(data.suppressed, 10000, id => {if (!text(id)) invalid(); return id;});
  keys(data.discovery, ['feedback','exposures']);
  if (!object(data.discovery.feedback) || !object(data.discovery.exposures) || Object.keys(data.discovery.feedback).length > 4000 || Object.keys(data.discovery.exposures).length > 100) invalid();
  const feedback = Object.fromEntries(Object.entries(data.discovery.feedback).map(([id, row]) => {
    keys(row, ['area_id','topic','curious','known','difficulty']);
    if (!isConceptId(id) || !isAreaId(row.area_id) || !validRating(row) || !text(row.topic)) invalid();
    return [id, {area_id:row.area_id,topic:row.topic,curious:row.curious,known:row.known,difficulty:row.difficulty}];
  }));
  const exposures = Object.fromEntries(Object.entries(data.discovery.exposures).map(([id, count]) => {
    if (!isAreaId(id) || !Number.isInteger(count) || count < 0 || count > 1e9) invalid();
    return [id, count];
  }));
  const stats = value.version === 3 ? data.stats : null;
  if (stats !== null && !validStatsSnapshot(stats)) invalid();
  // Validation returns the current portable shape, including migrated v1 data.
  return {format:value.format,version:3,exportedAt:value.exportedAt,data:{stats:structuredClone(stats),approved,baseline,focus:data.focus,interestGroups,recommendationGroupIds,explored,edges,suppressed,discovery:{feedback,exposures},preferences:preferences(data.preferences)}};
}
export function parseBackup(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error('Choose an OtherWise JSON backup smaller than 5 MB.');
  let value;
  try {value = JSON.parse(raw.replace(/^\uFEFF/, ''));} catch {invalid();}
  return validateBackup(value);
}
export function createBackup(state, now = Date.now()) {
  const pickTopic = (row, history = false) => ({...sanitizeTopic(row),...(history ? {parentId:row.parentId,at:row.at} : {addedAt:row.addedAt})});
  const groups = normalizeInterestGroups(state.interestGroups,state.approved);
  const backup = validateBackup({format:'OtherWise-backup',version:3,exportedAt:new Date(now).toISOString(),data:{
    stats:state.stats ?? null, approved:state.approved.map(row => pickTopic(row)),baseline:state.baseline,focus:state.focus,
    interestGroups:groups,recommendationGroupIds:normalizeGroupScope(state.recommendationGroupIds,groups),
    explored:state.explored.map(row => pickTopic(row,true)),edges:state.edges.map(({from,to,at}) => ({from,to,at})),suppressed:state.suppressed,
    discovery:{feedback:Object.fromEntries(Object.entries(state.discovery.feedback).map(([id,{area_id,topic,curious,known,difficulty}]) => [id,{area_id,topic,curious,known,difficulty}])),exposures:state.discovery.exposures},
    preferences:Object.fromEntries(preferenceKeys.map(key => [key,key === 'theme' ? normalizeThemeId(state.settings.theme) : state.settings[key]])),
  }});
  return backup;
}
function unique(rows, key) {
  const seen = new Set();
  return rows.filter(row => {const id = key(row); if (seen.has(id)) return false; seen.add(id); return true;});
}
export function restoreBackup(current, backup, mode = 'merge', now = Date.now()) {
  if (!['merge','replace'].includes(mode)) invalid();
  const data = validateBackup(backup).data;
  const next = structuredClone(current), merge = mode === 'merge';
  // Local rows win duplicates; an already imported file never adds another copy.
  next.approved = merge ? unique([...current.approved,...data.approved], row => row.id.toLowerCase()) : data.approved;
  const canonical = new Map(next.approved.map(row => [row.id.toLowerCase(),row.id]));
  const importedGroups = data.interestGroups.map(group => ({...group,interestIds:group.interestIds.map(id => canonical.get(id.toLowerCase()))}));
  next.interestGroups = merge ? unique([...normalizeInterestGroups(current.interestGroups,next.approved),...importedGroups],row => row.id) : importedGroups;
  next.recommendationGroupIds = normalizeGroupScope(merge ? current.recommendationGroupIds : data.recommendationGroupIds,next.interestGroups);
  next.explored = merge ? unique([...current.explored,...data.explored], row => JSON.stringify([row.id,row.parentId,row.at])) : data.explored;
  next.edges = merge ? unique([...current.edges,...data.edges], row => JSON.stringify([row.from,row.to,row.at])) : data.edges;
  next.suppressed = merge ? [...new Set([...current.suppressed,...data.suppressed])] : data.suppressed;
  next.suppressed = next.suppressed.filter(id => !next.approved.some(row => row.id.toLowerCase() === id.toLowerCase()));
  next.baseline = merge ? current.baseline : data.baseline;
  next.focus = merge ? current.focus || data.focus : data.focus;
  if (!next.approved.some(row => row.id === next.focus)) next.focus = next.approved.at(-1)?.id ?? null;
  next.discovery = {feedback:merge ? {...data.discovery.feedback,...current.discovery.feedback} : data.discovery.feedback,
    exposures:merge ? {...data.discovery.exposures,...Object.fromEntries(Object.entries(current.discovery.exposures).map(([id,count]) => [id,Math.max(count,data.discovery.exposures[id] || 0)]))} : data.discovery.exposures,undo:null,context:null};
  if (!merge) {
    Object.assign(next.settings, data.preferences);
    // Restored exclusions have the same privacy effect as saving Settings.
    next.evidence = next.evidence.filter(row => isAllowedUrl(`https://${row.host}/`,next.settings.blockedDomains));
  }
  if (next.explored.length > 10000 || next.edges.length > 10000 || next.suppressed.length > 10000 || Object.keys(next.discovery.feedback).length > 4000 || Object.keys(next.discovery.exposures).length > 100) throw new Error('This import would exceed the backup data limits. Choose Replace or use a smaller backup.');
  if (merge && validStatsSnapshot(current.stats)) {
    next.stats = structuredClone(current.stats);
    const localGrowth = new Set(summarizeStats(current,{now}).growth.ids);
    next.stats.excludedIds = [...new Set([...next.stats.excludedIds,...data.explored.filter(row=>!localGrowth.has(row.id)).map(row=>row.id)])];
  } else if (!merge && data.stats) next.stats = structuredClone(data.stats);
  else next.stats = initializeStats(next,now);
  acknowledgeHistory(next,now);
  next.onboardingComplete = next.onboardingComplete || next.approved.length > 0;
  next.interestUndo = null;
  next.dismissalUndo = null;
  if (!merge) next.explorationPrompts = [];
  return reduceState(next, {type:'INVALIDATE'}, now);
}
