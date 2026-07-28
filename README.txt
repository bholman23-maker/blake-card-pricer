BLAKE CARD PRICER V4

Replace these files in the existing GitHub repository:
- api/match-set.js
- index.html
- package.json
- vercel.json

V4 FIXES
- Correctly routes Magic: The Gathering cards to TCGplayer category 1.
- Stronger SWSH, SV, SM, BW, Wizards, and Mega Evolution promo aliases.
- Collector-number matching now handles prefixes such as SWSH050, SM248, BW46, and numeric-only catalog numbers.
- Stronger promo-family scoring using Rare Candy set names and image codes.
- Near Mint TCGplayer market valuation remains the only valuation basis.
- No low-listing-price field.
