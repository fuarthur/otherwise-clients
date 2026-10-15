import {initializeStats,validStatsSnapshot,acknowledgeHistory,summarizeStats} from './stats.js';
import {normalizeGalaxyLayoutOptions} from './galaxy-layout-options.js';
import {LOCAL_ENDPOINT} from './connection.js';
import {normalizeRecommendationOptions, validRecommendationOptions} from './recommendation-options.js';
import {createDiscoveryState, normalizeDiscovery, cleanDiscoveryMetadata, discoveryPayload, isConceptId, validRating} from './discovery.js';
import {GROUP_ACTIONS,normalizeInterestGroups,normalizeGroupScope,recommendationInterests,updateInterestGroups} from './interest-groups.js';
import {DEFAULT_THEME,getTheme,normalizeThemeId} from './themes.js';

const RETENTION_MS = 30 * 86_400_000;
const MAX_TOPIC_LENGTH = 80;
const DEFAULT_BLOCKED_DOMAINS = [
  'mail.google.com', 'gmail.com', 'outlook.live.com', 'outlook.office.com',
  'mail.yahoo.com', 'proton.me', 'protonmail.com', 'icloud.com',
  'accounts.google.com', 'account.microsoft.com', 'login.microsoftonline.com',
  'appleid.apple.com', 'auth.openai.com', 'docs.google.com', 'drive.google.com',
  'notion.so', 'notion.site', 'dropbox.com', 'box.com', 'sharepoint.com',
  'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'capitalone.com',
  'citi.com', 'paypal.com', 'venmo.com',
];
const STOPWORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with']);
const ALIASES = { Basketball: ['NBA', 'WNBA'], 'Python programming': ['Python'] };
const compiledCatalogs = new WeakMap();

function randomSalt() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createState(now = Date.now()) {
  return {
    schemaVersion: 1, generation: 0, salt: randomSalt(), onboardingComplete: false,
    settings: {
      proactiveEnabled: false, browsingEnabled: false, autoRefresh: false, mode: 'path', globalLevel: 0, language: 'en', theme: DEFAULT_THEME, recommendationView: 'cards', galaxyExplorationMode: false, tutorialSeen: false, tutorialActive: true,
      endpoint: LOCAL_ENDPOINT, accessToken: '',
      recommendationOptions: normalizeRecommendationOptions(),
      galaxyLayoutOptions: normalizeGalaxyLayoutOptions(), galaxyShowDomainLabels: true, galaxyShowInterestLabels: true,
      recommendationKind: 'broad', discoveryExploration: .3,
      soundEffectsEnabled: false, soundEffectsVolume: .2,
      blockedDomains: [...DEFAULT_BLOCKED_DOMAINS], analysisSince: 0,
    },
    approved: [], baseline: [], candidates: [], evidence: [], suppressed: [],
    interestGroups: [], recommendationGroupIds: null,
    stats: null, explored: [], explorationPrompts: [], edges: [], recommendations: [], recommendationBatch: null, focus: null,
    lastError: null, lastUpdated: null, interestUndo: null, dismissalUndo: null,
    discovery: createDiscoveryState(),
  };
}

function normalizeDomain(value) {
  if (typeof value !== 'string') return null;
  const domain = value.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
  return /^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/.test(domain) ? domain : null;
}

function privateHost(host) {
  const name = host.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!name.includes('.') && !name.includes(':')) return true;
  if (['localhost', 'localhost.localdomain'].includes(name) || /\.(local|localhost|internal|lan|home|test|invalid)$/.test(name)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) {
    const [a, b] = name.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b));
  }
  if (name.includes(':')) {
    if (name === '::' || name === '::1' || /^(fc|fd|fe[89ab])/i.test(name)) return true;
    if (name.startsWith('::ffff:')) {
      const tail = name.slice(7);
      if (tail.includes('.')) return privateHost(tail);
      const parts = tail.split(':');
      if (parts.length === 2) {
        const left = parseInt(parts[0], 16), right = parseInt(parts[1], 16);
        return privateHost(`${left >> 8}.${left & 255}.${right >> 8}.${right & 255}`);
      }
    }
  }
  return false;
}

export function isAllowedUrl(url, blockedDomains = DEFAULT_BLOCKED_DOMAINS) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || privateHost(parsed.hostname)) return false;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return !(Array.isArray(blockedDomains) ? blockedDomains : DEFAULT_BLOCKED_DOMAINS)
      .map(normalizeDomain).filter(Boolean).some(domain => host === domain || host.endsWith('.' + domain));
  } catch { return false; }
}

