# Source data provenance

Where the raw source documents behind each dataset came from. Recorded here
rather than relying on live links, since a URL can go dead or its content can
change after the fact - this is a record of what was actually used, as of
when it was used.

## Nave's Topics — `Naves.txt` (tracked in this repo)

Nave's Topical Bible, by Orville J. Nave (1841-1917). Plain-text export from
the [Christian Classics Ethereal Library](http://www.ccel.org) (CCEL) at
Calvin College — the file's own closing lines say so directly: "This
document is from the Christian Classics Ethereal Library at Calvin College,
http://www.ccel.org, generated on demand from ThML source." Public domain
(1897 work, author died 1917).

## Prophecy — `351-Old-Testament-Prophecies-Fulfilled-in-Jesus-Christ.docx` (tracked in this repo)

"351 Old Testament Prophecies Fulfilled in Jesus Christ," obtained from
<https://www.newtestamentchristians.com/bible-study-resources/351-old-testament-prophecies-fulfilled-in-jesus-christ/>.
The docx's own embedded metadata (`docProps/core.xml`) lists the author as
"David Webb," created 2021-05-17 — likely whoever compiled/formatted this
particular table, not necessarily the original list's author.

## BSB Topics & BSB Concordance — not tracked in this repo

Source spreadsheets (`bsb_topical_index.xlsx`, `bsb_concordance.xlsx`) came
from the Berean Bible downloads page: <https://berean.bible/downloads.htm>.
Not checked into the repo (the concordance file alone is ~52MB) - the derived
`data/bsb-topics-with-references.json` and
`data/bsb-concordance-with-references.json` are what the app actually uses
and are already tracked. Re-download from the link above and re-run
`scripts/parse-bsb-topics.js` / `scripts/parse-bsb-concordance.js` if the
source data ever needs to be regenerated.
