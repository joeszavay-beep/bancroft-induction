# Weather Widget — Warning Pills Clipped on All Projects View

## Status
Open. Pre-existing on production. Confirmed Sun 17 May 2026.

## Symptom
On /app/home with "All Projects" selected:
- Site Weather widget shows per-project rows
- Warning badges (e.g. "Rain expected", "High wind") get clipped mid-word ("Rain ex...", "Hi...")
- Affects all rows where the pill text exceeds the available right-edge space after the temperature/rain/wind columns

## What we know
- Component: src/components/WeatherWidget.jsx, CompactProjectRow function (~line 228)
- The card has overflow-hidden on the outer container
- Pills use ml-auto to right-align, but get clipped at the card boundary
- WarningPill has whitespace-nowrap (prevents wrapping mid-pill, which is correct)

## What was tried that didn't work
Sun 17 May: applied flex-wrap justify-end to the warning pills container (commit 7ab5dfb). Expected: pills wrap to second line when row is too narrow.

Actual result: pills DID wrap to a second line on rows with multiple warnings, but BOTH lines were still clipped by the card's overflow-hidden. So the fix made some rows visually worse (two clipped badges instead of one) without actually solving the truncation.

REVERTED in commit 435e5c6.

## Real root cause (revised hypothesis)
The card's overflow-hidden + the fixed-width columns (temperature, rain%, wind speed) + the pill's whitespace-nowrap + ml-auto positioning = pills extend beyond the card edge and get clipped.

flex-wrap doesn't help because the clipping is at the parent (card) level, not at the row level.

## What might actually fix it (untested ideas — DO NOT IMPLEMENT)
1. Remove overflow-hidden from the card; let pills overflow into the next row gap (might affect rounded corners)
2. Add right-padding to the row + give the pills a max-width with overflow:hidden text-overflow:ellipsis (would replace clipping with ellipsis, still truncates but cleaner)
3. Shorten the pill text — "Rain" instead of "Rain expected" — to fit consistently
4. Move pills to a second line ALWAYS (not just when narrow) — adds vertical space but no clipping
5. Show pills as just icons with tooltips on hover — saves horizontal space
6. Restructure the row: pills below the temp/rain/wind line instead of beside

## Priority
Low — UI cosmetic, no data impact

## Owner
Round 2. Worth taking longer to think about the right design rather than a CSS patch.
