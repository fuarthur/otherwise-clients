# Licenses and attribution

## Client software

Original OtherWise client code is distributed under GNU GPL v3.0 (GPL-3.0-only); see LICENSE. This repository excludes the separately maintained service implementation.

The rendering primitives in `extension/ui/focus-orb.js` and `extension/ui/focus-stars.js` were adapted from project contributor [BowenX307/otherwise](https://github.com/BowenX307/otherwise), revision `8281161`, respectively `src/universe/orbCore.ts` and `src/universe/starfield.ts`. Adaptations include JavaScript modules, injected scene time, per-scene SVG identifiers, domain colors, and compact rendering. They are included in this project's GPLv3 client release with project authorization; original source attribution is retained.

## Public catalog and map resources

`client-assets/catalog.json` is a public client projection containing stable topic IDs, labels, domains, and descriptions. The snapshot contains 31,637 topics: 718 authored project topics and 30,919 Wikidata topics. No article bodies are included.

- Wikidata labels and short structured descriptions are available under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); see [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing).
- The catalog selection and domain organization derive from [Wikipedia Vital Articles Level 5](https://en.wikipedia.org/wiki/Wikipedia:Vital_articles/Level/5) and [Wikimedia's expanded list](https://meta.wikimedia.org/wiki/List_of_articles_every_Wikipedia_should_have/Expanded), by Wikipedia and Wikimedia contributors. The derived selection and grouping retain [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) ([legal terms](https://creativecommons.org/licenses/by-sa/4.0/legalcode)). Project modifications include selection, grouping, deduplication, and projection into the client schema.
- To preserve these data rights, the assembled public catalog, input choices, precomputed map resource, and recorded public-topic fixture are distributed under CC BY-SA 4.0 to the extent copyright applies. This does not replace the underlying CC0 dedication for Wikidata facts and descriptions. These resources are distinct data assets and are not relicensed as GPL-only software.
- `client-assets/galaxy-layout.json` contains precomputed client display coordinates and neighbor data, plus public compatibility identifiers. It contains no model weights, embedding vectors, layout generator, or recommendation implementation.

The recorded fixture is `extension/focus-preview.v1.json`. Its example responses are public-topic data, not personal browser state or a live service.

### Wikipedia list revisions used by the catalog

- [Wikipedia:Vital articles/Level 5/Arts/Audiovisual arts](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FArts%2FAudiovisual%20arts&oldid=1378623156)
- [Wikipedia:Vital articles/Level 5/Arts/Narrative arts](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FArts%2FNarrative%20arts&oldid=1378623174)
- [Wikipedia:Vital articles/Level 5/Biology and health sciences/Animals](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FBiology%20and%20health%20sciences%2FAnimals&oldid=1378399197)
- [Wikipedia:Vital articles/Level 5/Biology and health sciences/Biology](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FBiology%20and%20health%20sciences%2FBiology&oldid=1378657382)
- [Wikipedia:Vital articles/Level 5/Biology and health sciences/Health](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FBiology%20and%20health%20sciences%2FHealth&oldid=1378657407)
- [Wikipedia:Vital articles/Level 5/Biology and health sciences/Plants](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FBiology%20and%20health%20sciences%2FPlants&oldid=1377848560)
- [Wikipedia:Vital articles/Level 5/Everyday life](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FEveryday%20life&oldid=1378623203)
- [Wikipedia:Vital articles/Level 5/Everyday life/Sports, games and recreation](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FEveryday%20life%2FSports%2C%20games%20and%20recreation&oldid=1378175751)
- [Wikipedia:Vital articles/Level 5/Geography/Cities](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FGeography%2FCities&oldid=1378175764)
- [Wikipedia:Vital articles/Level 5/Geography/Physical](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FGeography%2FPhysical&oldid=1377848615)
- [Wikipedia:Vital articles/Level 5/Geography/Regions and countries](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FGeography%2FRegions%20and%20countries&oldid=1378175776)
- [Wikipedia:Vital articles/Level 5/Geography/Technical](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FGeography%2FTechnical&oldid=1378175782)
- [Wikipedia:Vital articles/Level 5/History](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FHistory&oldid=1378657679)
- [Wikipedia:Vital articles/Level 5/Mathematics](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FMathematics&oldid=1378657716)
- [Wikipedia:Vital articles/Level 5/Philosophy and religion](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FPhilosophy%20and%20religion&oldid=1378623302)
- [Wikipedia:Vital articles/Level 5/Physical sciences/Astronomy](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FPhysical%20sciences%2FAstronomy&oldid=1378623310)
- [Wikipedia:Vital articles/Level 5/Physical sciences/Basics and measurement](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FPhysical%20sciences%2FBasics%20and%20measurement&oldid=1378658068)
- [Wikipedia:Vital articles/Level 5/Physical sciences/Chemistry](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FPhysical%20sciences%2FChemistry&oldid=1377818330)
- [Wikipedia:Vital articles/Level 5/Physical sciences/Earth science](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FPhysical%20sciences%2FEarth%20science&oldid=1377419682)
- [Wikipedia:Vital articles/Level 5/Physical sciences/Physics](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FPhysical%20sciences%2FPhysics&oldid=1377638300)
- [Wikipedia:Vital articles/Level 5/Society and social sciences/Culture](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FSociety%20and%20social%20sciences%2FCulture&oldid=1378623335)
- [Wikipedia:Vital articles/Level 5/Society and social sciences/Politics and economics](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FSociety%20and%20social%20sciences%2FPolitics%20and%20economics&oldid=1378441907)
- [Wikipedia:Vital articles/Level 5/Society and social sciences/Social studies](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FSociety%20and%20social%20sciences%2FSocial%20studies&oldid=1378175917)
- [Wikipedia:Vital articles/Level 5/Technology](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FTechnology&oldid=1378658261)
- [Wikipedia:Vital articles/Level 5/Technology/Agriculture](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FTechnology%2FAgriculture&oldid=1377419735)
- [Wikipedia:Vital articles/Level 5/Technology/Computing and communication](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FTechnology%2FComputing%20and%20communication&oldid=1378658279)
- [Wikipedia:Vital articles/Level 5/Technology/Optical, navigation and astronomical](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FTechnology%2FOptical%2C%20navigation%20and%20astronomical&oldid=1377675104)
- [Wikipedia:Vital articles/Level 5/Technology/Transportation](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FTechnology%2FTransportation&oldid=1378175933)
- [Wikipedia:Vital articles/Level 5/Technology/Weapons](https://en.wikipedia.org/w/index.php?title=Wikipedia%3AVital%20articles%2FLevel%205%2FTechnology%2FWeapons&oldid=1378400455)

## Visual and audio assets

Website visuals, bundled sound effects, and the three Galaxy Tour music tracks (`starlit-drift.mp3`, `stellar-passage.mp3`, and `distant-echoes.mp3`) were supplied for the OtherWise project. Sound source checksums and volume normalization are recorded in `extension/assets/sounds/provenance.json`. Bundled project artwork and audio are included under GPLv3 with this client release, except where another applicable notice states otherwise. External research pages and externally hosted video linked from the websites are not bundled or relicensed here.

## Development tools

Node.js, Python, Chrome/Chromium, Playwright, GitHub Actions, and other development tools retain their respective upstream licenses and are not vendored in this repository.