export async function hashUrl(url, salt) {
  if (typeof url !== 'string' || typeof salt !== 'string' || !salt) throw new Error('Local privacy settings are unavailable. Please reset and try again.');
  const bytes = new TextEncoder().encode(JSON.stringify([salt, url]));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function phrase(value) {
  return value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function validTopicText(value, maxLength = MAX_TOPIC_LENGTH) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength &&
    /[\p{L}\p{N}]/u.test(value) && !/^(?:javascript|data|about|chrome|file|ftp|mailto|tel):/i.test(value.trim()) &&
    !/[\r\n\t\x00-\x1f\x7f]/.test(value) &&
    !/(?:https?:|www\.|[a-z\d._%+-]+@[a-z\d.-]+\.[a-z]{2,}|(?:\b[a-z\d-]+\.)+[a-z]{2,}(?:\b|\/))/i.test(value) &&
    !value.includes('://');
}

export function sanitizeTopic(value) {
  const record = typeof value === 'string' ? {topic: value} : value;
  let discovery;
  if (record?.discovery) {
    try { discovery = cleanDiscoveryMetadata(record.discovery); } catch { return null; }
  }
  if (!record || !validTopicText(record.topic, discovery ? 120 : MAX_TOPIC_LENGTH)) return null;
  const title = record.topic.trim().replace(/ +/g, ' ');
  // Catalog IDs are their exact topic title, as are explicit custom phrases.
  return {
    id: title, topic: title,
    domain: typeof record.domain === 'string' ? record.domain.trim().slice(0, 80) : 'Custom',
    description: typeof record.description === 'string' ? record.description.trim().slice(0, 500) : '',
    ...(discovery ? {discovery} : {}),
  };
}

function compiledCatalog(catalog) {
  if (!Array.isArray(catalog)) return [];
  // Bundled catalogs are immutable. Cache derived phrase rules by catalog identity.
  if (compiledCatalogs.has(catalog)) return compiledCatalogs.get(catalog);
  const compiled = catalog.map(entry => {
    const topic = sanitizeTopic(entry);
    if (!topic) return null;
    const aliases = [topic.topic, ...(ALIASES[topic.id] || []), ...(Array.isArray(entry.aliases) ? entry.aliases.filter(x => typeof x === 'string') : [])];
    const phrases = [...new Set(aliases.map(phrase).filter(normalized => normalized && normalized.split(' ').some(word => !STOPWORDS.has(word))))]
      .map(normalized => ' ' + normalized + ' ');
    return {topic, phrases};
  }).filter(Boolean);
  compiledCatalogs.set(catalog, compiled);
  return compiled;
}

export async function prepareObservation(historyItem, catalog, {salt, blockedDomains = DEFAULT_BLOCKED_DOMAINS}, now = Date.now()) {
  if (!historyItem || !isAllowedUrl(historyItem.url, blockedDomains) || typeof historyItem.title !== 'string' || !historyItem.title.trim()) return null;
  const seenAt = Number.isFinite(historyItem.lastVisitTime) ? historyItem.lastVisitTime : now;
  if (seenAt < now - RETENTION_MS || seenAt > now + 60_000) return null;
  const title = ' ' + phrase(historyItem.title) + ' ';
  const topics = [];
  for (const {topic, phrases} of compiledCatalog(catalog)) {
    if (phrases.some(normalized => title.includes(normalized)) && !topics.some(item => item.id === topic.id)) topics.push({...topic});
  }
  if (!topics.length) return null;
  const host = new URL(historyItem.url).hostname.toLowerCase();
  return {
    sourceHash: await hashUrl(historyItem.url, salt), host, seenAt,
    topicIds: topics.map(topic => topic.id), topics,
    source: host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' ? 'YouTube' : 'Chrome',
  };
}

function candidateMetadata(state, observations = []) {
  const known = new Map([...state.candidates, ...state.approved].map(topic => [topic.id, sanitizeTopic(topic)]));
  for (const item of observations) for (const value of Array.isArray(item?.topics) ? item.topics : []) {
    const topic = sanitizeTopic(value);
    if (topic && Array.isArray(item.topicIds) && item.topicIds.includes(topic.id)) known.set(topic.id, topic);
  }
  return known;
}

function recomputeCandidates(state, metadata) {
  const hidden = new Set([...state.suppressed, ...state.approved.map(topic => topic.id)]);
  const grouped = new Map();
  for (const evidence of state.evidence) for (const id of evidence.topicIds) {
    if (hidden.has(id) || !metadata.get(id)) continue;
    let candidate = grouped.get(id);
    if (!candidate) {
      candidate = {...metadata.get(id), count: 0, firstSeen: evidence.seenAt, lastSeen: evidence.seenAt, sources: []};
      grouped.set(id, candidate);
    }
    candidate.count++;
    candidate.firstSeen = Math.min(candidate.firstSeen, evidence.seenAt);
    candidate.lastSeen = Math.max(candidate.lastSeen, evidence.seenAt);
    if (!candidate.sources.includes(evidence.source)) candidate.sources.push(evidence.source);
  }
  return [...grouped.values()].sort((a, b) => b.lastSeen - a.lastSeen || b.count - a.count || a.topic.localeCompare(b.topic));
}

function snapshotRecommendationBatch(state) {
  const seeds = recommendationInterests(state);
  return {token:randomSalt(), items:state.recommendations, updatedAt:state.lastUpdated,
    focus:seeds.some(row => row.id === state.focus) ? state.focus : seeds.at(-1)?.id ?? null, mode:state.settings.mode, seedCount:seeds.length,
    groupNames:Array.isArray(state.recommendationGroupIds) ? state.recommendationGroupIds.map(id => state.interestGroups.find(row => row.id === id)?.name).filter(Boolean) : null,
    kind:state.settings.recommendationKind, generation:state.generation};
}

function cleanDismissedRow(value) {
  const row = sanitizeTopic(value);
  if (!row || row.id !== value.id) return null;
  for (const key of ['nearest_interest', 'distance', 'boundary_offset', 'zone']) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key]) ||
        typeof value[key] === 'string' && value[key].length <= 120 && !/[\x00-\x1f\x7f]/.test(value[key])) row[key] = value[key];
  }
  return JSON.stringify(row).length <= 10000 ? row : null;
}

