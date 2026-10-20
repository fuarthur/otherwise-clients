import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Scenarios own their fixtures and assertions; this helper owns the extension
// launch and any profile it creates. A supplied profile stays with its caller.
export async function launchExtension({
  extension = fileURLToPath(new URL('../dist/otherwise-extension', import.meta.url)),
  profile,
  profilePrefix = 'otherwise-browser-',
  args = [],
  ...options
} = {}) {
  const {chromium} = await import(process.env.OTHERWISE_PLAYWRIGHT_MODULE || 'playwright');
  const ownsProfile = profile === undefined;
  const directory = ownsProfile ? await mkdtemp(resolve(tmpdir(), profilePrefix)) : profile;
  let context, disposal;
  const close = () => disposal ??= (async () => {
    try {
      await context?.close();
    } finally {
      if (ownsProfile) await rm(directory, {recursive:true, force:true});
    }
  })();
  try {
    context = await chromium.launchPersistentContext(directory, {
      executablePath:process.env.OTHERWISE_CHROMIUM || chromium.executablePath(),
      headless:true,
      ignoreDefaultArgs:['--disable-extensions'],
      viewport:{width:390, height:850},
      ...options,
      args:[`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, ...args],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const base = new URL('./', worker.url()).href;
    return {context, base, close};
  } catch (error) {
    await close();
    throw error;
  }
}
