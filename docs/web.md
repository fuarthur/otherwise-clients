# Static websites

Both sites are plain HTML, CSS, and JavaScript; no backend or build process is required.

```sh
python3 -m http.server 8080 --directory website
```

Open `http://localhost:8080`. Substitute `introduction-site` to view the alternate introduction designs. `previews.html` links the design variants. The website's topic journeys are illustrative examples, not recommendation algorithms.

To host with GitHub Pages, publish the contents of `website/` using a Pages deployment workflow or a dedicated deployment branch. Merely building this repository does not publish a site. Links to the client project use this public repository.
