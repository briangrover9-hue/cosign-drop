# Everyone's a 4.8

An interactive drop about trust signals in hiring. AI now writes the resumes and AI reads them, so hiring leans harder on who will vouch for you. The rating systems people have built for that job tend to drift toward the top of their scales, where they tell fewer and fewer people apart. The drop measures that drift, explains the forces behind it, and lets you run a simulated company of 80 coworkers to see which rules keep a vouch worth something.

By [Brian Grover](https://www.linkedin.com/in/briantgrover) ([@briantgrover](https://x.com/briantgrover)), September 2026.

## What's on the page

Six full-screen scenes under a fixed frame: the title and the page's own rating at the top, a counter with dots at the bottom. One scroll, swipe or arrow key moves one scene, and each scene's line hands off to the next.

1. **Everyone's a 4.8.** We rate everything now, and approval that costs nothing turns into a commodity that can't tell anyone apart.
2. **It's the same everywhere.** Harvard grades, eBay sellers, LinkedIn endorsements, GitHub stars and Airbnb listings, each a grid of 100 stars that fills as the scene arrives, all crowded at the top; hotels, rated as businesses, are the exception.
3. **One example up close.** Drag the star to guess the typical Airbnb rating in San Francisco and New York. The big number counts to the answer from our own measurement of this year's data, 4.84, as every listing rises from the slider's track.
4. **The lab.** A simulated company of 80 coworkers rating each other with one-click stars. The scores drift up toward 5, and the top 10 by score finds only half of the 10 most skilled. A "How this works" strip above the chart gives the model in three plain steps before any result, and on a phone it folds away after the first run.
5. **The fix.** Which rules find the best people, in our simulation? A bar for each set of rules, from one-click likes to everything together, shows how many of the 10 most skilled the top 10 finds, averaged over 12 simulated companies, with a line where guessing lands. "Stars" or "A named yes" picks the bars, so LinkedIn-style endorsements (about 2) sit beside Cosign-style rules (about 6). A line under the bars says they are simulated, not measured: the direction of each effect comes from research, and the sizes are our guesses. The scene opens on "Tied to real work," the rules its headline names, and a tap on any bar runs those rules in the lab beside it, with one plain line on what they find and what they cost. "Try other rules" opens a frosted panel with every switch and assumption.
6. **What this means for a cosign.** Most ratings count every vote the same; people don't. Weighing approval by who gave it and how much care went into it keeps it from turning into a commodity, and tying it to the work is the next step.

Scenes 2, 4, 5 and 6 each have a "Why?" that opens a few sentences of evidence, with sources, in a frosted card over the scene's text. The page's rating climbs from 3.0 to 5.0 as you go, and the last scene says so. `methods.html` holds the rest behind a short summary, in four parts that open on request: the data, the lab's rules, the research, and the sources.

## Data and sources

- `research/airbnb_measure.py` downloads Inside Airbnb's detailed listings for San Francisco and New York City (snapshot of 14 June 2026) and writes the rating distribution to `data/airbnb.json`. Inside Airbnb data is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); credit to [Inside Airbnb](https://insideairbnb.com/).
- `research/sources.md` lists every number the page uses, the primary source it came from, and the ones that were cut.
- `data/figures.json` holds the numbers drawn in the charts, each traceable to the ledger. Its `rules` block is scene 5's bars; `node tools/lab-check.mjs` fails if any of them drifts from the model.

## How it was built

Built with [Claude Code](https://claude.com/claude-code). Research agents traced every number to its primary source, other agents built the lab and the charts, six specialist agents reviewed the design, motion, scrolling, accessibility, layout and loading, and a fresh reviewer checked the finished page against the sources.

The page is static HTML, CSS and JavaScript with no framework, no build step, no cookies and no tracking.

- `index.html`: the six scenes and all their copy; `methods.html`: the notes, research and methods
- `css/style.css`: the design system (paper, ink and gold, the two type roles, the one motion curve, the grain); `css/stage.css` for the scenes and the frame; `css/charts.css` and `css/lab.css` for the interactive parts; `css/methods.css` for the notes page
- `js/stage.js`: the scenes, the frame, the "Why?" cards and the inputs that move between scenes
- `js/motion.js`: the page's one easing curve and timings, for scripts
- `js/charts.js`: the guess, the drift grids, and the two charts on the notes page
- `js/lab-model.js`: the trust lab's model, with no DOM code, so it runs in Node too; `js/lab.js` draws it, and `node tools/lab-check.mjs` checks the claims the page makes about it
- `js/methods.js`: the blind-reveal cards on the notes page
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