function normalizeDismissalUndo(value, suppressed) {
  const token = input => typeof input === 'string' && /^[a-f\d]{64}$/.test(input);
  const position = input => input === null || Number.isInteger(input) && input >= 0 && input < 100;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !token(value.token) ||
      !validTopicText(value.id, 120) || value.id.length > 120 || !suppressed.includes(value.id) ||
      !Number.isSafeInteger(value.generation) || value.generation < 0 ||
      value.batchToken !== null && !token(value.batchToken) ||
      !position(value.recommendationIndex) || !position(value.batchIndex)) return null;
  // Retain one bounded, allowlisted local record. Legacy or damaged records cannot inject rows.
  try { if (JSON.stringify(value).length > 12000) return null; } catch { return null; }
  const row = value.row === null ? null : cleanDismissedRow(value.row);
  if (value.row !== null && (!row || row.id !== value.id) ||
      !row && (value.recommendationIndex !== null || value.batchIndex !== null) ||
      value.batchIndex !== null && value.batchToken === null) return null;
  return {token:value.token, id:value.id, row, generation:value.generation, batchToken:value.batchToken,
    recommendationIndex:value.recommendationIndex, batchIndex:value.batchIndex};
}

function dismissTopic(state, id) {
  if (!validTopicText(id, 120) || id.length > 120 || state.suppressed.includes(id)) return;
  const recommendationIndex = state.recommendations.findIndex(row => row.id === id);
  const batchItems = state.recommendationBatch?.items || [];
  const batchIndex = batchItems.findIndex(row => row.id === id);
  const original = state.recommendations[recommendationIndex] || batchItems[batchIndex] || state.candidates.find(row => row.id === id);
  const row = original ? cleanDismissedRow(original) : null;
  state.suppressed.push(id);
  state.dismissalUndo = normalizeDismissalUndo({token:randomSalt(), id, row, generation:state.generation,
    batchToken:state.recommendationBatch?.token || null,
    recommendationIndex:row && recommendationIndex >= 0 ? recommendationIndex : null,
    batchIndex:row && batchIndex >= 0 ? batchIndex : null}, state.suppressed);
  state.recommendations = state.recommendations.filter(topic => topic.id !== id);
  if (state.recommendationBatch) state.recommendationBatch.items = batchItems.filter(topic => topic.id !== id);
}

function restoreHidden(state, values, metadata) {
  const ids = new Set(Array.isArray(values) ? values.filter(id => typeof id === 'string' && state.suppressed.includes(id)) : []);
  for (const id of ids) {
    // Older suppressed records only have an ID; surviving evidence can still be reviewed again.
    const original = state.dismissalUndo?.id === id ? state.dismissalUndo.row : null;
    const removed = Array.isArray(state.interestUndo?.topics) ? state.interestUndo.topics.find(row => row?.id === id) : null;
    const topic = sanitizeTopic(original || removed || id);
    if (topic && !metadata.has(id)) metadata.set(id, topic);
  }
  state.suppressed = state.suppressed.filter(id => !ids.has(id));
}

function undoDismissal(state, token, metadata) {
  const undo = state.dismissalUndo;
  if (!undo || typeof token !== 'string' || token !== undo.token) return;
  restoreHidden(state, [undo.id], metadata);
  const batch = state.recommendationBatch;
  if (undo.row && state.generation === undo.generation && batch?.generation === undo.generation && batch.token === undo.batchToken) {
    if (undo.recommendationIndex !== null && !state.recommendations.some(row => row.id === undo.id)) {
      state.recommendations.splice(undo.recommendationIndex, 0, structuredClone(undo.row));
    }
    if (undo.batchIndex !== null && !batch.items.some(row => row.id === undo.id)) {
      batch.items.splice(undo.batchIndex, 0, structuredClone(undo.row));
    }
  }
  state.dismissalUndo = null;
}

