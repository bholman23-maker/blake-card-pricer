BLAKE CARD PRICER V5

Replace:
- api/match-set.js
- index.html
- package.json
- vercel.json

V5 TARGETED FIXES
- Vintage Base Set is no longer confused with modern base sets.
- Sword & Shield, Sun & Moon, and Scarlet & Violet base sets are deterministically mapped.
- Pokémon TCG Classic deck cards map to Trading Card Game Classic.
- Japanese SV-P, SM-P, DP-P, BW, and SWSH promo families use collector-prefix routing.
- Hot Air Arena maps to Heat Wave Arena.
- Magic cards can be exact catalog matches when TCGplayer omits collector-number metadata.
- Japanese vintage cards can be exact matches when the catalog omits collector numbers.
- Letter-suffix numbers such as 68a/73 can match the correct base collector number.
- Exact catalog matches with no market price are identified as such instead of being called an uncertain card match.
- New Match Diagnosis column explains name, set, number, and market-price evidence.

VALUATION
- Near Mint TCGplayer market price only.
- No low-listing-price output.
