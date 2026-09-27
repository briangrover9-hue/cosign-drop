"""Measures how bunched Airbnb guest ratings are in San Francisco and New York City.

Method: download Inside Airbnb's detailed "listings.csv.gz" snapshot for each
city, keep the listings that carry a numeric review_scores_rating (Airbnb's own
displayed aggregate rating, as scraped by Inside Airbnb; a listing only gets
one once it has at least one review), and compute the shape
of that distribution: mean, median, percentiles, the share sitting at various
high thresholds, and a histogram in steps of 0.01 from 1.00 to 5.00. Every
statistic is computed twice: once for all rated listings, and once restricted
to number_of_reviews >= 10, since a single five-star review can hand a brand
new listing a perfect 5.00 and skew the tail. The same statistics are also
computed for the two cities pooled together. Sub-scores (accuracy,
cleanliness, check-in, communication, location, value) get a median and a
share >= 4.8, for the >= 10-reviews group only.

Source and license: Inside Airbnb (https://insideairbnb.com), a mission-driven,
independent project that scrapes public Airbnb listing pages. Data is licensed
under a Creative Commons Attribution 4.0 International License (CC BY 4.0):
https://creativecommons.org/licenses/by/4.0/. The license statement, "This
data is licensed under a Creative Commons Attribution 4.0 International
License.", appears at https://insideairbnb.com/get-the-data/, directly above
the "Data Downloads" heading. Credit: Inside Airbnb, CC BY 4.0.

Snapshot dates used below were confirmed by reading
https://insideairbnb.com/get-the-data/ on 2026-09-27: San Francisco and New
York City were both last compiled on 14 June 2026. Both files are the
"Detailed Listings data" (listings.csv.gz), not the smaller visualization
summary (listings.csv).

Historical snapshots: older dated paths on data.insideairbnb.com, found in
Wayback Machine copies of the get-the-data page (2015-11-01, 2017-07-02,
2019-07-08, 2021-12-04 and 2023-03-06 for both cities), all returned HTTP 403
when tested on 2026-09-27. The raw files are no longer served, so this script
measures one snapshot and makes no claim about change over time.

Running this script takes no arguments. It downloads (or reuses previously
downloaded copies of) both listings files into RAW_DIR, computes the metrics
below, and writes them to data/airbnb.json next to this repo's research/
folder.
"""

import csv
import datetime as dt
import gzip
import json
import os
import statistics
import urllib.request
import shutil
from pathlib import Path

# Detailed listings snapshots, from https://insideairbnb.com/get-the-data/
# Snapshot date for both cities: 14 June 2026.
SF_URL = "https://data.insideairbnb.com/united-states/ca/san-francisco/2026-06-14/data/listings.csv.gz"
NYC_URL = "https://data.insideairbnb.com/united-states/ny/new-york-city/2026-06-14/data/listings.csv.gz"
SNAPSHOT_DATE = "2026-06-14"

REPO_ROOT = Path(__file__).resolve().parent.parent

# Raw downloads are cached here (about 20 MB, kept out of git by .gitignore).
# Set AIRBNB_RAW_DIR to use a different folder.
RAW_DIR = os.environ.get("AIRBNB_RAW_DIR", str(REPO_ROOT / ".cache" / "airbnb"))
OUTPUT_PATH = REPO_ROOT / "data" / "airbnb.json"

SUBSCORE_COLUMNS = [
    "review_scores_accuracy",
    "review_scores_cleanliness",
    "review_scores_checkin",
    "review_scores_communication",
    "review_scores_location",
    "review_scores_value",
]

# The CSV has long, multiline quoted fields (descriptions, amenities lists),
# so the csv module's default field size limit is too small.
csv.field_size_limit(10_000_000)