function invalidate(state, keepDiscoveryContext = false) {
  state.generation++;
  state.recommendations = [];
  state.recommendationBatch = null;
  state.lastUpdated = null;
  state.lastError = null;
  if (state.discovery && !keepDiscoveryContext) state.discovery.context = null;
}

function addTopics(state, values, now) {
  const additions = [];
  let error = null;
  for (const value of values) {
    const topic = sanitizeTopic(value);
    if (!topic) { error = 'Enter a short interest topic, without links, email addresses or line breaks.'; continue; }
    if (state.approved.some(item => item.id.toLowerCase() === topic.id.toLowerCase()) || additions.some(item => item.id.toLowerCase() === topic.id.toLowerCase())) continue;
    additions.push({...topic, addedAt: now});
  }
  if (!additions.length) { if (error) state.lastError = error; return; }
  const initial = !state.onboardingComplete;
  const batch = state.recommendationBatch;
  invalidate(state);
  // An already-open Discover page can finish this trusted batch after Save.
  state.recommendationBatch = batch;
  state.lastError = error;
  state.interestUndo = null;
  state.approved.push(...additions);
  if (initial) { state.baseline = additions.map(topic => topic.id); state.onboardingComplete = true; }
  else if (state.settings.mode === 'global') state.settings.globalLevel = Math.min(8, state.settings.globalLevel + additions.length);
  state.focus = additions.at(-1).id;
  state.suppressed = state.suppressed.filter(id => !additions.some(topic => topic.id === id));
}

function removeInterests(state, ids) {
  const requested = new Set(Array.isArray(ids) ? ids : []);
  const removed = state.approved.filter(topic => requested.has(topic.id));
  if (!removed.length) return;
  const undo = {token:randomSalt(), topics:removed, order:state.approved.map(topic => topic.id),
    baseline:[...state.baseline], focus:state.focus, restoreFocus:true,
    groupMemberships:(state.interestGroups || []).map(group => ({id:group.id,interestIds:group.interestIds.filter(id => requested.has(id))})).filter(group => group.interestIds.length)};
  invalidate(state);
  const removedIds = new Set(removed.map(topic => topic.id));
  state.approved = state.approved.filter(topic => !removedIds.has(topic.id));
  state.interestGroups = normalizeInterestGroups(state.interestGroups,state.approved);
  state.baseline = state.baseline.filter(id => !removedIds.has(id));
  state.suppressed = [...new Set([...state.suppressed, ...removedIds])];
  if (removedIds.has(state.focus)) state.focus = state.approved.at(-1)?.id ?? null;
  state.interestUndo = {...undo, nextFocus:state.focus};
}

function undoInterestRemoval(state, token) {
  const undo = state.interestUndo;
  if (!undo || typeof token !== 'string' || token !== undo.token) return;
  // Restore only the locally recorded removal, never topics supplied by a caller.
  if (!Array.isArray(undo.topics) || !Array.isArray(undo.order) || !Array.isArray(undo.baseline)) {state.interestUndo = null; return;}
  const topics = undo.topics.map(value => {
    const topic = sanitizeTopic(value);
    return topic && Number.isFinite(value.addedAt) ? {...topic, addedAt:value.addedAt} : null;
  });
  if (topics.some(topic => !topic)) {state.interestUndo = null; return;}
  const ids = new Set(topics.map(topic => topic.id));
  if (state.approved.some(topic => ids.has(topic.id))) {state.interestUndo = null; return;}
  const order = new Map(undo.order.map((id,index) => [id,index]));
  invalidate(state);
  state.approved = [...state.approved, ...topics].sort((a,b) => (order.get(a.id) ?? undo.order.length) - (order.get(b.id) ?? undo.order.length));
  for (const group of state.interestGroups || []) {
    const restored = undo.groupMemberships?.find(row => row.id === group.id)?.interestIds || [];
    group.interestIds = [...new Set([...group.interestIds,...restored.filter(id => ids.has(id))])];
  }
  const approved = new Set(state.approved.map(topic => topic.id));
  state.baseline = undo.baseline.filter(id => approved.has(id));
  state.suppressed = state.suppressed.filter(id => !ids.has(id));
  if (undo.restoreFocus !== false && state.focus === undo.nextFocus && approved.has(undo.focus)) state.focus = undo.focus;
  state.interestUndo = null;
}

