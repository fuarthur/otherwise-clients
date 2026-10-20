export const TOUR_TIMING = Object.freeze({
  introMs: 2400, holdMs: 2500, departMs: 1200, edgeMinMs: 1500, edgeMaxMs: 12000, outroMs: 2400,
});

export function normalizeTourInput(input) {
  const invalid = () => { throw Object.assign(new Error('Invalid Galaxy tour options.'), {code:'invalid'}); };
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['topics','order','startId','timing','rotationDegrees','speed','loop','clean'].includes(key)) ||
      !Array.isArray(input.topics) || input.topics.some(id => typeof id !== 'string' || !id.trim())) invalid();
  if (input.order !== undefined && !['auto','given'].includes(input.order)) invalid();
  if (input.startId !== undefined && (typeof input.startId !== 'string' || !input.startId || input.order === 'given')) invalid();
  for (const key of ['loop','clean']) if (input[key] !== undefined && typeof input[key] !== 'boolean') invalid();
  for (const [key, min, max] of [['speed',.5,2],['rotationDegrees',0,12]]) {
    if (input[key] !== undefined && (!Number.isFinite(input[key]) || input[key] < min || input[key] > max)) invalid();
  }
  if (input.timing !== undefined && (!input.timing || typeof input.timing !== 'object' || Array.isArray(input.timing) ||
      Object.keys(input.timing).some(key => !(key in TOUR_TIMING)))) invalid();
  const timing = {...TOUR_TIMING, ...input.timing};
  for (const [key, value] of Object.entries(timing)) {
    const min = ['holdMs','edgeMinMs','edgeMaxMs'].includes(key) ? 100 : 0;
    if (!Number.isFinite(value) || value < min || value > 60000) invalid();
  }
  if (timing.edgeMinMs > timing.edgeMaxMs) invalid();
  return {topics: [...input.topics], order: input.order ?? 'auto', timing,
    rotationDegrees: input.rotationDegrees ?? 12, speed: input.speed ?? 1,
    loop: input.loop ?? false, clean: input.clean ?? false, ...(input.startId === undefined ? {} : {startId: input.startId})};
}