def download(url, dest_path):
    """Download url to dest_path, unless a non-empty file is already there."""
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        return dest_path
    request = urllib.request.Request(url, headers={"User-Agent": "cosign-drop-research/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, open(dest_path, "wb") as out_file:
        shutil.copyfileobj(response, out_file)
    return dest_path


def to_float(value):
    """Parse a CSV cell as a float, or None if it is blank or not numeric."""
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def to_int(value):
    parsed = to_float(value)
    return int(parsed) if parsed is not None else 0


def load_listings(gz_path):
    """Read a detailed listings.csv.gz file into plain dicts with just the
    fields this script needs, already converted to numbers."""
    rows = []
    with gzip.open(gz_path, "rt", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            rows.append(
                {
                    "number_of_reviews": to_int(raw.get("number_of_reviews")),
                    "rating": to_float(raw.get("review_scores_rating")),
                    "sub_scores": {col: to_float(raw.get(col)) for col in SUBSCORE_COLUMNS},
                }
            )
    return rows


def histogram(ratings):
    """Counts per 0.01 step from 1.00 to 5.00 (401 buckets), plus a separate
    bucket for anything below 1.00. Each rating is rounded to 2 decimals by
    working in integer cents-of-a-star (round(r * 100)), which avoids binary
    floating point rounding surprises."""
    bins = [0] * 401  # index 0 -> 1.00 stars, index 400 -> 5.00 stars
    below_1 = 0
    for rating in ratings:
        cents = round(rating * 100)
        if cents < 100:
            below_1 += 1
        else:
            cents = min(cents, 500)  # defensive clip; no value above 5.00 was observed
            bins[cents - 100] += 1
    return {"below_1": below_1, "bins_1_00_to_5_00_step_0_01": bins}


def shares(ratings, n):
    """Share of ratings meeting each threshold, rounded to 4 decimals."""

    def share(predicate):
        return round(sum(1 for r in ratings if predicate(r)) / n, 4)

    return {
        "ge_4_5": share(lambda r: r >= 4.5),
        "ge_4_7": share(lambda r: r >= 4.7),
        "ge_4_8": share(lambda r: r >= 4.8),
        "ge_4_9": share(lambda r: r >= 4.9),
        "eq_5_00": share(lambda r: r == 5.0),
        "lt_4_5": share(lambda r: r < 4.5),
        "lt_4_0": share(lambda r: r < 4.0),
        "lt_3_0": share(lambda r: r < 3.0),
    }


def distribution_stats(ratings):
    """Mean, median and key percentiles. Percentiles use
    statistics.quantiles(..., method="inclusive"): the standard linear
    interpolation definition, the same family as Excel's PERCENTILE.INC and
    R's type 7. Values are rounded to 3 decimals."""
    quantiles = statistics.quantiles(ratings, n=100, method="inclusive")
    return {
        "n": len(ratings),
        "mean": round(statistics.fmean(ratings), 3),
        "median": round(statistics.median(ratings), 3),
        "p5": round(quantiles[4], 3),
        "p10": round(quantiles[9], 3),
        "p25": round(quantiles[24], 3),
        "p75": round(quantiles[74], 3),
        "p90": round(quantiles[89], 3),
    }


def rated_block(rows, min_reviews):
    """Full stats block for listings with a numeric rating and
    number_of_reviews >= min_reviews. min_reviews=0 also adds the median
    number of reviews (showing how thin the "all rated" group can be);
    min_reviews=10 also adds per-sub-score medians and shares >= 4.8."""
    subset = [row for row in rows if row["rating"] is not None and row["number_of_reviews"] >= min_reviews]
    ratings = [row["rating"] for row in subset]

    block = distribution_stats(ratings)
    block["shares"] = shares(ratings, len(ratings))
    block["histogram"] = histogram(ratings)

    if min_reviews == 0:
        review_counts = [row["number_of_reviews"] for row in subset]
        block["median_number_of_reviews"] = round(statistics.median(review_counts), 1)
    else:
        sub_scores = {}
        for col in SUBSCORE_COLUMNS:
            values = [row["sub_scores"][col] for row in subset if row["sub_scores"][col] is not None]
            if values:
                sub_scores[col] = {
                    "median": round(statistics.median(values), 3),
                    "share_ge_4_8": round(sum(1 for v in values if v >= 4.8) / len(values), 4),
                }
        block["sub_scores"] = sub_scores

    return block


def base_summary(rows):
    """The metrics shared by a single city and the two-city pool."""
    n_with_reviews = sum(1 for row in rows if row["number_of_reviews"] > 0)
    ratings_present = [row["rating"] for row in rows if row["rating"] is not None]
    return {
        "n_listings": len(rows),
        "n_with_reviews": n_with_reviews,
        "n_rated": len(ratings_present),
        "rating_scale_seen": {"min": min(ratings_present), "max": max(ratings_present)},
        "rated": rated_block(rows, min_reviews=0),
        "rated_min10_reviews": rated_block(rows, min_reviews=10),
    }


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    sf_gz = download(SF_URL, os.path.join(RAW_DIR, "san_francisco_listings.csv.gz"))
    nyc_gz = download(NYC_URL, os.path.join(RAW_DIR, "new_york_city_listings.csv.gz"))

    sf_rows = load_listings(sf_gz)
    nyc_rows = load_listings(nyc_gz)

    result = {
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": {
            "provider": "Inside Airbnb",
            "license": "CC BY 4.0",
            "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "license_statement": (
                "This data is licensed under a Creative Commons Attribution "
                "4.0 International License."
            ),
            "license_appears_at": "https://insideairbnb.com/get-the-data/",
        },
        "cities": {
            "san_francisco": {
                "snapshot_date": SNAPSHOT_DATE,
                "source_url": SF_URL,
                **base_summary(sf_rows),
            },
            "new_york_city": {
                "snapshot_date": SNAPSHOT_DATE,
                "source_url": NYC_URL,
                **base_summary(nyc_rows),
            },
        },
        "both_cities_combined": {
            "note": "Pooled listings from san_francisco + new_york_city above.",
            **base_summary(sf_rows + nyc_rows),
        },
    }

    os.makedirs(OUTPUT_PATH.parent, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
        f.write("\n")
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
