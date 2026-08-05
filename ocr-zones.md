# OCR zones

Coordinate format: `(left, top) to (right, bottom)`. Width and height are calculated as `right - left` and `bottom - top`.

These zones were measured on the 2026 calendar image and should be reusable for images with the same dimensions and layout.

| Zone | Coordinates | Width | Height | OCR purpose |
|---|---:|---:|---:|---|
| Quote | `(327, 129) to (1011, 188)` | 684 | 59 | Daily quote |
| Date left | `(7, 199) to (324, 403)` | 317 | 204 | Left date/calendar panel |
| Date right 1 | `(648, 199) to (910, 259)` | 262 | 60 | Upper-right date details |
| Date right 2 | `(648, 271) to (912, 397)` | 264 | 126 | Lower-right date details |
| Events | `(1, 409) to (922, 632)` | 921 | 223 | Festivals and events |
| Jathaka | `(931, 252) to (1318, 865)` | 387 | 613 | Zodiac predictions |
| Bottom table 1 | `(305, 639) to (547, 887)` | 242 | 248 | Panchanga table, left |
| Bottom table 2 | `(553, 636) to (919, 884)` | 366 | 248 | Panchanga table, right |
| Bottom table 3 | `(310, 891) to (919, 925)` | 609 | 34 | Bottom summary row |

## Layout check

- The zones do not overlap.
- `Events` ends at `x=922`; `Jathaka` starts at `x=931`, leaving a 9-pixel gap.
- `Bottom table 1` and `Bottom table 2` are side by side with a 6-pixel gap.
- The bottom summary row begins below the first two bottom-table zones, leaving a small 4–7-pixel gap.
- The maximum coordinates suggest an image approximately `1320 × 925` pixels, but the actual image dimensions should be confirmed before batch processing.

## Suggested OCR modes

- `Quote`, `Date`, and `Events`: `--psm 6`
- `Jathaka`: crop each zodiac row separately if possible; otherwise try `--psm 6` or `--psm 11`
- Bottom tables: OCR each column or row separately with `--psm 6`

## Jathaka row zones

The Jathaka panel spans from `(928, 253)` to `(1318, 867)`. The supplied y-values are treated as row boundaries. Each crop uses an 8-pixel vertical overlap with the adjacent row to avoid cutting off characters.

| Row | Crop coordinates | Width | Height |
|---:|---:|---:|---:|
| 1 | `(928, 253) to (1318, 306)` | 390 | 53 |
| 2 | `(928, 290) to (1318, 368)` | 390 | 78 |
| 3 | `(928, 352) to (1318, 403)` | 390 | 51 |
| 4 | `(928, 387) to (1318, 464)` | 390 | 77 |
| 5 | `(928, 448) to (1318, 513)` | 390 | 65 |
| 6 | `(928, 497) to (1318, 570)` | 390 | 73 |
| 7 | `(928, 554) to (1318, 618)` | 390 | 64 |
| 8 | `(928, 602) to (1318, 675)` | 390 | 73 |
| 9 | `(928, 659) to (1318, 720)` | 390 | 61 |
| 10 | `(928, 704) to (1318, 764)` | 390 | 60 |
| 11 | `(928, 748) to (1318, 828)` | 390 | 80 |
| 12 | `(928, 812) to (1318, 875)` | 390 | 63 |

## Frozen Jathaka OCR settings

- Language: Kannada (`kan`)
- Page segmentation mode: `--psm 13`
- Horizontal crop: `x=928` through `x=1318`
- Vertical row overlap: 8 pixels
- Verified on `05-08-2026`: all 12 rows recognized; only minor punctuation artifacts remained.
