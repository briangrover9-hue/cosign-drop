# Sources ledger

Every number the page might use, where it comes from, and whether it passed. A number goes on the page only if its status is **Confirmed** (read in the primary source) or it is labeled on the page for what it is. Checked September 26 to 27, 2026.

Status key: **Confirmed** means read in the primary source. **Secondary** means seen only in reporting about the source. **Cut** means it does not go on the page.

## Our own measurement

| Number | Value | Source | Status |
|---|---|---|---|
| Median guest rating, SF and NYC listings with 10+ reviews | 4.84 (mean 4.79) | Inside Airbnb, detailed listings snapshots of 14 June 2026, [San Francisco](https://data.insideairbnb.com/united-states/ca/san-francisco/2026-06-14/data/listings.csv.gz) and [New York City](https://data.insideairbnb.com/united-states/ny/new-york-city/2026-06-14/data/listings.csv.gz). CC BY 4.0, license stated at [insideairbnb.com/get-the-data](https://insideairbnb.com/get-the-data/). Computed by `research/airbnb_measure.py`, output in `data/airbnb.json`. | Confirmed |
| Share of those listings rated 4.5 or higher | 92.3% (SF 95.1%, NYC 91.5%) | same | Confirmed |
| Share rated 4.8 or higher | 60.6% (SF 73.0%, NYC 56.9%) | same | Confirmed |
| Share rated below 4.0 | 0.3% (SF 0.08%, NYC 0.4%) | same | Confirmed |
| Share rated below 4.7 | 23.7% (SF 14.6%, NYC 26.4%) | same | Confirmed |
| Listings with 10+ reviews | 15,694 (SF 3,592, NYC 12,102) | same | Confirmed |
| All rated listings, any review count | 27,448; median 4.88, mean 4.75; 87.6% at 4.5+, 62.8% at 4.8+ | same | Confirmed |
| Softest sub-score | "value", median 4.76, 40.2% at 4.8+ (10+ reviews) | same | Confirmed |

Older Inside Airbnb snapshots (2015 to 2023) are no longer served (HTTP 403 on 2026-09-27), so the page makes no claim about Airbnb ratings changing over time from this data.

## Why it matters now

| Number | Value | Source | Status |
|---|---|---|---|
| What employers would pay for a proposal one standard deviation more tailored, before and after AI writing tools (Freelancer.com, considered applications) | $25.67 before, $14.85 after | Galdin and Silbert (2025), "Making Talk Cheap: Generative AI and Labor Market Signaling," [arXiv 2511.08785](https://arxiv.org/abs/2511.08785), Table 2, columns 2 and 4 | Confirmed |
| Same, for a worker's platform reputation score one standard deviation higher | $27.96 before, $46.24 after | same, Table 2 | Confirmed. The authors emphasize the fall in tailoring's value; the rise in reputation's value is our reading of their table, and the page says so. |
| Structural estimate: top-quintile workers hired less, bottom-quintile more, after AI writing | 19% less, 14% more | same, abstract | Confirmed (model counterfactual, labeled as such) |
| Job seekers who used AI to write or customize a resume or cover letter | 29.3% in 2025, up from 17.3% in 2024 | iHire, [State of Online Recruiting 2025](https://www.ihire.com/resourcecenter/employer/pages/the-state-of-online-recruiting-2025), n = 1,421 | Confirmed, vendor survey |
| HR professionals using AI to support HR work | 43% in 2025, up from 26% in 2024 | SHRM, 2025 Talent Trends, n = 2,040 | Confirmed for this figure only; the narrower "AI screens resumes" share is secondary and cut |
| Executives who say their applicant tracking systems reject qualified high-skill candidates | 88% | Fuller, Raman, Sage-Gavin and Hines (2021), Hidden Workers: Untapped Talent, Harvard Business School and Accenture, via the [Harvard Gazette](https://news.harvard.edu/gazette/story/2021/09/new-study-says-hidden-workers-are-being-excluded/) | Secondary (the report PDF has moved); hold |
| LinkedIn applications per minute | about 11,000, up 45% | New York Times DealBook, June 21, 2025 | Secondary; cut unless the article itself can be read |
| AI writing help raised hiring in a field experiment | 8% more likely to be hired | van Inwegen (Wiles), Munyikwa and Horton, "Algorithmic Writing Assistance on Jobseekers' Resumes Increases Hires," [NBER w30886](https://www.nber.org/papers/w30886); Management Science (2024) | Confirmed |
| Referred workers quit less | 10% to 30% less likely to quit | Burks, Cowgill, Hoffman and Housman (2015), QJE 130(2), [IZA DP 7382](https://docs.iza.org/dp7382.pdf) | Confirmed |

## The drift

| Number | Value | Source | Status |
|---|---|---|---|
| eBay sellers' percent positive feedback | mean 99.3%, median 100% (10th percentile 98%) | Nosko and Tadelis (2015), [NBER w20830](https://www.nber.org/system/files/working_papers/w20830/w20830.pdf), p. 2 and Figure 3; US buyers who joined in 2011, tracked to 2014 | Confirmed |
| Same sellers, counting transactions that got no feedback ("effective percent positive") | mean 64%, median 67% | same, p. 2 | Confirmed |
| Airbnb properties rated 4.5 stars or higher | 94% (mean 4.7) | Zervas, Proserpio and Byers, working paper of Jan 28, 2015, [PDF](https://internet.psych.wisc.edu/wp-content/uploads/532-Master/532-UnitPages/Unit-10/Zervas_2015.pdf); published in Marketing Letters 32 (2021) as "nearly 95%" | Confirmed |
| TripAdvisor hotels rated 4.5 or higher, and at 5 | 26%, and 4% (mean 3.8) | same | Confirmed |
| College grades that are A's | 43% (about 2008), up 28 points since 1960 | Rojstaczer and Healy (2012), Teachers College Record 114(7), [PDF](https://www.gradeinflation.com/tcr2012grading.pdf) | Confirmed |
| Harvard College grades that are A's | 24% (2005), 40.3% (2015), 60.2% (2025) | Harvard Office of Undergraduate Education, [Update on Grading, Oct 22, 2025](https://oue.fas.harvard.edu/faculty-resources/report-on-grading/), p. 3 | Confirmed |
| Yale grades that are A or A- | 78.97% (2022 to 2023); the median grade is an A | Ray C. Fair, [Grade Report Update 2022-2023](https://fairmodel.econ.yale.edu/yalegrds/rep2023.pdf) | Confirmed |
| Online labor market, average public rating | 3.74 (early 2007) to 4.85 (May 2016) | Filippas, Horton and Golden, "Reputation Inflation," Marketing Science 41(4) (2022); read in [NBER w25857](https://www.nber.org/system/files/working_papers/w25857/w25857.pdf) | Confirmed |
| Same, share of workers getting 5 stars | 33% to 85% within six years | same | Confirmed |
| LinkedIn endorsements launched as one click | September 24, 2012 | LinkedIn blog, ["Introducing Endorsements: Give Kudos with Just One Click"](https://web.archive.org/web/20120926031752/http://blog.linkedin.com:80/2012/09/24/introducing-endorsements-give-kudos-with-just-one-click/) (archived) | Confirmed |
| Endorsements given in under six months | 1 billion, to 58 million people | LinkedIn blog, [March 6, 2013](https://web.archive.org/web/20130308140056/http://blog.linkedin.com:80/2013/03/06/1-billion-endorsements-given-on-linkedin-infographic/) (archived) | Confirmed |
| Endorsements by October 2016, and the redesign that put colleagues' endorsements first | more than 10 billion | LinkedIn blog, ["Rethinking Endorsements"](https://www.linkedin.com/blog/member/product/rethinking-endorsements-linkedin-features), Oct 19, 2016 | Confirmed |
| Endorsers asked how they know the person and how skilled they are | around June 2018 | Vengreso blog, June 21, 2018 | Secondary; mention only as reported, or cut |
| Suspected fake GitHub stars, July 2019 to December 2024 | 6.0 million, across 18,617 repositories, from 301,000 accounts | He, Yang, Burckhardt, Kapravelos, Vasilescu and Kästner, "Six Million (Suspected) Fake Stars on GitHub," ICSE 2026, [PDF](https://cmustrudel.github.io/papers/icse2026fakestars.pdf) (earlier arXiv 2412.13459 said 4.5 million through Oct 2024) | Confirmed |
| Popular repositories with fake-star campaigns, July 2024 | 16.66% (3,499) | same | Confirmed |
| Effect of fake stars | a boost for under two months, then a liability | same | Confirmed |

## Why it happens

| Number | Value | Source | Status |
|---|---|---|---|
| Airbnb blind reveal: change in review rates | guests +1.7%, hosts +10% (relative) | Fradkin, Grewal and Holtz (2021), "Reciprocity and Unveiling in Two-Sided Reputation Systems," Marketing Science 40(6), [open access](https://andreyfradkin.com/assets/reviews_paper.pdf), Section 6, Figure 7 | Confirmed |
| Same: correlation of positive text between guest and host reviews | fell 50% | same | Confirmed |
| Same: guests' five-star share | did not rise; 2 to 4 star reviews rose | same | Confirmed |
| Airbnb guests who privately would not recommend but still gave a public 5 | more than 6% of the 3% who privately said no | Fradkin, Grewal, Holtz and Pearson (2015), EC '15, [NBER draft](https://conference.nber.org/confer/2015/SI2015/PRIT/Fradkin_Grewal_Holtz_Pearson.pdf), p. 3 | Confirmed |
| eBay sellers retaliating after negative feedback, before 2007 | 46.8% (vs 0.4% after positive) | Bolton, Greiner and Ockenfels (2013), "Engineering Trust," Management Science 59(2), [author draft](https://ben.orsee.org/papers/engineering_trust.pdf), p. 28 | Confirmed. The paper does not measure the effect of eBay's 2008 change; the page must not imply it does. |
| Lab: blind feedback cut the correlation between the two sides' ratings | 0.680 to 0.411 | same, Table 4 | Confirmed (lab experiment, n = 192) |
| Employers who privately would definitely not rehire but publicly gave 4+ stars | 28.4% | Filippas, Horton and Golden, NBER w25857 | Confirmed |
| Private feedback over the same period | fell while public feedback rose, for the same transactions | same | Confirmed |
| eBay negative feedback actually reported | 0.55% (buyers), 0.58% (sellers) | Dellarocas and Wood (2008), "The Sound of Silence in Online Feedback," Management Science 54(3), [preprint](https://www.cs.princeton.edu/courses/archive/spr08/cos444/papers/dellarocas_wood06.pdf), Table 2 | Confirmed |
| Their estimate of buyers who were actually dissatisfied | about 18.5% (Model A) to 21% (Model C) | same, Tables 5 and 6 | Confirmed |
| Mildly dissatisfied traders who leave any feedback | almost none; satisfied traders report 82% (buyers) and 87% (sellers) of the time | same, p. 13 | Confirmed |
| Matthew effect | definition in Merton's words | Merton (1968), "The Matthew Effect in Science," Science 159(3810), [DOI](https://doi.org/10.1126/science.159.3810.56), p. 58 | Confirmed |
| MusicLab: showing download counts made hits bigger and less predictable | 14,341 participants | Salganik, Dodds and Watts (2006), Science 311(5762), [PDF](https://www.princeton.edu/~mjs3/salganik_dodds_watts06_full.pdf) | Confirmed. Gini values appear only in charts; the page gives no Gini numbers. |
| One random up-vote | next viewer 32% more likely to up-vote; final ratings 25% higher | Muchnik, Aral and Taylor (2013), Science 341(6146), [PDF](https://snap.stanford.edu/class/cs224w-readings/muchnik13bias.pdf) | Confirmed |
| Verified-guest reviews (Expedia) vs anyone-can-post (TripAdvisor) | 5-star share 44% vs 31%; 1 to 2 star share 15% vs 25%; suspicious gaps largest where fake-review incentives are highest | Mayzlin, Dover and Chevalier (2014), AER 104(8), [NBER w18340](https://www.nber.org/system/files/working_papers/w18340/w18340.pdf) | Confirmed |

## What predicts job performance

Operational validity for overall job performance. 1998 values from Schmidt and Hunter (1998), Psychological Bulletin 124(2), Table 1, [DOI](https://doi.org/10.1037/0033-2909.124.2.262). Revised values from Sackett, Zhang, Berry and Lievens (2022), Journal of Applied Psychology 107(11), Table 3, [DOI](https://doi.org/10.1037/apl0000994). All Confirmed.

| Method | 1998 | 2022 |
|---|---|---|
| Structured interviews | .51 | .42 |
| Job knowledge tests | .48 | .40 |
| Work sample tests | .54 | .33 |
| Cognitive ability tests | .51 | .31 |
| Integrity tests | .41 | .31 |
| Unstructured interviews | .38 | .19 |
| Conscientiousness | .31 | .19 |
| Job experience (years) | .18 | .07 |
| Peer ratings | .49 | not re-estimated |
| Reference checks | .26 | not re-estimated |
| Years of education | .10 | not re-estimated |

Caveats: Sackett et al. (2023, IOP 16(3)) revise cognitive ability again to .23 using an unpublished conference analysis. Oh, Le and Roth (2023, JAP 108(8)) and Bobko et al. (2024, IJSA 33(1)) dispute how much the 2022 paper lowers the estimates. Work samples show a larger Black-White gap (d = .67) than most methods in the same table.

## Costly signals

| Number | Value | Source | Status |
|---|---|---|---|
| Dating site "roses" (2 or 8 per person): acceptance with and without one | offers to men 19.7% to 23.6%; offers to women 12.3% to 12.9% | Lee and Niederle (2015), "Propose with a Rose?", Experimental Economics 18, [PDF](https://web.stanford.edu/~niederle/Lee.Niederle.Rose.ExpEcon.2015.pdf), pp. 742 to 743 | Confirmed |
| Economics job market: each candidate may send 2 signals; effect of a signal on getting an interview | +6.8 percentage points | Coles, Cawley, Levine, Niederle, Roth and Siegfried (2010), Journal of Economic Perspectives 24(4), [PDF](https://web.stanford.edu/~niederle/JobMarket.JEP2010..pdf), Table 3 | Confirmed |

## Cosign, from its own public pages

| Fact | Source | Status |
|---|---|---|
| "A curated professional network for the people and companies that drive the startup ecosystem." | [cosign.co](https://cosign.co) | Confirmed |
| "A directory of people and companies built around who believes in them - and why." | [cosign.co/faq](https://cosign.co/faq) | Confirmed |
| A cosign means putting "your name and reputation behind that belief," and the FAQ asks cosigners to be specific about what they know | same | Confirmed |
| Having worked together is not required; the FAQ asks that "you can explain its basis" | same | Confirmed |
| Cosign is focused on positive recognition | same | Confirmed |
| Launched September 25, 2026, as a free product from a16z | [a16z launch post](https://a16zjobs.substack.com/p/introducing-cosign-a-new-space-to) | Confirmed |
