# Client development

`npm test` runs the Node client tests and Python standard-library packaging/boundary tests. `npm run build` validates the public resources and creates an unpacked extension and ZIP. It imports no backend module and reads no private checkout.

`npm run audit:public` checks all tracked and unignored candidate source paths against an explicit allowlist and rejects private generation metadata in client assets. Keep the allowlist narrow when adding files. Secret scanning is a separate check; never commit connection codes, personal browser storage, `.env` files, browser profiles, QA output, or source/backend archives.

## Optional browser checks

Install Playwright and its Chromium build in your development environment:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run build
npm run test:ui
npm run test:guide
npm run test:galaxy
```

All shipped browser checks use preview data or isolated mock HTTP fixtures. They do not require an operational recommendation service. `OTHERWISE_PLAYWRIGHT_MODULE` can point to an already installed Playwright module, and `OTHERWISE_CHROMIUM` can select a compatible Chromium executable. QA output stays in ignored `.cache/` directories.

The public `client-assets/` files are reviewed resource exports. Do not replace them with private source registries, generation metadata, embeddings, backend data directories, or model files. Stable topic IDs and public compatibility identities are intentional API fields, not secrets. Both standalone build validation and tests check the packaged resource boundary.
