// Titles exist only during extraction. Persist the reason, never this context.
const normalize=value=>value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}+#]+/gu,' ').trim().replace(/\s+/g,' ');
const segments=title=>title.split(/\s+[-–—]\s+|[|｜•»]/u).map(normalize).filter(Boolean);
export function titleSuffix(title) {
  const parts=segments(title);
  return parts.length>1?parts.at(-1):null;
}

export function titleSignatures(items) {
  const hosts=new Map();
  for(const item of items) {
    if(typeof item?.title!=='string')continue;
    let host;try{host=new URL(item.url).hostname;}catch{continue;}
    const parts=segments(item.title);
    if(parts.length<2)continue;
    const suffix=parts.at(-1);
    if(suffix.split(' ').length>8)continue;
    if(!hosts.has(host))hosts.set(host,new Map());
    const tails=hosts.get(host);
    if(!tails.has(suffix))tails.set(suffix,new Set());
    tails.get(suffix).add(parts.slice(0,-1).join(' | '));
  }
  return new Map([...hosts].map(([host,tails])=>[host,new Set([...tails].filter(([,heads])=>heads.size>=3).map(([tail])=>tail))]));
}

export function backgroundMatch(title,host,phrases,signatures) {
  const parts=segments(title),hostWords=` ${normalize(host)} `;
  const reasons=[];
  for(let index=0;index<parts.length;index++) {
    const part=` ${parts[index]} `;
    const institutionSignature=parts.length>1 && index===parts.length-1 && parts[index].split(' ').length<=12 &&
      (/^(?:university|college|institute|school) of /u.test(parts[index]) ||
       / (?:university|college|institute|campus)$/u.test(parts[index]));
    for(const alias of phrases) {
      let start=part.indexOf(alias);
      while(start!==-1) {
        const before=part.slice(0,start),after=part.slice(start+alias.length-1);
        const institution=institutionSignature || /(?:university|college|institute|school)\s+of\s*$/u.test(before) ||
          /^(?:university|college|institute|school)$/u.test(alias.trim()) && /^\s+of\s/u.test(after) ||
          /^\s+(?:state\s+)?(?:university|college|institute|campus)\b/u.test(after);
        const signature=index===parts.length-1 && signatures?.get(host)?.has(parts[index]) ||
          hostWords.includes(alias) && (parts[index]===alias.trim() || parts.length>1 && index===parts.length-1 && parts[index].split(' ').length<=8);
        if(!institution && !signature)return null; // A real content mention wins.
        reasons.push(institution?'institution':'signature');
        start=part.indexOf(alias,start+alias.length-1);
      }
    }
  }
  return reasons.includes('institution')?'institution':reasons.length?'signature':null;
}
