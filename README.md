# kopler-csv-reader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Kopler12/kopler-csv-reader-speed-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Kopler12/kopler-csv-reader-speed-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for make.fun's own **csv-reader 1.0.0**: it reads broken CSV
files and returns exactly the same answer — `{columns, rows, errors}` — for
every input, in much less CPU time. Entry for
[Read broken CSV files faster](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

## What it does

`solve.js` exports `run(input)`, where `input` is `{text, header}`. The text
is read once, left to right:

- A U+FEFF at the very start is dropped.
- A record ends at LF or CRLF; a line left with no characters is no record.
- Outside quotes, a CR not followed by LF is dropped (`stray_cr`).
- A field that opens with a quote runs to the next quote that is not doubled;
  `""` inside it is one quote, and each CRLF or lone CR inside it reads as LF.
  What follows its closing quote, up to the next comma or line break, is
  appended as it stands (`quote_junk`, when the field ends). A quote that
  never closes is a literal character, and the text after it is read again as
  unquoted (`unterminated_quote`). A quote inside an unquoted field is literal.
- Fields stay strings, never trimmed or converted.
- `columns` is the first record when `header` is true, else `null`; `rows`
  holds the records after it, each padded with `""` (`short_row`, with
  `fields`) or cut (`long_row`, with `extra`) to the first record's width.
- Each error is `{code, line, row}`, in the order met; `line` is the 1-based
  line the record starts on, `row` its index in `rows` (`null` for the header).

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

## How it is fast

The reference reads one character at a time and builds every field a
character at a time. This implementation instead:

- keeps a per-record **line-end hint**, so an unquoted field needs only one
  comma scan per field instead of a fresh line-break scan;
- splits whole **clean lines** (no quote, no stray CR) natively at commas in
  one pass;
- reads quoted fields with `indexOf` jumps between quotes, normalising
  embedded line breaks with a single split/join only when one is present;
- never copies a field it can slice, and allocates no per-field objects.

Dependency-free ES module, no I/O, nothing kept from one call to the next.

## Measured speed

On the competition's practice set (6 cases, 10.2M characters of CSV), CPU
time for `run()` over the whole set, median of repeated interleaved runs on
this machine:

| implementation | CPU time |
| --- | --- |
| csv-reader 1.0.0 (house baseline) | ~620 ms |
| this entry | ~130 ms |

About **4.5–5× faster** than the baseline, with byte-identical answers on
every practice case, on 30,000 randomised tricky inputs, on 74 targeted edge
cases, and on 24 full-size files drawn by the competition's own generator.

## Run it

```sh
node main.ts
```

With the practice set, from the kit:

```sh
MAKEFUN_INPUT_DIR=/path/to/practice/input MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

## Licence

MIT — see [LICENSE](LICENSE).
