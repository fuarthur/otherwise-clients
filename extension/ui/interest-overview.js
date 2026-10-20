const rows = value => Array.isArray(value) ? value.filter(row => row && typeof (row.id || row.topic) === 'string' && (row.id || row.topic).trim()) : [];
const unique = items => [...new Map(items.map(row => [row.id || row.topic, row])).values()];

/** A bounded, local summary. Counts describe saved/search records, not inferred preferences. */
export function summarizeInterests(state, {domainNames} = {}) {
  const approved = unique(rows(state?.approved));
  // A catalog-backed summary includes every selectable field, including zeroes.
  const knownDomains = Array.isArray(domainNames) ? new Set(domainNames) : null;
  const counts = new Map(knownDomains ? [...knownDomains].map(name => [name,0]) : []);
  let unclassifiedCount = 0;
  for (const row of approved) {
    const name = typeof row.domain === 'string' ? row.domain.trim() : '';
    if (!name || name.toLowerCase() === 'custom' || knownDomains && !knownDomains.has(name)) { unclassifiedCount++; continue; }
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const domains = [...counts].map(([name,count]) => ({name,count})).sort((a,b) => b.count-a.count || a.name.localeCompare(b.name));
  const byTime = rows(state?.explored).slice().reverse().sort((a,b) => (Number.isFinite(b.at) ? b.at : -Infinity) - (Number.isFinite(a.at) ? a.at : -Infinity));
  const seen = new Set();
  const explored = byTime.filter(row => { const id=row.id || row.topic; if (seen.has(id)) return false; seen.add(id); return true; });
  return {savedCount:approved.length,domainCount:domains.filter(row=>row.count>0).length,unclassifiedCount,
    domains:knownDomains?domains:domains.slice(0,4),otherClassifiedCount:knownDomains?0:domains.slice(4).reduce((sum,row) => sum+row.count,0),
    exploredCount:explored.length,recent:explored.slice(0,3)};
}