function cleanEvidence(item, now) {
  if (!item || typeof item.sourceHash !== 'string' || !item.sourceHash || typeof item.host !== 'string' ||
      !Number.isFinite(item.seenAt) || item.seenAt < now - RETENTION_MS || item.seenAt > now + 60_000 ||
      !['Chrome', 'YouTube'].includes(item.source) || !Array.isArray(item.topicIds)) return null;
  try { if (new URL('https://' + item.host).hostname !== item.host.toLowerCase()) return null; }
  catch { return null; }
  const topicIds = [...new Set(item.topicIds.filter(value => validTopicText(value)))];
  return topicIds.length ? {sourceHash: item.sourceHash, host: item.host, seenAt: item.seenAt, topicIds, source: item.source} : null;
}

function updateSettings(state, patch, now) {
  if (!patch || typeof patch !== 'object') return;
  let changed = false;
  let error = null;
  for (const name of ['proactiveEnabled', 'browsingEnabled', 'autoRefresh', 'mode', 'endpoint', 'accessToken', 'blockedDomains', 'language', 'theme', 'recommendationView', 'galaxyExplorationMode', 'galaxyLayoutOptions', 'galaxyShowDomainLabels', 'galaxyShowInterestLabels', 'recommendationOptions', 'recommendationKind', 'discoveryExploration', 'tutorialSeen', 'tutorialActive', 'soundEffectsEnabled', 'soundEffectsVolume']) {
    if (!(name in patch)) continue;
    let value = patch[name];
    if (name === 'galaxyLayoutOptions') {
      try {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(normalizeGalaxyLayoutOptions(), key))) throw new Error();
        value = normalizeGalaxyLayoutOptions({...state.settings.galaxyLayoutOptions, ...value}, {strict:true});
      } catch { error = 'Enter valid Galaxy layout settings. Minimum distance must not exceed spread.'; continue; }
    }
    if (name === 'recommendationOptions') {
      if (!validRecommendationOptions(value)) { error = 'Enter valid recommendation settings.'; continue; }
      value = normalizeRecommendationOptions({...state.settings.recommendationOptions, ...value});
    }
    if (['proactiveEnabled', 'browsingEnabled', 'autoRefresh', 'galaxyExplorationMode', 'galaxyShowDomainLabels', 'galaxyShowInterestLabels', 'tutorialSeen', 'tutorialActive', 'soundEffectsEnabled'].includes(name) && typeof value !== 'boolean') continue;
    if (name === 'soundEffectsVolume' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) continue;
    if (name === 'mode' && !['path', 'global'].includes(value)) continue;
    if (name === 'language' && !['en', 'zh-CN'].includes(value)) continue;
    if (name === 'theme' && !getTheme(value)) continue;
    if (name === 'recommendationView' && !['cards', 'list', 'single'].includes(value)) continue;
    if (name === 'recommendationKind' && !['broad', 'specific'].includes(value)) continue;
    if (name === 'discoveryExploration' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) continue;
    if (name === 'endpoint') {
      try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
        value = parsed.href.replace(/\/$/, '');
      } catch { error = 'Enter a valid service address.'; continue; }
    }
    if (name === 'accessToken' && typeof value !== 'string') continue;
    if (name === 'blockedDomains') {
      if (!Array.isArray(value)) continue;
      value = [...new Set(value.map(normalizeDomain).filter(Boolean))];
    }
    if (JSON.stringify(state.settings[name]) !== JSON.stringify(value)) {
      if (name === 'browsingEnabled' && value) state.settings.analysisSince = now;
      state.settings[name] = value;
      // Presentation preferences never change the profile or cancel work.
      if (!['proactiveEnabled', 'language', 'theme', 'recommendationView', 'galaxyExplorationMode', 'galaxyLayoutOptions', 'galaxyShowDomainLabels', 'galaxyShowInterestLabels', 'tutorialSeen', 'tutorialActive', 'soundEffectsEnabled', 'soundEffectsVolume'].includes(name)) changed = true;
    }
  }
  if (changed) {
    invalidate(state);
    state.evidence = state.evidence.filter(item => isAllowedUrl('https://' + item.host, state.settings.blockedDomains));
  }
  if (error) state.lastError = error;
}

function normalizeExplorationPrompts(state) {
  const saved = new Set(state.approved.map(row => row.id.toLowerCase()));
  const explored = new Map();
  for (const row of state.explored) {
    if (!explored.has(row.id)) explored.set(row.id, new Set());
    explored.get(row.id).add(row.at);
  }
  const pending = new Map();
  for (const row of Array.isArray(state.explorationPrompts) ? state.explorationPrompts : []) {
    if (!row || typeof row.id !== 'string' || !explored.get(row.id)?.has(row.at) ||
        saved.has(row.id.toLowerCase()) || state.suppressed.includes(row.id) ||
        typeof row.token !== 'string' || !/^[a-f\d]{64}$/.test(row.token) || !Number.isFinite(row.at)) continue;
    pending.delete(row.id);
    pending.set(row.id, {id:row.id,token:row.token,at:row.at});
  }
  return [...pending.values()].slice(-100);
}

