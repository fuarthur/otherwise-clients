// Membership and recommendation scope use saved topic IDs, never catalog positions.
const token = value => typeof value === 'string' && /^[a-f\d]{64}$/.test(value);
const nameKey = value => value.normalize('NFKC').toLowerCase();
export const GROUP_ACTIONS = new Set(['CREATE_INTEREST_GROUP','UPDATE_INTEREST_GROUP','DELETE_INTEREST_GROUP','ADD_INTEREST_GROUPS','SET_RECOMMENDATION_GROUPS']);

export function cleanGroupName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80 && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : null;
}

export function normalizeInterestGroups(value, approved = []) {
  const known = new Set(approved.map(row => row.id)), seen = new Set();
  return (Array.isArray(value) ? value : []).flatMap(row => {
    const name = cleanGroupName(row?.name);
    if (!token(row?.id) || seen.has(row.id) || !name || !Array.isArray(row.interestIds)) return [];
    seen.add(row.id);
    return [{id:row.id,name,interestIds:[...new Set(row.interestIds.filter(id => known.has(id)))],source:row.source === 'semantic' ? 'semantic' : 'manual'}];
  });
}

export function normalizeGroupScope(value, groups) {
  if (!Array.isArray(value)) return null;
  const known = new Set(groups.map(row => row.id));
  const ids = [...new Set(value.filter(id => known.has(id)))];
  return value.length && !ids.length ? null : ids;
}

export function groupInterests(state, id = 'all') {
  const approved = Array.isArray(state?.approved) ? state.approved : [];
  const groups = Array.isArray(state?.interestGroups) ? state.interestGroups : [];
  if (id === 'all') return approved;
  const members = new Set(id === 'ungrouped' ? groups.flatMap(row => row.interestIds) : groups.find(row => row.id === id)?.interestIds || []);
  return approved.filter(row => id === 'ungrouped' ? !members.has(row.id) : members.has(row.id));
}

export function recommendationInterests(state) {
  if (!Array.isArray(state?.recommendationGroupIds)) return Array.isArray(state?.approved) ? state.approved : [];
  const selected = new Set(state.recommendationGroupIds);
  const members = new Set((state.interestGroups || []).filter(row => selected.has(row.id)).flatMap(row => row.interestIds));
  return (state.approved || []).filter(row => members.has(row.id));
}

const sameMembers = (left,right) => left.length === right.length && left.every(id => right.includes(id));
function members(value, approved) {
  const known = new Set(approved.map(row => row.id));
  return Array.isArray(value) && value.every(id => typeof id === 'string' && known.has(id)) ? [...new Set(value)] : null;
}
const nameError = 'Enter a group name of 1–80 characters without line breaks.';
const memberError = 'Choose saved interests for this group.';
const missingError = 'Choose an existing interest group.';

// The reducer owns cloning, invalidation and ID generation; this module owns rules.
export function updateInterestGroups(state, action, makeId) {
  const groups = state.interestGroups;
  if (action.type === 'SET_RECOMMENDATION_GROUPS') {
    if (action.ids !== null && (!Array.isArray(action.ids) || action.ids.some(id => !groups.some(row => row.id === id)))) return missingError;
    state.recommendationGroupIds = action.ids === null ? null : [...new Set(action.ids)];
    if (action.ids !== null) state.settings.mode = 'global';
    return null;
  }
  if (action.type === 'DELETE_INTEREST_GROUP') {
    if (!groups.some(row => row.id === action.id)) return missingError;
    state.interestGroups = groups.filter(row => row.id !== action.id);
    state.recommendationGroupIds = normalizeGroupScope(state.recommendationGroupIds,state.interestGroups);
    return null;
  }
  if (action.type === 'ADD_INTEREST_GROUPS') {
    if (!Array.isArray(action.groups) || !action.groups.length) return memberError;
    const prepared = action.groups.map(row => ({name:cleanGroupName(row?.name),interestIds:members(row?.interest_ids,state.approved),source:row?.source === 'manual' ? 'manual' : 'semantic'}));
    if (prepared.some(row => !row.name)) return nameError;
    if (prepared.some(row => !row.interestIds)) return memberError;
    const kept = groups.filter(row => row.source !== 'semantic');
    const previous = groups.filter(row => row.source === 'semantic'), reused = new Set(), replacements = new Map();
    const result = [...kept];
    for (const row of prepared) {
      const duplicate = result.find(existing => sameMembers(existing.interestIds,row.interestIds) && (row.source === 'semantic' || nameKey(existing.name) === nameKey(row.name)));
      if (duplicate) {
        for (const old of previous) if (sameMembers(old.interestIds,row.interestIds) || nameKey(old.name) === nameKey(row.name)) replacements.set(old.id,duplicate.id);
        continue;
      }
      let match = previous.find(existing => !reused.has(existing.id) && sameMembers(existing.interestIds,row.interestIds));
      if (!match) match = previous.find(existing => !reused.has(existing.id) && nameKey(existing.name) === nameKey(row.name));
      if (!match && row.interestIds.length) {
        let score = .5;
        for (const existing of previous) {
          if (reused.has(existing.id)) continue;
          const intersection = row.interestIds.filter(id => existing.interestIds.includes(id)).length;
          const overlap = intersection / (row.interestIds.length + existing.interestIds.length - intersection);
          if (overlap > score) {match = existing; score = overlap;}
        }
      }
      if (match) reused.add(match.id);
      let name = row.name, suffix = 2;
      while (result.some(existing => nameKey(existing.name) === nameKey(name))) {
        const ending = ` (${suffix++})`;
        name = row.name.slice(0,80 - ending.length) + ending;
      }
      result.push({id:match?.id || makeId(),name,interestIds:row.interestIds,source:row.source});
    }
    state.interestGroups = result;
    if (Array.isArray(state.recommendationGroupIds)) {
      const known = new Set(result.map(row => row.id));
      state.recommendationGroupIds = [...new Set(state.recommendationGroupIds.map(id => replacements.get(id) || id).filter(id => known.has(id)))];
    }
    return null;
  }
  const name = cleanGroupName(action.name), interestIds = members(action.interestIds,state.approved);
  if (!name) return nameError;
  if (!interestIds) return memberError;
  if (groups.some(row => row.id !== action.id && nameKey(row.name) === nameKey(name))) return 'A group with that name already exists.';
  if (action.type === 'CREATE_INTEREST_GROUP') {
    groups.push({id:makeId(),name,interestIds,source:'manual'});
    return null;
  }
  const index = groups.findIndex(row => row.id === action.id);
  if (index < 0) return missingError;
  const previous = groups[index];
  groups[index] = {...previous,name,interestIds,source:previous.name !== name || !sameMembers(previous.interestIds,interestIds) ? 'manual' : previous.source};
  return null;
}
