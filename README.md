# Everyone's a 4.8

An interactive drop about trust signals in hiring. AI now writes the resumes and AI reads them, so hiring leans harder on who will vouch for you. The rating systems people have built for that job tend to drift toward the top of their scales, where they tell fewer and fewer people apart. The drop measures that drift, explains the forces behind it, and lets you run a simulated company of 80 coworkers to see which rules keep a vouch worth something.

By [Brian Grover](https://www.linkedin.com/in/briantgrover) ([@briantgrover](https://x.com/briantgrover)), September 2026.

## What's on the page

Four beats, each one screen, one visual and a sentence or two:

1. **Everyone's a 4.8.** Guess how guests rate the typical Airbnb in San Francisco and New York, then see the answer from our own measurement: 4.84.
2. **It happens wherever people rate each other.** Harvard grades, eBay sellers, LinkedIn endorsements and GitHub stars, each drawn as a grid of 100 stars, all crowded at the top.
3. **So the stars stop telling you who's good.** A simulated company of 80 coworkers rating each other with one-click stars. The scores drift up toward 5, and the top 10 by score finds only half of the 10 most skilled.
4. **Praise tied to real work fixes it.** The same company with every rating pointing at real work, then what this means for a cosign and the open question. "Try other rules" opens every switch and assumption, with the chart pinned in view.

Two collapsed sections hold the support: "Why this happens" (four ordinary forces, and the feed) and "The research" (Freelancer.com after ChatGPT, what predicts job performance, and four rules for a vouch that keeps its value, with the versions Cosign already ships). The methods list every source and the lab's rules, with the exact result for each setting.

## Data and sources

- `research/airbnb_measure.py` downloads Inside Airbnb's detailed listings for San Francisco and New York City (snapshot of 14 June 2026) and writes the rating distribution to `data/airbnb.json`. Inside Airbnb data is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); credit to [Inside Airbnb](https://insideairbnb.com/).
- `research/sources.md` lists every number the page uses, the primary source it came from, and the ones that were cut.
- `data/figures.json` holds the numbers drawn in the charts, each traceable to the ledger.

## How it was built

Built with [Claude Code](https://claude.com/claude-code). Research agents traced every number to its primary source, other agents built the lab and the charts, six specialist agents reviewed the design, motion, scrolling, accessibility, layout and loading, and a fresh reviewer checked the finished page against the sources.

The page is static HTML, CSS and JavaScript with no framework, no build step, no cookies and no tracking.

- `index.html`: the page and all its copy
- `css/style.css`: the design system; `css/charts.css` and `css/lab.css` for the interactive parts
- `js/main.js`: the header rating and the blind-reveal cards
- `js/charts.js`: the four charts
- `js/lab-model.js`: the trust lab's model, with no DOM code, so it runs in Node too; `js/lab.js` draws it, and `node tools/lab-check.mjs` checks the claims the page makes about it
- `js/stars.js`: the star used everywhere
- `tools/`: the share card and icon templates, the script that renders them, and the lab check

## Run it locally

```sh
python3 -m http.server 8800
```

Then open http://localhost:8800. The page needs a server (not a `file://` URL) because it loads JSON and JavaScript modules.

To re-measure the Airbnb data:

```sh
python3 research/airbnb_measure.py
```

## Credits

Airbnb data is from Inside Airbnb under CC BY 4.0. Fonts are Newsreader (Production Type) and IBM Plex Mono (IBM), both under the SIL Open Font License.
