BLAKE CARD PRICER V3

GitHub repository root must contain:
api/
index.html
package.json
vercel.json

UPDATE YOUR EXISTING REPOSITORY
1. Replace api/match-set.js with the new file.
2. Replace index.html.
3. Replace package.json and vercel.json.
4. Commit changes. Vercel should redeploy automatically.

V3 CHANGES
- TCGplayer market valuation labeled as Near Mint.
- No low-listing price anywhere.
- Better promo and Black Star Promo aliases.
- Uses Rare Candy image set codes as an additional matching signal.
- Searches more candidate sets when set names are ambiguous.
- Improved product-name cleanup and confidence scoring.
- Better handling of Japanese Pokémon catalog sets.
- Top 25 and category/language value summaries.
