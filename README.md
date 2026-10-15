# OtherWise clients

Browser extension, browser frontend, and static websites for OtherWise — your world, a little wider.

## Contents

- `extension/`: Chrome side panel, full-tab dashboard, Galaxy/Focus views, on-device interest management, and client tests.
- `website/`: the main static project website.
- `introduction-site/`: alternate static introduction pages.
- `client-assets/`: public topic text, precomputed map display data, and input choices. These are client resources, not a recommendation engine.
- `scripts/`: standalone packaging, public-boundary validation, and browser checks with isolated fixtures.

## Build and install

Requires Node.js 22+, Python 3.11+, and Chrome 116+. Normal builds require no Python packages, model downloads, or backend checkout.

```sh
npm test
npm run audit:public
npm run build
```

In `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/otherwise-extension`.
The distributable archive is `dist/OtherWise-extension.zip`; unzip it before loading in Chrome.

The extension dashboard and side panel share local extension storage. Preview the browser frontend without a service:

```sh
python3 -m http.server 8080 --directory dist/otherwise-extension
```

Open `http://localhost:8080/dashboard.html?preview=1` or `http://localhost:8080/sidepanel.html?preview=1`.
Preview results are recorded examples, not live recommendations.

## Service connection

Live recommendations require a separately operated compatible OtherWise service. Configure its address and, where required, access code in **Settings → Service connection**. No production service address or credentials are bundled. The localhost connection option is for developers who already have access to a compatible local service.

The service implementation, recommendation algorithms, models, embeddings, data import/generation programs, and infrastructure are maintained separately and are not part of this repository. Static map neighbors are precomputed display data. Client code constructs requests, validates responses, and renders results; it does not run the production recommendation engine.

See [development](docs/development.md) and [static websites](docs/web.md).

## License

Original client code is licensed under the [GNU General Public License v3.0](LICENSE), SPDX `GPL-3.0-only`. Commercial use is allowed subject to the license. When conveying covered versions, provide Corresponding Source as required by GPLv3.

Public catalog data and third-party material retain the licenses and attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). A source-code license does not grant trademark rights.
