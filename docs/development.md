# Client development

`npm test` runs the Node client tests and Python standard-library packaging/boundary tests. `npm run build` validates the public resources and creates an unpacked extension and ZIP. It imports no backend module and reads no private checkout.

`npm run audit:public` checks all tracked and unignored candidate source paths against an explicit allowlist and rejects private generation metadata in client assets. Keep the allowlist narrow when adding files. Secret scanning is a separate check; never commit connection codes, personal browser storage, `.env` files, browser profiles, QA output, or source/backend archives.

## Optional browser checks

Install Playwright and its Chromium build in your development environment:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install --no-shell chromium
npm run build
npm run test:ui
npm run test:guide
npm run test:galaxy
npm run test:galaxy-tour
npm run test:interest-draft
npm run test:stats
```

All shipped browser checks use preview data or isolated mock HTTP fixtures. They do not require an operational recommendation service. `OTHERWISE_PLAYWRIGHT_MODULE` can point to an already installed Playwright module, and `OTHERWISE_CHROMIUM` can select a compatible Chromium executable. QA output stays in ignored `.cache/` directories.

The public `client-assets/` files are reviewed resource exports. Do not replace them with private source registries, generation metadata, embeddings, backend data directories, or model files. Stable topic IDs and public compatibility identities are intentional API fields, not secrets. Both standalone build validation and tests check the packaged resource boundary.

## Current client features

Galaxy Tour supports saved-interest, interest-group, and catalog-category routes, playback controls, and three bundled music tracks with independent volume, repeat/shuffle modes, and crossfades. Interest drafts include browsing-context filtering, review, recovery, and persistence. Stats supports automatic or manual timezones and saved-interest field summaries.

The Galaxy Tour catalog tests read the reviewed `client-assets/` exports. Tour browser checks include their own test page and fixtures; no private service checkout or live connection file is needed.

On macOS, browser checks require access to window and application-registration services. Run them outside a restricted agent sandbox through its permission-review mechanism. Use temporary profiles and the matching Playwright Chromium build.
