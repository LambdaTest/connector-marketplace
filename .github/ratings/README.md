# Ratings (off)

Ratings are turned off for v1. This folder keeps the "Rate a connector" issue form out of
`.github/ISSUE_TEMPLATE/`, so users don't see it.

To turn ratings on:

1. Move `review-connector.yml` back to `.github/ISSUE_TEMPLATE/`.
2. Set the repository variable `RATINGS_ENABLED` to `true`
   (`gh variable set RATINGS_ENABLED --body true`).
3. Run the Site workflow, or wait for the next scheduled run.

`reviews.yml`, `scripts/build-ratings.js` and the site's rating UI all check `RATINGS_ENABLED`.
