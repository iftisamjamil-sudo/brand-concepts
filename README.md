# brand-concepts

Learning library: [https://brand-concepts-seven.vercel.app/learn/](https://brand-concepts-seven.vercel.app/learn/)

`/learn/` loads video digests in the browser from the published Google Sheet CSV. Rows are not copied into the site at build time.

Published CSV:

`https://docs.google.com/spreadsheets/d/e/2PACX-1vSivYNmuFgU0Lfc234cItqYkbgkU7lAiI5VC_K3-Tbl7ovVbRk9X1JTlbiH6LmmY54aBuhO7Dl2uurx/pub?gid=1567771403&single=true&output=csv`

## CORS

That URL is fetched directly. `docs.google.com` answers with a 307 whose `Access-Control-Allow-Origin` echoes the page origin, and the redirected `googleusercontent.com` file sends `Access-Control-Allow-Origin: *`. No proxy.

A sheet with only the header row shows an empty library. Each data row becomes a card (thumbnail and verdict) and a digest page with up to five summary bullets, key steps that open `youtube.com/watch?v=ID&t=SECONDS`, one action item, and flip-card quiz questions.

Parser check: `node learn/csv.test.mjs`