export function reduceState(state, action, now = Date.now()) {
  if (!state || !action || typeof action.type !== 'string') throw new Error('This action is unavailable. Please reopen OtherWise.');
  if (['INGEST', 'RECOMMENDATIONS', 'ERROR'].includes(action.type) && action.generation !== undefined && action.generation !== state.generation) return state;
  if (action.type === 'RESET') { const reset = createState(now); reset.generation = state.generation + 1; return reset; }
  const next = structuredClone(state);
  if (next.stats === undefined || next.stats !== null && !validStatsSnapshot(next.stats)) {
    next.stats = initializeStats(next, now);
    acknowledgeHistory(next, now);
  }
  // Profiles may still carry the error from the former saved-interest limit.
  if (next.lastError === 'You can save up to 40 interests. Remove one before adding another.') next.lastError = null;
  next.interestGroups = normalizeInterestGroups(next.interestGroups,next.approved);
  next.recommendationGroupIds = normalizeGroupScope(next.recommendationGroupIds,next.interestGroups);
  next.explorationPrompts = normalizeExplorationPrompts(next);
  next.discovery = normalizeDiscovery(next.discovery);
  if (next.recommendationBatch === undefined) next.recommendationBatch = Number.isFinite(next.lastUpdated) ? snapshotRecommendationBatch(next) : null;
  const legacyBatch = next.recommendationBatch;
  // Older installs did not record generation. Only migrate a demonstrably live batch;
  // retained Discover results after Save must never become current again.
  if (legacyBatch && legacyBatch.generation === undefined && Number.isFinite(next.lastUpdated) &&
      legacyBatch.updatedAt === next.lastUpdated && Array.isArray(legacyBatch.items) &&
      JSON.stringify(legacyBatch.items) === JSON.stringify(next.recommendations)) legacyBatch.generation = next.generation;
  if (!next.interestUndo) next.interestUndo = null;
  next.dismissalUndo = normalizeDismissalUndo(next.dismissalUndo, next.suppressed);
  if (!['broad', 'specific'].includes(next.settings.recommendationKind)) next.settings.recommendationKind = 'broad';
  if (!Number.isFinite(next.settings.discoveryExploration) || next.settings.discoveryExploration < 0 || next.settings.discoveryExploration > 1) next.settings.discoveryExploration = .3;
  next.settings.recommendationOptions = normalizeRecommendationOptions(next.settings.recommendationOptions);
  next.settings.galaxyLayoutOptions = normalizeGalaxyLayoutOptions(next.settings.galaxyLayoutOptions);
  for (const key of ['galaxyShowDomainLabels', 'galaxyShowInterestLabels']) if (typeof next.settings[key] !== 'boolean') next.settings[key] = true;
  if (!['en', 'zh-CN'].includes(next.settings.language)) next.settings.language = 'en';
  next.settings.theme = normalizeThemeId(next.settings.theme);
  if (!['cards', 'list', 'single'].includes(next.settings.recommendationView)) next.settings.recommendationView = 'cards';
  if (typeof next.settings.galaxyExplorationMode !== 'boolean') next.settings.galaxyExplorationMode = false;
  if (typeof next.settings.proactiveEnabled !== 'boolean') next.settings.proactiveEnabled = false;
  if (typeof next.settings.soundEffectsEnabled !== 'boolean') next.settings.soundEffectsEnabled = false;
  if (typeof next.settings.soundEffectsVolume !== 'number' || !Number.isFinite(next.settings.soundEffectsVolume) || next.settings.soundEffectsVolume < 0 || next.settings.soundEffectsVolume > 1) next.settings.soundEffectsVolume = .2;
  // Existing installs can infer onboarding once, without retaining deleted baseline IDs.
  if (next.onboardingComplete === undefined) next.onboardingComplete = next.approved.length > 0 || next.baseline.length > 0;
  if (typeof next.settings.tutorialSeen !== 'boolean') next.settings.tutorialSeen = Boolean(next.onboardingComplete || next.approved.length);
  if (typeof next.settings.tutorialActive !== 'boolean') next.settings.tutorialActive = !next.settings.tutorialSeen && !next.onboardingComplete && !next.approved.length;
  const observations = action.type === 'INGEST' && Array.isArray(action.observations) ? action.observations : [];
  const metadata = candidateMetadata(next, observations);
  next.evidence = next.evidence.map(item => cleanEvidence(item, now)).filter(Boolean);
  if (GROUP_ACTIONS.has(action.type)) {
    const scopeKey = () => JSON.stringify([recommendationInterests(next).map(row => row.id),next.settings.mode]);
    const before = scopeKey(), error = updateInterestGroups(next,action,randomSalt);
    if (error) next.lastError = error;
    else { if (before !== scopeKey()) invalidate(next); next.lastError = null; }
    return next;
  }
  switch (action.type) {
    case 'INGEST': {
      const evidence = new Map(next.evidence.map(item => [item.sourceHash, item]));
      for (const item of observations) {
        const clean = cleanEvidence(item, now);
        if (!clean || !isAllowedUrl('https://' + clean.host, next.settings.blockedDomains)) continue;
        clean.topicIds = clean.topicIds.filter(id => metadata.has(id));
        if (!clean.topicIds.length) continue;
        const previous = evidence.get(clean.sourceHash);
        if (!previous) evidence.set(clean.sourceHash, clean);
        else evidence.set(clean.sourceHash, {...previous, seenAt: Math.max(previous.seenAt, clean.seenAt), topicIds: [...new Set([...previous.topicIds, ...clean.topicIds])]});
      }
      next.evidence = [...evidence.values()];
      break;
    }
    case 'APPROVE': addTopics(next, next.candidates.filter(topic => Array.isArray(action.ids) && action.ids.includes(topic.id)), now); break;
    case 'ADD_INTEREST': addTopics(next, [action.topic], now); break;
    case 'REMOVE_INTEREST': removeInterests(next, [action.id]); break;
    case 'REMOVE_INTERESTS': removeInterests(next, action.ids); break;
    case 'UNDO_REMOVE_INTERESTS': undoInterestRemoval(next, action.token); break;
    case 'CLEAR_INTEREST_UNDO':
      if (next.interestUndo?.token === action.token) next.interestUndo = null;
      break;
    case 'DISMISS': dismissTopic(next, action.id); break;
    case 'UNDO_DISMISS': undoDismissal(next, action.token, metadata); break;
    case 'RESTORE_HIDDEN': restoreHidden(next, action.ids, metadata); break;
    case 'CLEAR_DISMISS_UNDO':
      if (next.dismissalUndo?.token === action.token) next.dismissalUndo = null;
      break;
    case 'POSTPONE_EXPLORATION': {
      const tokens = new Set(Array.isArray(action.tokens) ? action.tokens : []);
      next.explorationPrompts = next.explorationPrompts.filter(row => !tokens.has(row.token));
      break;
    }
    case 'CLAIM_STATS': {
      if (next.stats && action.salt === next.salt && action.startedAt === next.stats.startedAt) {
        const pending = summarizeStats(next,{now}).pending;
        const claimed = Array.isArray(action.ids) ? pending.filter(id=>action.ids.includes(id)) : [];
        next.stats.acknowledged.push(...claimed);
      }
      break;
    }
    case 'EXPLORE': {
      const topic = sanitizeTopic(action.topic);
      if (!topic) { next.lastError = 'Choose a valid topic to explore.'; break; }
      const parentId = typeof action.parentId === 'string' && [...next.approved, ...next.explored].some(item => item.id === action.parentId) ? action.parentId : null;
      if (!next.stats) next.stats = initializeStats(next, now);
      next.explored.push({...topic, parentId, at: now});
      if (parentId && parentId !== topic.id) next.edges.push({from: parentId, to: topic.id, at: now});
      if (action.promptInterest === true) next.explorationPrompts.push({id:topic.id,token:randomSalt(),at:now});
      break;
    }
    case 'EXPLORE_FROM_CATALOG': {
      // Only the controller emits this after validating both IDs against its catalog.
      const topic = sanitizeTopic(action.topic);
      if (!topic) break;
      const parentId = typeof action.parentId === 'string' ? action.parentId : null;
      if (!next.stats) next.stats = initializeStats(next, now);
      next.explored.push({...topic, parentId, at: now});
      if (parentId && parentId !== topic.id) next.edges.push({from: parentId, to: topic.id, at: now});
      break;
    }
    case 'SET_SETTINGS': updateSettings(next, action.patch, now); break;
    case 'SET_DISCOVERY_FEEDBACK': {
      const conceptId = action.conceptId;
      const previous = next.discovery.feedback[conceptId];
      const shown = next.recommendations.find(r => r.discovery?.concept_id === conceptId);
      if (!isConceptId(conceptId) || !validRating(action) || (!shown && !previous)) {
        next.lastError = 'Choose a shown concept and valid feedback.'; break;
      }
      if (!previous && Object.keys(next.discovery.feedback).length >= 4000) {
        next.lastError = 'Clear a saved rating before adding another.'; break;
      }
      next.discovery.undo = {conceptId, previous:previous ? structuredClone(previous) : null};
      next.discovery.feedback[conceptId] = {area_id:shown?.discovery.area_id || previous.area_id,
        topic:shown?.topic || previous.topic, curious:action.curious, known:action.known, difficulty:action.difficulty};
      invalidate(next, true); break;
    }
    case 'CLEAR_CONCEPT_FEEDBACK': {
      const previous = next.discovery.feedback[action.conceptId];
      if (!isConceptId(action.conceptId) || !previous) break;
      next.discovery.undo = {conceptId:action.conceptId, previous:structuredClone(previous)};
      delete next.discovery.feedback[action.conceptId]; invalidate(next, true); break;
    }
    case 'UNDO_DISCOVERY_FEEDBACK': {
      const undo = next.discovery.undo;
      if (!undo) break;
      if (undo.previous === null) delete next.discovery.feedback[undo.conceptId];
      else next.discovery.feedback[undo.conceptId] = structuredClone(undo.previous);
      next.discovery.undo = null; invalidate(next, true); break;
    }
    case 'CLEAR_DISCOVERY_FEEDBACK': next.discovery = createDiscoveryState(); invalidate(next); break;
    case 'INVALIDATE': invalidate(next); break;
    case 'SET_FOCUS': {
      if (next.approved.some(topic => topic.id === action.id)) {
        if (next.interestUndo) next.interestUndo.restoreFocus = false;
        if (next.focus !== action.id) { invalidate(next); next.focus = action.id; }
      }
      break;
    }
    case 'CLEAR_DERIVED': next.evidence = []; next.settings.analysisSince = now; invalidate(next); break;
    case 'DELETE_SOURCES': {
      const hashes = new Set(Array.isArray(action.hashes) ? action.hashes : []);
      next.evidence = action.all ? [] : next.evidence.filter(item => !hashes.has(item.sourceHash));
      invalidate(next); break;
    }
    case 'RECOMMENDATIONS': {
      // Missing generations cannot bypass the response guard.
      if (action.generation !== next.generation) break;
      next.recommendations = Array.isArray(action.items) ? action.items.slice(0, 100).map(item => {
        const topic = sanitizeTopic(item);
        if (!topic) return null;
        const recommendation = {...topic};
        for (const key of ['nearest_interest', 'distance', 'boundary_offset', 'zone']) {
          if (typeof item[key] === 'string' || typeof item[key] === 'number' && Number.isFinite(item[key])) recommendation[key] = item[key];
        }
        return recommendation;
      }).filter(topic => topic && !next.suppressed.includes(topic.id) && !next.approved.some(row => row.id.toLowerCase() === topic.id.toLowerCase()) && !next.discovery.feedback[topic.discovery?.concept_id]?.known) : [];
      if (next.settings.recommendationKind === 'specific' && action.discovery) {
        next.discovery.context = {seed:action.discovery.seed, exposures:structuredClone(action.discovery.exposures), graph_sha256:action.discovery.graph_sha256};
        if (!action.discovery.rerank) for (const row of next.recommendations) {
          const area = row.discovery?.area_id;
          if (area) next.discovery.exposures[area] = Math.min(1e9, (next.discovery.exposures[area] || 0) + 1);
        }
      }
      next.lastUpdated = now; next.lastError = null;
      next.recommendationBatch = snapshotRecommendationBatch(next); break;
    }
    case 'ERROR': next.lastError = typeof action.message === 'string' ? action.message.slice(0, 300) : 'Something went wrong. Please try again.'; break;
    case 'CLEAR_ERROR': next.lastError = null; break;
    default: break;
  }
  if (next.dismissalUndo && !next.suppressed.includes(next.dismissalUndo.id)) next.dismissalUndo = null;
  next.explorationPrompts = normalizeExplorationPrompts(next);
  next.candidates = recomputeCandidates(next, metadata);
  return next;
}

export function buildRequest(state) {
  const approved = recommendationInterests(state);
  if (!approved.length && Array.isArray(state?.recommendationGroupIds)) throw new Error('Choose at least one saved interest from the selected groups.');
  if (!approved.length) throw new Error('Add or approve an interest before getting recommendations.');
  if (approved.some(topic => !sanitizeTopic(topic))) throw new Error('Review your saved interests before getting recommendations.');
  const keywords = [...new Set(approved.map(topic => topic.topic.trim().replace(/ +/g, ' ')))];
  const level = Number.isFinite(state.settings?.globalLevel) ? Math.trunc(state.settings.globalLevel) : 0;
  return {
    keywords, mode: state.settings?.mode === 'global' ? 'global' : 'path',
    focus: keywords.includes(state.focus) ? state.focus : Array.isArray(state.recommendationGroupIds) ? keywords.at(-1) : null,
    expansion_level: Math.max(0, Math.min(8, level)), ...normalizeRecommendationOptions(state.settings?.recommendationOptions),
    ...(state.settings?.recommendationKind === 'specific' ? discoveryPayload(state) : {}),
  };
}
