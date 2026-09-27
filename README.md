# Everyone's a 4.8

An interactive drop about trust signals in hiring. AI now writes the resumes and AI reads them, so hiring leans harder on who will vouch for you. Every rating system people have built for that job drifts to the top of its scale until it can no longer tell anyone apart. The drop measures that drift, explains the forces behind it, and lets you run a simulated team of 80 coworkers to see which rules keep a vouch worth something.

By [Brian Grover](https://www.linkedin.com/in/briantgrover) ([@briantgrover](https://x.com/briantgrover)), September 2026.

## What's on the page

1. **Why now.** Freelancer.com data showing that once an AI tool made tailored proposals free, employers valued them less and valued a worker's track record more.
2. **The drift.** A guess-then-reveal chart of our own measurement: the median San Francisco and New York Airbnb listing with 10 or more reviews is rated 4.84. Then eBay, college grades, an online labor market, LinkedIn endorsements and GitHub stars, each drawn as a grid of 100 stars.
3. **Why it happens.** Four forces, each backed by research: giving is free, the other person sees what you said, honesty costs you, and unhappy people go quiet. Ranked feeds make all four worse.
4. **What predicts the job.** Schmidt and Hunter's 1998 ranking of hiring methods against Sackett and colleagues' 2022 revision.
5. **The trust lab.** A simulation with four switches: one tap, written or tied to a piece of work; visible or blind; anyone or only coworkers; a feed ranked by followers or not.
6. **What holds up.** Four design rules for vouches, checked against the evidence.
7. **Methods and caveats**, including a box of widely repeated hiring statistics that fell apart when traced.

## Data and sources

- `research/airbnb_measure.py` downloads Inside Airbnb's detailed listings for San Francisco and New York City (snapshot of 14 June 2026) and writes the rating distribution to `data/airbnb.json`. Inside Airbnb data is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); credit to [Inside Airbnb](https://insideairbnb.com/).
- `research/sources.md` lists every number the page uses, the primary source it came from, and the ones that were cut.
- `data/figures.json` holds the numbers drawn in the charts, each traceable to the ledger.

## How it was built

Built with [Claude Code](https://claude.com/claude-code). Research agents traced every number to its primary source, other agents built the lab and the charts, and a fresh reviewer checked the finished page against the sources.

The page is static HTML, CSS and JavaScript with no framework, no build step, no cookies and no tracking.

- `index.html`: the page and all its copy
- `css/style.css`: the design system; `css/charts.css` and `css/lab.css` for the interactive parts
- `js/main.js`: the header rating and the blind-reveal cards
- `js/charts.js`: the four charts
- `js/lab-model.js`: the trust lab's model, with no DOM code, so it runs in Node too; `js/lab.js` draws it
- `js/stars.js`: the star used everywhere
- `tools/`: the share card template and the script that renders it

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
