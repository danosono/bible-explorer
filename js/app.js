const treemapEl = document.getElementById("treemap");
const stateSlider = document.querySelector(".state-slider");
const stateCaptions = document.querySelectorAll(".state-captions span");
const statePill = document.querySelector(".control-pill");
const topicInput = document.getElementById("topic-input");
const topicClearBtn = document.getElementById("topic-clear-btn");
const topicRandomBtn = document.getElementById("topic-random-btn");
const currentTopicEl = document.getElementById("current-topic");
const sourceLabelEl = document.querySelector(".source");
const datasetModeSelect = document.getElementById("dataset-mode");
const topicSearchLabel = document.getElementById("topic-search-label");

// Mobile layout mode — must match the @media (max-width: 899.98px) block in style.css
const MOBILE_LAYOUT_QUERY = window.matchMedia("(max-width: 899.98px)");
const isMobileLayout = () => MOBILE_LAYOUT_QUERY.matches;

// Mobile slide-down menu (hamburger repositions .header-right via CSS below 900px)
const menuToggle = document.getElementById("menu-toggle");
const setMenuOpen = (open) => {
  document.body.classList.toggle("menu-open", open);
  if (menuToggle) menuToggle.setAttribute("aria-expanded", String(open));
};
const closeMobileMenu = () => setMenuOpen(false);
if (menuToggle) {
  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setMenuOpen(!document.body.classList.contains("menu-open"));
  });
  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("menu-open")) return;
    if (e.target.closest("#header-menu") || e.target.closest("#menu-toggle")) return;
    closeMobileMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileMenu();
  });
}

// Global state for topics
let topicsData = {};
let verseCounts = {}; // Book verse counts for percentage calculation
let characterCounts = {}; // Book character counts for proportional Overview sizing
let bibleData = {}; // Bible text data
let bookSummaries = {}; // Book summaries
let selectedTopic = null;
let booksData = [];
let selectedBookId = null;
let selectedReadReference = null;
let preserveSelectedBookForNextRender = false;
let isRenderingStateTransition = false;
let isRestoringHistory = false;
let pinnedLegendGenre = null;
let activeDatasetMode = "topics";
const DEFAULT_TOPIC = "JESUS, THE CHRIST";
const FALLBACK_NAV_TOPIC = "Love";
const FALLBACK_NAV_BOOK = "JHN";
const STORED_TOPIC_KEY = "bibleExplorerTopic";
const STORED_DATASET_KEY = "bibleExplorerDatasetMode";
const topicsIndex = new Map();
let allTopicNames = [];
const MAX_TOPIC_OPTIONS = 200;
const DATASET_CONFIG = {
  topics: {
    file: "data/topics-with-references.json",
    label: "Nave's Topics",
    placeholder: "Search topics",
    defaultTopic: "JESUS, THE CHRIST"
  },
  "bsb-topics": {
    file: "data/bsb-topics-with-references.json",
    label: "BSB Topics",
    placeholder: "Search BSB topics",
    defaultTopic: "Light"
  },
  prophecy: {
    file: "data/prophecy-topics-with-references.json",
    label: "Prophecy",
    placeholder: "Search prophecy references",
    defaultTopic: "[All] OT + NT Combined",
    // Entries are numbered 1-351 - the default 200-item cap (MAX_TOPIC_OPTIONS)
    // cut the list off mid-list with no indication there was more, since
    // unlike the other datasets there's no obviously-truncated alphabetical
    // pattern to hint at it.
    maxOptions: 400
  },
  concordance: {
    file: "data/bsb-concordance-with-references.json",
    label: "BSB Concordance",
    placeholder: "Search words",
    defaultTopic: "Eternal"
  },
  custom: {
    file: "data/custom-topics-with-references.json",
    label: "Custom Dataset",
    placeholder: "Search custom topics",
    defaultTopic: "Jesus is God",
    note: "Custom dataset — from the developer's own study and observations."
  }
};
const PROPHECY_AGGREGATE_TOPICS = [
  { key: "[All] OT Prophecies Made", mode: "ot" },
  { key: "[All] NT Fulfillments", mode: "nt" },
  { key: "[All] OT + NT Combined", mode: "both" }
];
const PROPHECY_OT_PREFIX = "Prophecy (OT):";
const PROPHECY_NT_PREFIX = "Fulfillment (NT):";
// Duplicated verbatim from scripts/parse-bsb-topics.js (same convention as
// the PROPHECY_*_PREFIX constants above, duplicated from parse-prophecy-docx.js).
const BSB_NAVES_SOURCE_TAG = " — Nave's";
const BSB_TORREYS_SOURCE_TAG = " — Torrey's";

const isProphecyAggregateTopic = (name) => {
  return PROPHECY_AGGREGATE_TOPICS.some((item) => item.key === name);
};

const getPreferredTopicFallback = () => {
  if (activeDatasetMode === "prophecy") {
    const firstSpecific = allTopicNames.find((name) => !isProphecyAggregateTopic(name));
    if (firstSpecific) return firstSpecific;
  }
  return allTopicNames[0] || "";
};

// Picks a topic at random from the currently active dataset, skipping the
// synthetic Prophecy "[All] ..." aggregate topics and (when possible)
// avoiding re-picking the topic that's already selected.
const pickRandomTopic = () => {
  const candidates = allTopicNames.filter((name) => !isProphecyAggregateTopic(name));
  if (candidates.length === 0) return null;
  const pool = candidates.length > 1
    ? candidates.filter((name) => name !== selectedTopic)
    : candidates;
  const finalPool = pool.length > 0 ? pool : candidates;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
};

// Resolve a dataset's configured default topic. An empty defaultTopic (e.g.
// Prophecy) means "start blank" rather than falling back to another topic.
const getDatasetDefaultTopic = (mode) => {
  const config = DATASET_CONFIG[mode];
  if (!config) return getPreferredTopicFallback() || null;
  if (config.defaultTopic === "") return null;
  return resolveTopicKey(config.defaultTopic) || getPreferredTopicFallback() || null;
};

const buildAggregateProphecyTopic = (baseTopics, mode, title) => {
  const refsByBook = {};

  Object.entries(baseTopics).forEach(([topicKey, topicData]) => {
    if (isProphecyAggregateTopic(topicKey)) return;
    const topicName = topicData?.name || topicKey;
    const references = topicData?.references || {};

    Object.entries(references).forEach(([bookId, entries]) => {
      if (!Array.isArray(entries) || entries.length === 0) return;
      if (!refsByBook[bookId]) {
        refsByBook[bookId] = new Map();
      }
      const bookMap = refsByBook[bookId];

      entries.forEach((entry) => {
        const subtopics = Array.isArray(entry.subtopics) ? entry.subtopics : [];
        const filteredSubtopics = subtopics.filter((subtopic) => {
          if (mode === "ot") return subtopic.startsWith(PROPHECY_OT_PREFIX);
          if (mode === "nt") return subtopic.startsWith(PROPHECY_NT_PREFIX);
          return subtopic.startsWith(PROPHECY_OT_PREFIX) || subtopic.startsWith(PROPHECY_NT_PREFIX);
        });

        if (filteredSubtopics.length === 0) return;
        const verseKey = Number(entry.verse);
        if (!Number.isFinite(verseKey)) return;

        const existing = bookMap.get(verseKey) || {
          verse: verseKey,
          subtopics: new Set(),
          refs: new Set()
        };

        filteredSubtopics.forEach((subtopic) => {
          existing.subtopics.add(`${topicName} — ${subtopic}`);
        });
        (Array.isArray(entry.refs) ? entry.refs : []).forEach((ref) => {
          existing.refs.add(ref);
        });
        bookMap.set(verseKey, existing);
      });
    });
  });

  const references = {};
  const books = [];
  Object.entries(refsByBook).forEach(([bookId, verseMap]) => {
    const verseList = Array.from(verseMap.values())
      .map((entry) => ({
        verse: entry.verse,
        subtopics: Array.from(entry.subtopics),
        refs: Array.from(entry.refs)
      }))
      .sort((a, b) => a.verse - b.verse);
    if (verseList.length > 0) {
      references[bookId] = verseList;
      books.push(bookId);
    }
  });

  return {
    name: title,
    references,
    books
  };
};

const withProphecyAggregateTopics = (baseTopics) => {
  const enriched = {};
  PROPHECY_AGGREGATE_TOPICS.forEach((item) => {
    enriched[item.key] = buildAggregateProphecyTopic(baseTopics, item.mode, item.key);
  });

  Object.entries(baseTopics).forEach(([key, value]) => {
    enriched[key] = value;
  });

  return enriched;
};

const mergeReferenceKinds = (left, right) => {
  if (!left) return right || null;
  if (!right) return left || null;
  if (left === right) return left;
  return "mixed";
};

const NT_BOOK_IDS = new Set([
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL",
  "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV"
]);

const REF_BOOK_TO_ID = {
  GEN: "GEN", GE: "GEN", GN: "GEN", GENESIS: "GEN",
  EX: "EXO", EXO: "EXO", EXOD: "EXO", EXODUS: "EXO",
  LEV: "LEV", LE: "LEV", LEVITICUS: "LEV",
  NUM: "NUM", NU: "NUM", NUMBERS: "NUM",
  DEU: "DEU", DEUT: "DEU", DEUTERONOMY: "DEU", DT: "DEU",
  JOS: "JOS", JOSH: "JOS", JOSHUA: "JOS",
  JDG: "JDG", JUDG: "JDG", JUDGES: "JDG",
  RUT: "RUT", RUTH: "RUT",
  "1SA": "1SA", "1SAM": "1SA", "1SAMUEL": "1SA",
  "2SA": "2SA", "2SAM": "2SA", "2SAMUEL": "2SA",
  "1KI": "1KI", "1KGS": "1KI", "1KINGS": "1KI",
  "2KI": "2KI", "2KGS": "2KI", "2KINGS": "2KI",
  "1CH": "1CH", "1CHR": "1CH", "1CHRONICLES": "1CH",
  "2CH": "2CH", "2CHR": "2CH", "2CHRONICLES": "2CH",
  EZR: "EZR", EZRA: "EZR",
  NEH: "NEH", NEHEMIAH: "NEH",
  EST: "EST", ESTHER: "EST",
  JOB: "JOB",
  PSA: "PSA", PS: "PSA", PSALM: "PSA", PSALMS: "PSA",
  PRO: "PRO", PROV: "PRO", PROVERBS: "PRO",
  ECC: "ECC", ECCL: "ECC", ECCLESIASTES: "ECC",
  SNG: "SNG", SONG: "SNG", CANT: "SNG", SONGOFSONGS: "SNG",
  ISA: "ISA", ISAIAH: "ISA",
  JER: "JER", JEREMIAH: "JER",
  LAM: "LAM", LAMENTATIONS: "LAM",
  EZK: "EZK", EZEK: "EZK", EZEKIEL: "EZK",
  DAN: "DAN", DANIEL: "DAN",
  HOS: "HOS", HOSEA: "HOS",
  JOL: "JOL", JOEL: "JOL",
  AMO: "AMO", AMOS: "AMO",
  OBA: "OBA", OBAD: "OBA", OBADIAH: "OBA",
  JON: "JON", JONAH: "JON",
  MIC: "MIC", MICAH: "MIC",
  NAM: "NAM", NAH: "NAM", NAHUM: "NAM",
  HAB: "HAB", HABAKKUK: "HAB",
  ZEP: "ZEP", ZEPH: "ZEP", ZEPHANIAH: "ZEP",
  HAG: "HAG", HAGGAI: "HAG",
  ZEC: "ZEC", ZECH: "ZEC", ZECHARIAH: "ZEC",
  MAL: "MAL", MALACHI: "MAL",
  MAT: "MAT", MATT: "MAT", MT: "MAT", MATTHEW: "MAT",
  MRK: "MRK", MARK: "MRK", MK: "MRK", MR: "MRK",
  LUK: "LUK", LUKE: "LUK", LK: "LUK", LU: "LUK",
  JHN: "JHN", JOHN: "JHN", JN: "JHN", JNO: "JHN", JOH: "JHN",
  ACT: "ACT", ACTS: "ACT", AC: "ACT",
  ROM: "ROM", ROMANS: "ROM", RO: "ROM", RM: "ROM",
  "1CO": "1CO", "1COR": "1CO", "1CORINTHIANS": "1CO",
  "2CO": "2CO", "2COR": "2CO", "2CORINTHIANS": "2CO",
  GAL: "GAL", GALATIANS: "GAL",
  EPH: "EPH", EPHESIANS: "EPH",
  PHP: "PHP", PHIL: "PHP", PHILIPPIANS: "PHP",
  COL: "COL", COLOSSIANS: "COL",
  "1TH": "1TH", "1THESS": "1TH", "1THESSALONIANS": "1TH",
  "2TH": "2TH", "2THESS": "2TH", "2THESSALONIANS": "2TH",
  "1TI": "1TI", "1TIM": "1TI", "1TIMOTHY": "1TI",
  "2TI": "2TI", "2TIM": "2TI", "2TIMOTHY": "2TI",
  TIT: "TIT", TITUS: "TIT",
  PHM: "PHM", PHILEMON: "PHM", PHLM: "PHM",
  HEB: "HEB", HEBREWS: "HEB",
  JAS: "JAS", JAMES: "JAS",
  "1PE": "1PE", "1PET": "1PE", "1PETER": "1PE",
  "2PE": "2PE", "2PET": "2PE", "2PETER": "2PE",
  "1JN": "1JN", "1JOHN": "1JN", "1JN": "1JN",
  "2JN": "2JN", "2JOHN": "2JN", "2JN": "2JN",
  "3JN": "3JN", "3JOHN": "3JN", "3JN": "3JN",
  JUD: "JUD", JUDE: "JUD",
  REV: "REV", REVELATION: "REV"
};

const getBookIdFromRef = (ref = "") => {
  const text = String(ref || "").trim();
  if (!text) return null;
  const match = text.match(/^([1-3]?\s*[A-Za-z\.]+(?:\s+[A-Za-z\.]+)*)\s+\d+:\d+/);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, "").replace(/\s+/g, "").toUpperCase();
  return REF_BOOK_TO_ID[normalized] || null;
};

const getReferenceKindFromData = ({ subtopics = [], refs = [], bookId = null } = {}) => {
  const candidateKinds = [];

  if (bookId) {
    candidateKinds.push(NT_BOOK_IDS.has(bookId) ? "nt" : "ot");
  }

  const refValues = Array.isArray(refs) ? refs : [];
  refValues.forEach((ref) => {
    const refBookId = getBookIdFromRef(ref);
    if (!refBookId) return;
    candidateKinds.push(NT_BOOK_IDS.has(refBookId) ? "nt" : "ot");
  });

  const subtopicValues = Array.isArray(subtopics)
    ? subtopics
    : String(subtopics || "").split(";").map((value) => value.trim()).filter(Boolean);

  const hasOTLabel = subtopicValues.some((value) => String(value).startsWith(PROPHECY_OT_PREFIX));
  const hasNTLabel = subtopicValues.some((value) => String(value).startsWith(PROPHECY_NT_PREFIX));
  if (hasOTLabel) candidateKinds.push("ot");
  if (hasNTLabel) candidateKinds.push("nt");

  const hasOT = candidateKinds.includes("ot");
  const hasNT = candidateKinds.includes("nt");
  if (hasOT && hasNT) return "mixed";
  if (hasOT) return "ot";
  if (hasNT) return "nt";
  return null;
};

const applyReferenceKindClass = (element, baseClassName, kind) => {
  if (!element || !baseClassName || !kind) return;
  element.classList.add(`${baseClassName}--${kind}`);
};

// Tracks "a pin-line inside this card is hovered" via a JS-toggled class
// rather than a live :has(.pin-line:hover) CSS selector (see the
// .pin-line-hover-active comment in css/style.css for why) - removal is
// debounced so ordinary mouse jitter at a tiny line's hit-area edge doesn't
// rapidly toggle the class on and off.
const markCardPinLineHover = (card) => {
  if (!card) return;
  if (card._pinLineHoverResetTimer) {
    clearTimeout(card._pinLineHoverResetTimer);
    card._pinLineHoverResetTimer = null;
  }
  card.classList.add("pin-line-hover-active");
};

const clearCardPinLineHoverSoon = (card) => {
  if (!card) return;
  card._pinLineHoverResetTimer = setTimeout(() => {
    card.classList.remove("pin-line-hover-active");
    card._pinLineHoverResetTimer = null;
  }, 120);
};

// The Prophecy dataset's "[All] ..." aggregate topics (PROPHECY_AGGREGATE_TOPICS)
// merge every real prophecy topic together, prefixing each subtopic string
// "RealTopicName — Prophecy (OT): ..." (see buildAggregateProphecyTopic). To
// find a verse's OT/NT counterpart while viewing an aggregate topic, recover
// the real topic name from that prefix so the lookup can use the real
// topic's own reference list instead of the aggregate's mixed-together one.
const resolveRealProphecyTopicName = (topicName, subtopicText) => {
  if (!isProphecyAggregateTopic(topicName)) return topicName;
  const first = String(subtopicText || "").split(";")[0].trim();
  const idx = first.indexOf(" — ");
  return idx === -1 ? null : first.slice(0, idx).trim();
};

// Prophecy topic keys are "N. <name>" (see scripts/parse-prophecy-docx.js),
// but showVerseModal/renderReadView only carry the topic's plain `.name`
// (no index prefix) - so a lookup by key alone misses. Fall back to scanning
// by `.name` field; this also covers datasets where key === name already.
const findTopicDataByName = (name) => {
  if (!name) return null;
  if (topicsData[name]) return topicsData[name];
  return Object.values(topicsData).find((entry) => entry && entry.name === name) || null;
};

// Returns reference strings for the "opposite side" (OT<->NT) verse(s)
// sharing this verse's real prophecy topic - e.g. an OT verse's icon reveals
// its NT fulfillment ref(s), and vice versa. No counterpart is resolved for
// "mixed" verses, since both sides are already shown there.
const getProphecyCounterpartRefs = (topicName, kind) => {
  if (!topicName || (kind !== "ot" && kind !== "nt")) return [];
  const topicData = findTopicDataByName(topicName);
  if (!topicData || !topicData.references) return [];
  const opposite = kind === "ot" ? "nt" : "ot";
  const refs = new Set();
  Object.entries(topicData.references).forEach(([entryBookId, entries]) => {
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const entryKind = getReferenceKindFromData({
        subtopics: entry.subtopics,
        refs: entry.refs,
        bookId: entryBookId
      });
      if (entryKind === opposite || entryKind === "mixed") {
        (Array.isArray(entry.refs) ? entry.refs : []).forEach((ref) => refs.add(ref));
      }
    });
  });
  return Array.from(refs);
};

// Builds the OT/NT counterpart tooltip text, pairing each counterpart
// reference with its verse text (when resolvable) so the hint is useful
// without needing to open the verse detail popup separately.
const buildCounterpartTooltipText = (label, refs) => {
  const lines = refs.map((ref) => {
    const bookId = getBookIdFromRef(ref);
    const parsed = parseChapterVerse(ref);
    const verseText = bookId && parsed ? getVerseText(bookId, parsed.chapter, parsed.verse) : null;
    return verseText ? `${ref} — ${verseText}` : ref;
  });
  return `${label}:\n${lines.join("\n")}`;
};

// Map a verse-range's verse count to a flex-basis percentage, implementing a
// 4-columns-per-row pin-line layout (1/2/3/4 quarter-slots).
const getPinLineWidthPercent = (verseCount) => {
  if (verseCount <= 1) return 25;
  if (verseCount <= 3) return 50;
  if (verseCount <= 6) return 75;
  return 100;
};

// Number of vertical "bands" pin-lines are grouped into, so a reference's
// position within a card reflects its position within the book/chapter.
const PIN_LINE_BANDS = 8;

// Map a 0-100 position percentage to a band index (0..PIN_LINE_BANDS-1).
const getPinLineBandIndex = (percentage) =>
  Math.min(PIN_LINE_BANDS - 1, Math.max(0, Math.floor((percentage / 100) * PIN_LINE_BANDS)));

// Approximate budget for how many of the PIN_LINE_BANDS bands can actually
// be populated and stay usable on a given card height, before .pin-line-band's
// overflow:hidden starts clipping them - see the .pin-lines/.pin-line-band
// CSS this mirrors (css/style.css). Deliberately approximate (a fixed
// overhead rather than exactly matching every density/viewport variant) -
// being off by a band just shifts the clustering threshold slightly, which
// isn't a correctness issue here.
const PIN_LINES_VERTICAL_OVERHEAD = 42; // ~top(32) + bottom(10)
const PIN_LINE_BAND_GAP = 1; // .pin-lines gap
const PIN_LINE_MIN_USABLE_HEIGHT = 8; // matches .pin-line height

const getMaxPopulatedPinLineBands = (cardHeight) => Math.max(1, Math.floor(
  (cardHeight - PIN_LINES_VERTICAL_OVERHEAD - (PIN_LINE_BANDS - 1) * PIN_LINE_BAND_GAP) / PIN_LINE_MIN_USABLE_HEIGHT
));

// Repeatedly merges the two position-adjacent groups with the smallest
// percentage gap (simple 1-D nearest-neighbor agglomeration) until at most
// maxGroups remain. Used only when a card doesn't have room to show every
// distinct verse-reference position as its own pin-line - merges verses
// that are already close together, so "all near the end of the book"
// converges toward one line near the end, weighted by how many verses are
// on each side.
const clusterPinLineGroups = (groups, maxGroups) => {
  const clusters = groups.map((g) => ({ percentage: g.percentage, verses: g.verses, isCluster: false }));
  while (clusters.length > maxGroups) {
    let minGap = Infinity;
    let minIndex = 0;
    for (let i = 0; i < clusters.length - 1; i += 1) {
      const gap = clusters[i + 1].percentage - clusters[i].percentage;
      if (gap < minGap) {
        minGap = gap;
        minIndex = i;
      }
    }
    const a = clusters[minIndex];
    const b = clusters[minIndex + 1];
    const aCount = a.verses.length;
    const bCount = b.verses.length;
    const mergedPercentage = (a.percentage * aCount + b.percentage * bCount) / (aCount + bCount);
    clusters.splice(minIndex, 2, {
      percentage: mergedPercentage,
      verses: [...a.verses, ...b.verses],
      isCluster: true
    });
  }
  return clusters;
};

// Shared by renderTreemap (Overview state) and renderBookView (Book state):
// turns a book/chapter's versePositions into PIN_LINE_BANDS bands of
// "line group" descriptors ({ verses, isCluster }), adaptively clustering
// nearby groups together when the card doesn't have room to show every
// position as its own hoverable line. `getPositionValue(vp)` returns the
// integer used for the adjacent-verse merge step (absoluteVerse for
// Overview, verse for Book state - the two states number positions
// differently, everything else about the pipeline is identical).
const buildPinLineGroups = (versePositions, cardHeight, getPositionValue) => {
  const verseRanges = [];
  let currentRange = null;
  versePositions.forEach((vp) => {
    const positionValue = getPositionValue(vp);
    if (!currentRange || positionValue > currentRange.endPosition + 1) {
      if (currentRange) verseRanges.push(currentRange);
      currentRange = { endPosition: positionValue, verses: [vp] };
    } else {
      currentRange.endPosition = positionValue;
      currentRange.verses.push(vp);
    }
  });
  if (currentRange) verseRanges.push(currentRange);

  let groups = verseRanges.map((range) => ({
    percentage: (range.verses[0].percentage + range.verses[range.verses.length - 1].percentage) / 2,
    verses: range.verses,
    isCluster: false
  }));

  const populatedBandCount = new Set(groups.map((g) => getPinLineBandIndex(g.percentage))).size;
  const maxPopulatedBands = getMaxPopulatedPinLineBands(cardHeight);
  if (populatedBandCount > maxPopulatedBands) {
    groups = clusterPinLineGroups(groups, maxPopulatedBands);
  }

  const bands = Array.from({ length: PIN_LINE_BANDS }, () => []);
  groups.forEach((group) => {
    bands[getPinLineBandIndex(group.percentage)].push(group);
  });
  return bands;
};

// Verse text caching and tooltip management
let verseTextCache = {};
let currentTooltip = null;

const getVerseText = (bookId, chapter, verse) => {
  if (!bibleData[bookId]) return null;
  const cacheKey = `${bookId}-${chapter}-${verse}`;
  if (verseTextCache[cacheKey]) {
    return verseTextCache[cacheKey];
  }
  
  const book = bibleData[bookId];
  if (!book.chapters || !book.chapters[chapter - 1]) return null;
  
  const chapterData = book.chapters[chapter - 1];
  if (!chapterData.verses || !Array.isArray(chapterData.verses)) return null;
  const verseEntry = chapterData.verses.find((entry) => Number(entry.n ?? entry.number) === Number(verse));
  if (!verseEntry) return null;

  const verseText = verseEntry.text;
  verseTextCache[cacheKey] = verseText;
  return verseText;
};

const positionTooltip = (tooltip, e) => {
  let x = e.clientX + 20;
  let y = e.clientY + 20;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;

  // Keep on screen
  if (x + tw > window.innerWidth) x = e.clientX - tw - 20;
  if (y + th > window.innerHeight) y = e.clientY - th - 20;
  if (x < 0) x = 10;
  if (y < 0) y = 10;

  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
  tooltip.classList.add('show');
};

const updateTooltipPosition = (e) => {
  if (!currentTooltip) return;
  positionTooltip(currentTooltip, e);
};

const showTooltip = (e, refText, subtopicText, bookId, verseNumber) => {
  // Touch devices have no hover; a tap would leave the tooltip stuck open.
  if (window.matchMedia("(hover: none)").matches) return;
  // Build text
  let text = refText;
  if (subtopicText) {
    text += ` (${subtopicText})`;
  }

  const parseRangeFromRefText = (value) => {
    if (!value) return null;
    const dashMatch = value.match(/(\d+):(\d+)\s*-\s*(\d+)(?!:)/);
    if (dashMatch) {
      const chapter = parseInt(dashMatch[1], 10);
      const startVerse = parseInt(dashMatch[2], 10);
      const endVerse = parseInt(dashMatch[3], 10);
      return {
        startChapter: chapter,
        endChapter: chapter,
        startVerse,
        endVerse
      };
    }

    const matches = [...value.matchAll(/(\d+):(\d+)/g)];
    if (matches.length >= 1) {
      const first = matches[0];
      const last = matches[matches.length - 1];
      return {
        startChapter: parseInt(first[1], 10),
        startVerse: parseInt(first[2], 10),
        endChapter: parseInt(last[1], 10),
        endVerse: parseInt(last[2], 10)
      };
    }

    return null;
  };

  // Parse refText to extract chapter and verse (e.g., "Acts 15:16")
  const range = parseRangeFromRefText(refText);
  if (range) {
    const { startChapter, endChapter, startVerse, endVerse } = range;
    if (startChapter === endChapter && Number.isFinite(startVerse) && Number.isFinite(endVerse)) {
      const lines = [];
      const step = startVerse <= endVerse ? 1 : -1;
      for (let v = startVerse; step > 0 ? v <= endVerse : v >= endVerse; v += step) {
        const verseText = getVerseText(bookId, startChapter, v);
        if (verseText) {
          lines.push(`${startChapter}:${v} — ${verseText}`);
        }
      }
      if (lines.length > 0) {
        text += `\n${lines.join("\n")}`;
      }
    } else {
      const verseText = getVerseText(bookId, startChapter, startVerse);
      if (verseText) {
        text += `\n${verseText}`;
      }
    }
  }

  text += "\nClick to view full range";

  if (currentTooltip && currentTooltip.dataset.content === text) {
    positionTooltip(currentTooltip, e);
    return;
  }

  if (currentTooltip) currentTooltip.remove();

  // Create tooltip element
  const tooltip = document.createElement('tip');
  tooltip.textContent = text;
  tooltip.dataset.content = text;
  document.body.appendChild(tooltip);
  currentTooltip = tooltip;

  requestAnimationFrame(() => {
    positionTooltip(tooltip, e);
  });
};

// A lighter tooltip than showTooltip() - no ref-text parsing, no verse-preview
// lookup, no "Click to view full range" suffix. Used for hints that are just
// a fixed line of text (e.g. the Prophecy OT/NT counterpart icon).
const showPlainTooltip = (e, text) => {
  if (window.matchMedia("(hover: none)").matches) return;
  if (currentTooltip && currentTooltip.dataset.content === text) {
    positionTooltip(currentTooltip, e);
    return;
  }
  if (currentTooltip) currentTooltip.remove();

  const tooltip = document.createElement('tip');
  tooltip.textContent = text;
  tooltip.dataset.content = text;
  document.body.appendChild(tooltip);
  currentTooltip = tooltip;

  requestAnimationFrame(() => {
    positionTooltip(tooltip, e);
  });
};

const hideTooltip = () => {
  if (currentTooltip) {
    currentTooltip.classList.remove('show');
    setTimeout(() => {
      if (currentTooltip) currentTooltip.remove();
      currentTooltip = null;
    }, 150);
  }
};

const normalizeTopicKey = (value) => String(value || "").trim().toLowerCase();

const resolveTopicKey = (value) => {
  const normalized = normalizeTopicKey(value);
  return topicsIndex.get(normalized) || null;
};

const getCurrentState = () => Number(stateSlider?.value) || 1;

const updateStateUI = (stateValue = getCurrentState()) => {
  if (statePill) {
    statePill.innerHTML = "<strong>State</strong> " + stateNames[stateValue];
  }
  document.body.dataset.state = String(stateValue);
  updateTopicActionState(stateValue);
};

const setSourceLabel = (text) => {
  if (!sourceLabelEl) return;
  sourceLabelEl.textContent = text || "Berean Standard Bible";
};

const clearLegendActive = () => {
  document.querySelectorAll(".legend-genre.active").forEach((node) => {
    node.classList.remove("active");
  });
};

const setPinnedLegendGenre = (genre = null) => {
  pinnedLegendGenre = genre || null;
  clearLegendActive();
  if (!pinnedLegendGenre) return;
  const legendItem = document.querySelector(`.legend-genre[data-genre="${pinnedLegendGenre}"]`);
  if (legendItem) {
    legendItem.classList.add("active");
  }
};

const getBookOrderIndex = (bookId) => {
  const orderIndex = BOOK_ORDER.indexOf(bookId);
  if (orderIndex >= 0) return orderIndex;
  return 0;
};

const getAdjacentBookId = (bookId, direction = 1) => {
  const total = BOOK_ORDER.length;
  if (total === 0) return bookId;
  const currentIndex = getBookOrderIndex(bookId);
  const nextIndex = (currentIndex + direction + total) % total;
  return BOOK_ORDER[nextIndex] || bookId;
};

const openBookInState2 = (bookId) => {
  if (!bookId) return;
  selectedBookId = bookId;
  selectedReadReference = null;
  preserveSelectedBookForNextRender = true;
  isRenderingStateTransition = true;
  setState(2);
};

const openChapterInState3 = (bookId, chapterNumber, verseNumber = 1) => {
  const book = bibleData[bookId];
  const bookName = BOOK_NAMES[bookId] || book?.name || bookId;
  selectedBookId = bookId;
  selectedReadReference = {
    refText: `${bookName} ${chapterNumber}:${verseNumber}`,
    chapter: chapterNumber,
    verse: verseNumber
  };
  preserveSelectedBookForNextRender = true;
  isRenderingStateTransition = true;
  setState(3);
};

const resolveNavigationTopic = () => {
  if (selectedTopic && topicsData[selectedTopic]) {
    return selectedTopic;
  }

  // Only auto-assign fallback topic in Overview state (state 1)
  // In Book/Verse views (states 2-3), allow empty topic selection
  const stateValue = getCurrentState();
  if (stateValue !== 1) {
    return null;
  }

  const resolvedFallback = resolveTopicKey(FALLBACK_NAV_TOPIC)
    || resolveTopicKey(DEFAULT_TOPIC)
    || Object.keys(topicsData || {})[0]
    || null;

  if (resolvedFallback) {
    selectedTopic = resolvedFallback;
    if (topicInput) {
      topicInput.value = resolvedFallback;
    }
    setStoredTopic(resolvedFallback);
    updateCurrentTopicLabel();
  }

  return resolvedFallback;
};

const getOrderedReferencedBookIds = (topicName) => {
  const references = topicName && topicsData[topicName] && topicsData[topicName].references
    ? topicsData[topicName].references
    : {};

  const ordered = [];
  const seen = new Set();

  BOOK_ORDER.forEach((bookId) => {
    const entries = references[bookId];
    if (Array.isArray(entries) && entries.length > 0) {
      ordered.push(bookId);
      seen.add(bookId);
    }
  });

  Object.keys(references).forEach((bookId) => {
    if (seen.has(bookId)) return;
    const entries = references[bookId];
    if (Array.isArray(entries) && entries.length > 0) {
      ordered.push(bookId);
      seen.add(bookId);
    }
  });

  return ordered;
};

const getFirstReferenceForBook = (topicName, bookId) => {
  const entries = topicName && topicsData[topicName] && topicsData[topicName].references
    ? topicsData[topicName].references[bookId]
    : null;

  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const normalized = entries
    .map((entry) => {
      const refs = Array.isArray(entry.refs) ? entry.refs : [];
      const refText = refs[0] || "";
      const parsed = parseChapterVerse(refText);
      const chapter = parsed?.chapter || entry.chapter || null;
      const verse = parsed?.verse || entry.verse || null;
      if (!chapter || !verse) return null;
      const absoluteVerse = getAbsoluteVerseIndex(bookId, chapter, verse) || Number.POSITIVE_INFINITY;
      return {
        refText,
        chapter,
        verse,
        absoluteVerse
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.absoluteVerse - b.absoluteVerse);

  return normalized[0] || null;
};

const ensureNavigationContext = (stateValue) => {
  if (stateValue < 2) {
    return;
  }

  const topicName = resolveNavigationTopic();
  const referencedBookIds = getOrderedReferencedBookIds(topicName);
  const fallbackBookId = referencedBookIds[0] || FALLBACK_NAV_BOOK;
  const shouldPreserveSelectedBook = preserveSelectedBookForNextRender;
  console.log('[ensureNavigationContext] shouldPreserveSelectedBook:', shouldPreserveSelectedBook, 'selectedBookId:', selectedBookId);
  preserveSelectedBookForNextRender = false;

  if (!shouldPreserveSelectedBook) {
    if (!selectedBookId || !referencedBookIds.includes(selectedBookId)) {
      console.log('[ensureNavigationContext] Slider case - setting fallback:', fallbackBookId);
      selectedBookId = fallbackBookId;
    }
  } else {
    console.log('[ensureNavigationContext] Book click case - preserving:', selectedBookId);
    if (!selectedBookId) {
      selectedBookId = fallbackBookId;
    }
  }

  if (stateValue === 3) {
    // Only set a fallback reference if we don't already have one
    if (!selectedReadReference) {
      const preferredRef = getFirstReferenceForBook(topicName, selectedBookId)
        || getFirstReferenceForBook(topicName, fallbackBookId)
        || null;
      selectedReadReference = preferredRef;
    }
  }
};

const updateStateIndicator = (state) => {
  const indicator = document.getElementById('state-indicator');
  if (!indicator) return;
  const labels = {
    1: 'Bible View',
    2: 'Book View',
    3: 'Verse View'
  };
  indicator.textContent = labels[state] || 'Bible View';
};

const renderCurrentState = () => {
  const stateValue = getCurrentState();
  updateStateIndicator(stateValue);
  if (stateValue === 1) {
    isRenderingStateTransition = false;
    renderTreemap(booksData, selectedTopic);
    return;
  }
  if (!isRenderingStateTransition) {
    ensureNavigationContext(stateValue);
  }
  isRenderingStateTransition = false;
  if (stateValue === 2) {
    renderBookView(selectedBookId, selectedTopic);
    return;
  }
  renderReadView(selectedBookId, selectedTopic);
};

const setState = (nextState) => {
  const stateValue = Number(nextState) || 1;
  if (stateSlider) {
    stateSlider.value = String(stateValue);
  }
  updateStateUI(stateValue);
  renderCurrentState();
  // Push after the render so ensureNavigationContext has already resolved
  // any fallback book/verse into the URL. Re-selecting the current state is
  // deduped inside syncHistory (identical URL -> no entry).
  syncHistory({ push: true });
};

const NO_TOPIC_SELECTED_TEXT = "No Topic Selected";

// Dataset before topic (not just the topic name) so mobile - where the
// dataset dropdown itself is hidden off-canvas - can still tell which
// dataset is active from this label alone.
const getCurrentTopicDisplayText = () => {
  const config = DATASET_CONFIG[activeDatasetMode] || DATASET_CONFIG.topics;
  const topicText = selectedTopic || NO_TOPIC_SELECTED_TEXT;
  return `${config.label} • ${topicText}`;
};

// Shrinks an element's width, then its font-size, until its text fits
// without overlapping the next header sibling and without relying on
// ellipsis to truncate it. Resets both overrides to the CSS default
// first, so a later, shorter string isn't left artificially shrunk from
// a previous call.
const fitTextToWidth = (el, { minScale = 0.6 } = {}) => {
  if (!el) return;
  el.style.width = "";
  el.style.fontSize = "";

  // .state-current-topic sits in a CSS Grid auto-track. Verified
  // empirically: that track's boundary doesn't reliably shrink to match
  // the element's own current rendered width (whether that's narrowed via
  // font-size or max-width) - it can stay wide enough that a neighboring
  // 1fr sibling (.state-meta, justify-self: end) ends up positioned
  // *before* this element's own right edge, i.e. a visual overlap that
  // persists no matter how small this element's own box claims to be.
  // A single analytical "available space" calculation isn't reliable
  // either (also verified empirically - sibling widths measured up front
  // don't always predict the real boundary). So: measure the actual gap
  // to the next sibling directly and iteratively shrink an explicit
  // `width` (not max-width - only an explicit width reliably narrows this
  // track) until it's verified non-overlapping, then shrink font-size to
  // fit the text within that now-correct box.
  const header = el.closest(".state-header");
  const nextSibling = header && Array.from(header.children).includes(el) ? el.nextElementSibling : null;
  if (nextSibling) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const elRect = el.getBoundingClientRect();
      const overflowPx = elRect.right - nextSibling.getBoundingClientRect().left;
      if (overflowPx <= 0) break;
      const newWidth = elRect.width - overflowPx - 4;
      if (newWidth < 20) {
        el.style.width = "20px";
        break;
      }
      el.style.width = `${newWidth}px`;
    }
  }

  if (el.scrollWidth <= el.clientWidth) return;
  const naturalFontSize = parseFloat(getComputedStyle(el).fontSize);
  const minFontSize = naturalFontSize * minScale;
  const scale = Math.max(minScale, el.clientWidth / el.scrollWidth);
  el.style.fontSize = `${Math.max(minFontSize, naturalFontSize * scale)}px`;

  // One re-check/nudge in case the linear estimate wasn't quite enough
  // (e.g. letter-spacing rounding).
  if (el.scrollWidth > el.clientWidth) {
    const currentFontSize = parseFloat(el.style.fontSize);
    const refinedFontSize = Math.max(minFontSize, currentFontSize * (el.clientWidth / el.scrollWidth));
    el.style.fontSize = `${refinedFontSize}px`;
  }
};

const updateCurrentTopicLabel = () => {
  if (!currentTopicEl) return;
  const label = getCurrentTopicDisplayText();
  currentTopicEl.textContent = label;
  currentTopicEl.title = label;
  fitTextToWidth(currentTopicEl);
};

const getStoredTopic = () => {
  try {
    return localStorage.getItem(STORED_TOPIC_KEY);
  } catch (error) {
    return null;
  }
};

const getStoredDatasetMode = () => {
  try {
    return localStorage.getItem(STORED_DATASET_KEY);
  } catch (error) {
    return null;
  }
};

const setStoredDatasetMode = (mode) => {
  try {
    localStorage.setItem(STORED_DATASET_KEY, mode);
  } catch (error) {
    // Ignore storage failures.
  }
};

// Serializes the full app position into the URL: ?dataset=&topic= plus
// &state=&book= (states 2-3) and &ch=&v= (state 3). State 1 carries no nav
// params so the root URL stays clean and shareable.
const buildStateUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("dataset", activeDatasetMode);
  if (selectedTopic) {
    url.searchParams.set("topic", selectedTopic);
  } else {
    url.searchParams.delete("topic");
  }

  const stateValue = getCurrentState();
  if (stateValue >= 2 && selectedBookId) {
    url.searchParams.set("state", String(stateValue));
    url.searchParams.set("book", selectedBookId);
  } else {
    url.searchParams.delete("state");
    url.searchParams.delete("book");
  }
  if (stateValue === 3 && selectedReadReference) {
    url.searchParams.set("ch", String(selectedReadReference.chapter));
    url.searchParams.set("v", String(selectedReadReference.verse));
  } else {
    url.searchParams.delete("ch");
    url.searchParams.delete("v");
  }
  return url;
};

// push: state/book/chapter transitions (browser back/forward retraces them).
// replace: topic/dataset changes and in-chapter verse hops (no history spam).
const syncHistory = ({ push = false } = {}) => {
  if (isRestoringHistory) return;
  try {
    const url = buildStateUrl();
    if (url.href === window.location.href) return;
    if (push) {
      history.pushState(null, "", url);
    } else {
      history.replaceState(null, "", url);
    }
  } catch (error) {
    // Ignore - URL sync is best-effort and shouldn't break navigation.
  }
};

// Reads &state=&book=&ch=&v= back out of a URL, validating against loaded
// data so a bad deep link degrades to the Overview instead of a blank view.
const parseUrlNavState = (params) => {
  const stateParam = Number(params.get("state"));
  let stateValue = stateParam === 2 || stateParam === 3 ? stateParam : 1;
  const rawBook = params.get("book");
  const bookId = rawBook && (bibleData[rawBook] || BOOK_NAMES[rawBook]) ? rawBook : null;
  if (stateValue >= 2 && !bookId) {
    stateValue = 1;
  }
  let readRef = null;
  if (stateValue === 3) {
    const book = bibleData[bookId];
    const chapterCount = Array.isArray(book?.chapters) ? book.chapters.length : 0;
    let chapter = Number(params.get("ch"));
    let verse = Number(params.get("v"));
    chapter = Number.isFinite(chapter) && chapter >= 1 ? Math.floor(chapter) : 1;
    if (chapterCount > 0) {
      chapter = Math.min(chapter, chapterCount);
    }
    verse = Number.isFinite(verse) && verse >= 1 ? Math.floor(verse) : 1;
    // BOOK_NAMES first: bible.json's per-book "name" field is a parsing
    // artifact ("- Berean Standard Bible"), same ordering as renderReadView.
    const bookName = BOOK_NAMES[bookId] || book?.name || bookId;
    readRef = { refText: `${bookName} ${chapter}:${verse}`, chapter, verse };
  }
  return { stateValue, bookId, readRef };
};

// Applies a parsed URL position to the app (popstate + boot deep links).
// Callers set isRestoringHistory around this so the renders it triggers
// can't push new entries mid-restore.
const applyUrlNavState = (params) => {
  const { stateValue, bookId, readRef } = parseUrlNavState(params);
  if (stateValue >= 2) {
    selectedBookId = bookId;
    selectedReadReference = readRef;
    preserveSelectedBookForNextRender = true;
    isRenderingStateTransition = true;
  } else {
    selectedReadReference = null;
  }
  if (stateSlider) {
    stateSlider.value = String(stateValue);
  }
  updateStateUI(stateValue);
  renderCurrentState();
};

const updateDatasetUI = () => {
  const config = DATASET_CONFIG[activeDatasetMode] || DATASET_CONFIG.topics;
  if (topicSearchLabel) {
    topicSearchLabel.textContent = config.label;
    if (config.note) {
      topicSearchLabel.title = config.note;
    } else {
      topicSearchLabel.removeAttribute("title");
    }
  }
  if (topicInput) {
    topicInput.placeholder = config.placeholder;
  }
};

const parseChapterVerse = (refText) => {
  if (!refText) return null;
  const match = refText.match(/(\d+):(\d+)/);
  if (!match) return null;
  return {
    chapter: parseInt(match[1], 10),
    verse: parseInt(match[2], 10)
  };
};

const getAbsoluteVerseIndex = (bookId, chapterNumber, verseNumber) => {
  const book = bibleData[bookId];
  if (!book || !Array.isArray(book.chapters) || !chapterNumber || !verseNumber) return null;
  let total = 0;
  const limit = Math.min(chapterNumber - 1, book.chapters.length);
  for (let i = 0; i < limit; i += 1) {
    const chapter = book.chapters[i];
    const count = Number(chapter.verseCount) || (Array.isArray(chapter.verses) ? chapter.verses.length : 0);
    total += count;
  }

  const chapterData = book.chapters[chapterNumber - 1];
  if (chapterData && Array.isArray(chapterData.verses)) {
    const idx = chapterData.verses.findIndex((entry) => Number(entry.n ?? entry.number) === Number(verseNumber));
    if (idx >= 0) {
      return total + idx + 1;
    }
  }

  return total + verseNumber;
};

const getBookVerseTotal = (bookId) => {
  const book = bibleData[bookId];
  if (!book || !Array.isArray(book.chapters)) return null;
  return book.chapters.reduce((sum, chapter) => {
    const count = Number(chapter.verseCount) || (Array.isArray(chapter.verses) ? chapter.verses.length : 0);
    return sum + count;
  }, 0);
};

const setStoredTopic = (topicName) => {
  try {
    if (topicName) {
      localStorage.setItem(STORED_TOPIC_KEY, topicName);
    } else {
      localStorage.removeItem(STORED_TOPIC_KEY);
    }
  } catch (error) {
    // Ignore storage failures; topic will not persist across refresh.
  }
};

const updateTopicActionState = () => {
  if (topicClearBtn) {
    topicClearBtn.hidden = !selectedTopic;
  }
  if (topicRandomBtn) {
    const hasEligibleTopics = allTopicNames.some((name) => !isProphecyAggregateTopic(name));
    topicRandomBtn.disabled = !hasEligibleTopics;
  }
};

const applyTopicSelection = (topicName, options = {}) => {
  const { commit = false } = options;
  const resolved = resolveTopicKey(topicName);
  const normalizedInput = normalizeTopicKey(topicName);
  const isExactMatch = resolved && normalizeTopicKey(resolved) === normalizedInput;

  if (!normalizedInput) {
    selectedTopic = null;
  } else if (commit || isExactMatch) {
    selectedTopic = resolved && topicsData[resolved] ? resolved : null;
  }

  if (topicInput && commit) {
    topicInput.value = selectedTopic || "";
  }

  // Typing out a topic's exact name (without pressing Enter or picking a
  // suggestion) never calls this with commit:true - only the "input" event
  // does, uncommitted. isExactMatch is how that case still persists/syncs
  // immediately instead of waiting for blur.
  if (commit || isExactMatch) {
    setStoredTopic(selectedTopic);
  }

  // Update the header label BEFORE rendering, not after - otherwise the
  // treemap sizes itself against the header's old (possibly shorter)
  // height, then the label grows the header a moment later, which trips
  // the #treemap ResizeObserver into a visible second, shrinking re-render.
  updateCurrentTopicLabel();

  // Only re-render during typing in Overview (state 1) and Book (state 2)
  // For Verse view (state 3), wait for commit to avoid scroll jumping
  const currentState = getCurrentState();
  if (commit || currentState <= 2) {
    renderCurrentState();
  }

  // Sync after the render: in states 2-3 the render can swap selectedBookId
  // to a fallback, and the URL must reflect what actually got drawn.
  if (commit || isExactMatch) {
    syncHistory();
  }

  updateTopicActionState();
};

const getTopicOptions = (filterValue) => {
  const maxOptions = DATASET_CONFIG[activeDatasetMode]?.maxOptions || MAX_TOPIC_OPTIONS;
  const normalized = normalizeTopicKey(filterValue);
  if (!normalized) {
    return allTopicNames.slice(0, maxOptions);
  }
  const startsWithMatches = [];
  const containsMatches = [];
  for (const name of allTopicNames) {
    const candidate = normalizeTopicKey(name);
    if (candidate.startsWith(normalized)) {
      startsWithMatches.push(name);
    } else if (candidate.includes(normalized)) {
      containsMatches.push(name);
    }
    if (startsWithMatches.length >= maxOptions) break;
  }
  if (startsWithMatches.length >= maxOptions) {
    return startsWithMatches.slice(0, maxOptions);
  }
  const combined = startsWithMatches.concat(containsMatches);
  if (combined.length > maxOptions) {
    return combined.slice(0, maxOptions);
  }
  return combined;
};

// Custom suggestion dropdown, replacing the native <input list> + <datalist>
// combo. Native datalist autocomplete is unreliable on mobile - iOS Safari
// doesn't render its popup at all, and Android Chrome doesn't reliably
// re-filter it as the underlying <option> list is mutated on each keystroke.
// This renders/filters/positions the list ourselves so behavior is identical
// on desktop and mobile.
let topicSuggestionNames = [];
let topicSuggestionActiveIndex = -1;

const getTopicSuggestionsList = () => document.getElementById("topic-suggestions");

const hideTopicSuggestions = () => {
  const list = getTopicSuggestionsList();
  if (list) {
    list.hidden = true;
    list.innerHTML = "";
  }
  topicSuggestionNames = [];
  topicSuggestionActiveIndex = -1;
  if (topicInput) topicInput.setAttribute("aria-expanded", "false");
};

const highlightTopicSuggestion = (index) => {
  const list = getTopicSuggestionsList();
  if (!list) return;
  const items = list.querySelectorAll(".topic-suggestion-item");
  items.forEach((item, i) => {
    item.classList.toggle("active", i === index);
    item.setAttribute("aria-selected", i === index ? "true" : "false");
  });
  if (index >= 0 && items[index]) {
    items[index].scrollIntoView({ block: "nearest" });
  }
  topicSuggestionActiveIndex = index;
};

const selectTopicSuggestion = (topicName) => {
  applyTopicSelection(topicName, { commit: true });
  hideTopicSuggestions();
  closeMobileMenu();
};

const renderTopicSuggestions = (filterValue) => {
  if (!topicInput) return;
  let list = getTopicSuggestionsList();
  if (!list) {
    list = document.createElement("ul");
    list.id = "topic-suggestions";
    list.className = "topic-suggestions";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    // mousedown (not click) with preventDefault, so the browser's default
    // "clicking outside a focused text input blurs it" action never runs -
    // the input stays focused straight through the selection. Reacting on
    // click instead raced the "input" event's own DOM rebuild of this list
    // and the blur/change that firing outside-click-closes-menu logic could
    // trigger, occasionally clearing the field instead of selecting.
    list.addEventListener("mousedown", (e) => {
      const item = e.target.closest(".topic-suggestion-item");
      if (!item) return;
      e.preventDefault();
      selectTopicSuggestion(item.textContent);
    });
    topicInput.parentElement.appendChild(list);
    topicInput.setAttribute("role", "combobox");
    topicInput.setAttribute("aria-autocomplete", "list");
    topicInput.setAttribute("aria-controls", "topic-suggestions");
    topicInput.setAttribute("aria-expanded", "false");
  }

  topicSuggestionNames = getTopicOptions(filterValue);
  topicSuggestionActiveIndex = -1;
  list.innerHTML = "";

  if (topicSuggestionNames.length === 0) {
    list.hidden = true;
    topicInput.setAttribute("aria-expanded", "false");
    return;
  }

  const fragment = document.createDocumentFragment();
  topicSuggestionNames.forEach((topic, index) => {
    const item = document.createElement("li");
    item.className = "topic-suggestion-item";
    item.id = `topic-suggestion-${index}`;
    item.textContent = String(topic);
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    fragment.appendChild(item);
  });
  list.appendChild(fragment);
  list.hidden = false;
  topicInput.setAttribute("aria-expanded", "true");
};

const stateNames = {
  1: "Bible",
  2: "Book",
  3: "Verse"
};

if (stateSlider) {
  stateSlider.addEventListener("input", () => {
    const value = Number(stateSlider.value) || 1;
    setState(value);
  });
  // "change" (release), not "input", so the mobile menu doesn't vanish mid-drag
  stateSlider.addEventListener("change", closeMobileMenu);
  updateStateUI(Number(stateSlider.value) || 1);
}

stateCaptions.forEach(caption => {
  caption.addEventListener("click", () => {
    const targetState = Number(caption.dataset.state);
    if (targetState) {
      setState(targetState);
      closeMobileMenu();
    }
  });
});

document.querySelectorAll(".mini-state-switcher button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetState = Number(btn.dataset.state);
    if (targetState) {
      setState(targetState);
      closeMobileMenu();
    }
  });
});

const goToBookView = (bookId) => {
  if (!bookId) return;
  console.log('[goToBookView] Setting selectedBookId to:', bookId);
  selectedBookId = bookId;
  selectedReadReference = null;
  preserveSelectedBookForNextRender = true;
  isRenderingStateTransition = true;
  console.log('[goToBookView] preserveSelectedBookForNextRender set to true');
  setState(2);
};

const fallbackBooks = [
  { id: "GEN", name: "Genesis", verseCount: 1533 },
  { id: "EXO", name: "Exodus", verseCount: 1213 },
  { id: "LEV", name: "Leviticus", verseCount: 859 },
  { id: "NUM", name: "Numbers", verseCount: 1288 },
  { id: "DEU", name: "Deuteronomy", verseCount: 959 },
  { id: "JOS", name: "Joshua", verseCount: 658 },
  { id: "JDG", name: "Judges", verseCount: 618 },
  { id: "RUT", name: "Ruth", verseCount: 85 },
  { id: "PSA", name: "Psalms", verseCount: 2461 },
  { id: "ISA", name: "Isaiah", verseCount: 1292 }
];

const BOOK_ORDER = [
  "GEN",
  "EXO",
  "LEV",
  "NUM",
  "DEU",
  "JOS",
  "JDG",
  "RUT",
  "1SA",
  "2SA",
  "1KI",
  "2KI",
  "1CH",
  "2CH",
  "EZR",
  "NEH",
  "EST",
  "JOB",
  "PSA",
  "PRO",
  "ECC",
  "SNG",
  "ISA",
  "JER",
  "LAM",
  "EZK",
  "DAN",
  "HOS",
  "JOL",
  "AMO",
  "OBA",
  "JON",
  "MIC",
  "NAM",
  "HAB",
  "ZEP",
  "HAG",
  "ZEC",
  "MAL",
  "MAT",
  "MRK",
  "LUK",
  "JHN",
  "ACT",
  "ROM",
  "1CO",
  "2CO",
  "GAL",
  "EPH",
  "PHP",
  "COL",
  "1TH",
  "2TH",
  "1TI",
  "2TI",
  "TIT",
  "PHM",
  "HEB",
  "JAS",
  "1PE",
  "2PE",
  "1JN",
  "2JN",
  "3JN",
  "JUD",
  "REV"
];

const BOOK_NAMES = {
  GEN: "Genesis",
  EXO: "Exodus",
  LEV: "Leviticus",
  NUM: "Numbers",
  DEU: "Deuteronomy",
  JOS: "Joshua",
  JDG: "Judges",
  RUT: "Ruth",
  "1SA": "1 Samuel",
  "2SA": "2 Samuel",
  "1KI": "1 Kings",
  "2KI": "2 Kings",
  "1CH": "1 Chronicles",
  "2CH": "2 Chronicles",
  EZR: "Ezra",
  NEH: "Nehemiah",
  EST: "Esther",
  JOB: "Job",
  PSA: "Psalms",
  PRO: "Proverbs",
  ECC: "Ecclesiastes",
  SNG: "Song of Songs",
  ISA: "Isaiah",
  JER: "Jeremiah",
  LAM: "Lamentations",
  EZK: "Ezekiel",
  DAN: "Daniel",
  HOS: "Hosea",
  JOL: "Joel",
  AMO: "Amos",
  OBA: "Obadiah",
  JON: "Jonah",
  MIC: "Micah",
  NAM: "Nahum",
  HAB: "Habakkuk",
  ZEP: "Zephaniah",
  HAG: "Haggai",
  ZEC: "Zechariah",
  MAL: "Malachi",
  MAT: "Matthew",
  MRK: "Mark",
  LUK: "Luke",
  JHN: "John",
  ACT: "Acts",
  ROM: "Romans",
  "1CO": "1 Corinthians",
  "2CO": "2 Corinthians",
  GAL: "Galatians",
  EPH: "Ephesians",
  PHP: "Philippians",
  COL: "Colossians",
  "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians",
  "1TI": "1 Timothy",
  "2TI": "2 Timothy",
  TIT: "Titus",
  PHM: "Philemon",
  HEB: "Hebrews",
  JAS: "James",
  "1PE": "1 Peter",
  "2PE": "2 Peter",
  "1JN": "1 John",
  "2JN": "2 John",
  "3JN": "3 John",
  JUD: "Jude",
  REV: "Revelation"
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const BOOK_GENRES = {
  // Law (Torah/Pentateuch)
  GEN: "law",
  EXO: "law",
  LEV: "law",
  NUM: "law",
  DEU: "law",
  // History
  JOS: "history",
  JDG: "history",
  RUT: "history",
  "1SA": "history",
  "2SA": "history",
  "1KI": "history",
  "2KI": "history",
  "1CH": "history",
  "2CH": "history",
  EZR: "history",
  NEH: "history",
  EST: "history",
  // Poetry & Wisdom
  JOB: "poetry",
  PSA: "poetry",
  PRO: "poetry",
  ECC: "poetry",
  SNG: "poetry",
  // Prophecy
  ISA: "prophecy",
  JER: "prophecy",
  LAM: "prophecy",
  EZK: "prophecy",
  DAN: "prophecy",
  HOS: "prophecy",
  JOL: "prophecy",
  AMO: "prophecy",
  OBA: "prophecy",
  JON: "prophecy",
  MIC: "prophecy",
  NAM: "prophecy",
  HAB: "prophecy",
  ZEP: "prophecy",
  HAG: "prophecy",
  ZEC: "prophecy",
  MAL: "prophecy",
  // Gospels
  MAT: "gospel",
  MRK: "gospel",
  LUK: "gospel",
  JHN: "gospel",
  // Epistles
  ACT: "epistle",
  ROM: "epistle",
  "1CO": "epistle",
  "2CO": "epistle",
  GAL: "epistle",
  EPH: "epistle",
  PHP: "epistle",
  COL: "epistle",
  "1TH": "epistle",
  "2TH": "epistle",
  "1TI": "epistle",
  "2TI": "epistle",
  TIT: "epistle",
  PHM: "epistle",
  HEB: "epistle",
  JAS: "epistle",
  "1PE": "epistle",
  "2PE": "epistle",
  "1JN": "epistle",
  "2JN": "epistle",
  "3JN": "epistle",
  JUD: "epistle",
  // Apocalyptic
  REV: "apocalyptic"
};

const GENRE_LABELS = {
  law: "Law",
  history: "History",
  poetry: "Poetry & Wisdom",
  prophecy: "Prophecy",
  gospel: "Gospels",
  epistle: "Epistles",
  apocalyptic: "Apocalyptic"
};

const buildItems = (books) => {
  const orderIndex = new Map(BOOK_ORDER.map((id, index) => [id, index]));
  const items = books
    .map((book, index) => ({
      ...book,
      value: Math.max(1, Number(characterCounts[book.id]) || Number(book.verseCount) || 1),
      displayName: BOOK_NAMES[book.id] || book.id,
      order: orderIndex.has(book.id) ? orderIndex.get(book.id) : BOOK_ORDER.length + index,
      isSeparator: false,
      genre: BOOK_GENRES[book.id] || "history"
    }))
    .sort((a, b) => a.order - b.order);
  
  const malIndex = items.findIndex(item => item.id === "MAL");
  if (malIndex !== -1) {
    items.splice(malIndex + 1, 0, {
      id: "SEPARATOR",
      displayName: "~0 AD",
      value: 100,
      isSeparator: true,
      order: items[malIndex].order + 0.5
    });
  }
  
  return items;
};

const normalizeAreas = (items, width, height) => {
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const area = width * height;
  items.forEach((item) => {
    item.area = (item.value / total) * area;
  });
};

const worst = (row, side) => {
  if (!row.length) return Number.POSITIVE_INFINITY;
  const sum = row.reduce((acc, item) => acc + item.area, 0);
  const max = Math.max(...row.map((item) => item.area));
  const min = Math.min(...row.map((item) => item.area));
  const sideSquared = side * side;
  return Math.max((sideSquared * max) / (sum * sum), (sum * sum) / (sideSquared * min));
};

const layoutRow = (row, rect) => {
  const rowArea = row.reduce((sum, item) => sum + item.area, 0);
  if (rect.w >= rect.h) {
    const rowHeight = rowArea / rect.w;
    let offsetX = rect.x;
    row.forEach((item) => {
      const itemWidth = item.area / rowHeight;
      item.x = offsetX;
      item.y = rect.y;
      item.w = itemWidth;
      item.h = rowHeight;
      offsetX += itemWidth;
    });
    rect.y += rowHeight;
    rect.h -= rowHeight;
  } else {
    const rowWidth = rowArea / rect.h;
    let offsetY = rect.y;
    row.forEach((item) => {
      const itemHeight = item.area / rowWidth;
      item.x = rect.x;
      item.y = offsetY;
      item.w = rowWidth;
      item.h = itemHeight;
      offsetY += itemHeight;
    });
    rect.x += rowWidth;
    rect.w -= rowWidth;
  }
};

const squarify = (items, width, height) => {
  const rect = { x: 0, y: 0, w: width, h: height };
  const remaining = items.slice();
  let row = [];

  while (remaining.length) {
    const item = remaining[0];
    const side = Math.min(rect.w, rect.h);

    if (row.length === 0 || worst(row, side) >= worst(row.concat(item), side)) {
      row.push(item);
      remaining.shift();
    } else {
      layoutRow(row, rect);
      row = [];
    }
  }

  if (row.length) {
    layoutRow(row, rect);
  }

  return items;
};

const enforceAspectRatios = (items, width, height) => {
  const cols = 14;
  const colWidth = width / cols;
  // Scales down at small heights so the packing algorithm distributes books
  // evenly rather than overloading the last column with dozens of 3px items.
  const minHeight = height >= 700 ? 110 : Math.max(40, Math.floor(height / 7));

  // Cap how much a column's fillFactor can stretch its items. Without this,
  // a column dominated by floor-clamped tiny books (e.g. 2/3 John, Jude next
  // to Revelation) gets a much larger fillFactor than every other column,
  // inflating its one "real" book (Revelation) past the size of books with
  // far more characters. Columns whose natural fillFactor is below this cap
  // are unaffected; capped columns leave a small gap at the bottom instead.
  const MAX_COLUMN_FILL_FACTOR = 1.3;

  // Sub-linear weight: compresses the ~138x character-count range (Jeremiah
  // vs. 2 John) down to ~4.4x, so short books differentiate above minHeight
  // instead of nearly all of them clamping to the same floor value.
  items.forEach((item) => {
    item.sizeWeight = Math.pow(item.value, 0.3);
  });

  // Greedily pack items, in canonical order, into columns top-to-bottom then
  // left-to-right: keep adding to the current column until the next item
  // would overflow `height`, then start a new column. This lets a book with
  // spare room below it (e.g. 2 Samuel) absorb the next book (1 Kings)
  // instead of being forced into fixed-size groups of items per column.
  const packColumns = (unitHeight) => {
    const columns = Array.from({ length: cols }, () => []);
    let col = 0;
    let colHeight = 0;
    items.forEach((item) => {
      const itemHeight = Math.max(minHeight, item.sizeWeight * unitHeight);
      if (colHeight > 0 && colHeight + itemHeight > height && col < cols - 1) {
        col += 1;
        colHeight = 0;
      }
      columns[col].push(item);
      colHeight += itemHeight;
    });
    return columns;
  };

  // Binary-search for the smallest unitHeight that spreads items across all
  // 14 columns (too small leaves trailing columns empty; too large overflows
  // the last column - handled below by scaleFactor).
  const minWeight = Math.min(...items.map((item) => item.sizeWeight));
  let lo = 0;
  let hi = height / minWeight;
  for (let i = 0; i < 25; i += 1) {
    const mid = (lo + hi) / 2;
    const usedCols = packColumns(mid).filter((col) => col.length > 0).length;
    if (usedCols >= cols) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const columnItems = packColumns(hi);

  // Squeeze to fit if the densest resulting column still overflows `height`.
  let maxColumnHeight = 0;
  columnItems.forEach((column) => {
    if (!column.length) return;
    const totalHeight = column.reduce(
      (sum, item) => sum + Math.max(minHeight, item.sizeWeight * hi),
      0
    );
    maxColumnHeight = Math.max(maxColumnHeight, totalHeight);
  });
  const scaleFactor = maxColumnHeight > height ? height / maxColumnHeight : 1;

  // Apply final heights, stacking from the top of each column. Columns that
  // fall short of `height` (e.g. the last column often ends up sparser than
  // the rest after the binary search) are stretched uniformly to fill it,
  // so no column leaves empty space below its last card.
  columnItems.forEach((column, colIndex) => {
    if (!column.length) return;
    const x = colIndex * colWidth;

    const baseHeights = column.map(
      (item) => Math.max(minHeight, item.sizeWeight * hi) * scaleFactor
    );
    const columnSum = baseHeights.reduce((sum, h) => sum + h, 0);
    const fillFactor = columnSum < height
      ? Math.min(height / columnSum, MAX_COLUMN_FILL_FACTOR)
      : 1;

    let y = 0;
    column.forEach((item, i) => {
      const itemHeight = baseHeights[i] * fillFactor;
      item.w = colWidth;
      item.h = itemHeight;
      item.x = x;
      item.y = y;
      item.colIndex = colIndex;
      y += itemHeight;
    });
  });
};

// Mobile Overview packing: fixed column count from width, canonical order
// reading like text (Genesis top-left, left-to-right then down); total height
// is an OUTPUT the page scrolls through, unlike the desktop fixed-height pack.
// Returns the treemap pixel height.
const packTreemapMobile = (items, width) => {
  const cols = Math.max(2, Math.min(4, Math.floor(width / 170)));
  const MIN_TILE_HEIGHT = 110; // title offset + 8 pin bands stay legible
  const TARGET_AVG_HEIGHT = 128;

  items.forEach((item) => {
    item.sizeWeight = Math.pow(item.value, 0.3);
  });
  const totalWeight = items.reduce((sum, item) => sum + item.sizeWeight, 0);
  const unit = (TARGET_AVG_HEIGHT * items.length) / totalWeight;

  // Each row's height = tallest tile in it, so rows stay aligned; the
  // final partial row stretches its tiles to fill the full width.
  let y = 0;
  for (let start = 0; start < items.length; start += cols) {
    const row = items.slice(start, start + cols);
    const tileWidth = width / row.length;
    const rowHeight = Math.max(
      ...row.map((item) => Math.max(MIN_TILE_HEIGHT, item.sizeWeight * unit))
    );
    row.forEach((item, i) => {
      item.x = i * tileWidth;
      item.y = y;
      item.w = tileWidth;
      item.h = rowHeight;
      item.colIndex = i;
    });
    y += rowHeight;
  }
  return Math.ceil(y);
};

const renderTreemap = (books, topic = null) => {
  if (!treemapEl) return;
  setSourceLabel("Berean Standard Bible");
  setPinnedLegendGenre(null);
  const rect = treemapEl.getBoundingClientRect();
  const width = Math.max(rect.width, 320);

  const items = buildItems(books);
  if (isMobileLayout()) {
    const totalHeight = packTreemapMobile(items, width);
    treemapEl.style.height = `${totalHeight}px`; // container grows; page scrolls
  } else {
    treemapEl.style.height = ""; // clear stale mobile inline height
    const height = Math.max(rect.height, 320);
    normalizeAreas(items, width, height);
    squarify(items, width, height);
    enforceAspectRatios(items, width, height);
  }

  // Get topic data if selected
  const topicData = topic && topicsData[topic] ? topicsData[topic] : null;

  treemapEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const tile = document.createElement("div");
    tile.className = "treemap-item";
    tile.style.left = item.x + "px";
    tile.style.top = item.y + "px";
    tile.style.width = Math.max(0, item.w) + "px";
    tile.style.height = Math.max(0, item.h) + "px";
    tile.dataset.row = item.rowIndex || 0;

    const card = document.createElement("article");
    card.className = item.isSeparator ? "card card--separator" : "card card--abstract";
    if (!item.isSeparator) {
      card.classList.add("is-clickable");
      card.addEventListener("click", () => {
        goToBookView(item.id);
      });
    }
    if (!item.isSeparator && item.genre) {
      card.setAttribute("data-genre", item.genre);
      
      // Add hover effects to highlight corresponding legend item
      tile.addEventListener("mouseenter", () => {
        if (pinnedLegendGenre) return;
        const legendItem = document.querySelector(`.legend-genre[data-genre="${item.genre}"]`);
        if (legendItem) {
          legendItem.classList.add("active");
        }
      });
      
      tile.addEventListener("mouseleave", () => {
        if (pinnedLegendGenre) return;
        const legendItem = document.querySelector(`.legend-genre[data-genre="${item.genre}"]`);
        if (legendItem) {
          legendItem.classList.remove("active");
        }
      });
    }

    const titleBar = document.createElement("div");
    titleBar.className = "card-title-bar";
    titleBar.textContent = item.displayName;
    titleBar.classList.add("is-clickable");
    titleBar.title = "Click to open Book view";
    titleBar.addEventListener("click", (e) => {
      e.stopPropagation();
      goToBookView(item.id);
    });

    card.appendChild(titleBar);

    if (item.isSeparator) {
      const separatorText = document.createElement("div");
      separatorText.className = "separator-text";
      separatorText.textContent = "Jesus Christ born in Bethlehem";
      card.appendChild(separatorText);
    } else {
      const lines = document.createElement("div");
      lines.className = "pin-lines";
      
      // Render lines based on topic data or fallback to placeholder lines
      if (topicData && topicData.references[item.id]) {
        // Render real lines at verse position percentages
        const verseEntries = topicData.references[item.id];
        const totalVerses = getBookVerseTotal(item.id) || verseCounts[item.id] || 1;
        
        const versePositions = verseEntries.map((entry) => {
          const refs = Array.isArray(entry.refs) ? entry.refs : [];
          const primaryRef = refs[0] || "";
          const parsed = parseChapterVerse(primaryRef);
          const chapterNumber = parsed?.chapter || entry.chapter || null;
          const verseNumber = parsed?.verse || entry.verse || null;
          const absoluteVerse = getAbsoluteVerseIndex(item.id, chapterNumber, verseNumber) || entry.verse || 1;
          const percentage = (absoluteVerse / totalVerses) * 100;

          return {
            chapter: chapterNumber,
            verse: verseNumber,
            absoluteVerse,
            percentage,
            subtopics: Array.isArray(entry.subtopics) ? entry.subtopics : [],
            refs
          };
        });
        
        // Sort by absolute verse position
        versePositions.sort((a, b) => a.absoluteVerse - b.absoluteVerse);
        
        // Grouped into vertical bands by position in the book, adaptively
        // clustering nearby groups together when the card doesn't have
        // room to show every distinct position as its own hoverable line
        // (see buildPinLineGroups).
        const bands = buildPinLineGroups(versePositions, item.h, (vp) => vp.absoluteVerse);
        bands.forEach((bandGroups) => {
          const bandEl = document.createElement("div");
          // Empty bands collapse to 0 height instead of reserving an equal
          // 1/8 share like populated ones - on a small book's card, most
          // bands are empty, and reclaiming their space is what lets the
          // few real pin-lines render at full height instead of getting
          // clipped by pin-line-band's overflow:hidden.
          bandEl.className = bandGroups.length > 0 ? "pin-line-band" : "pin-line-band pin-line-band--empty";

          bandGroups.forEach((group) => {
            const verses = group.verses;
            const verseCount = verses.length;
            const lineEl = document.createElement("div");
            lineEl.className = "pin-line";
            lineEl.style.flexBasis = `${getPinLineWidthPercent(verseCount)}%`;

            if (group.isCluster) {
              // Several distinct, non-adjacent verse positions merged into
              // one line because the card didn't have room to show them
              // individually - same "denser than normal" look as a single
              // large range, but without forcing it thin (there's nothing
              // to save room from here - it already IS the space-saving).
              lineEl.classList.add("pin-line-wrapped");
            } else if (verseCount > 10) {
              lineEl.classList.add("pin-line-wrapped");
              lineEl.style.height = "3px";
            }

            const subtopics = [...new Set(verses.flatMap((v) => v.subtopics))];
            const subtopicText = subtopics.join("; ");
            const allRefs = verses.flatMap((v) => v.refs || []);
            const referenceKind = getReferenceKindFromData({ subtopics, refs: allRefs, bookId: item.id });
            applyReferenceKindClass(lineEl, "pin-line", referenceKind);

            if (group.isCluster) {
              const cappedRefs = allRefs.slice(0, 6);
              let tooltipText = buildCounterpartTooltipText(`${verseCount} verses`, cappedRefs);
              if (allRefs.length > cappedRefs.length) {
                tooltipText += `\n+${allRefs.length - cappedRefs.length} more`;
              }
              lineEl.addEventListener("mouseenter", (e) => {
                showPlainTooltip(e, tooltipText);
                markCardPinLineHover(card);
              });
              lineEl.addEventListener("mousemove", updateTooltipPosition);
              lineEl.addEventListener("mouseleave", () => {
                hideTooltip();
                clearCardPinLineHoverSoon(card);
              });
              lineEl.dataset.bookId = item.id;
            } else {
              const startRef = verses[0].refs && verses[0].refs[0];
              const endRef = verses[verses.length - 1].refs && verses[verses.length - 1].refs[0];
              const refText = verseCount === 1 ? startRef : `${startRef} - ${endRef}`;
              lineEl.addEventListener('mouseenter', (e) => {
                showTooltip(e, refText, subtopicText, item.id, verses[0].absoluteVerse);
                markCardPinLineHover(card);
              });
              lineEl.addEventListener('mouseleave', () => {
                hideTooltip();
                clearCardPinLineHoverSoon(card);
              });
              lineEl.dataset.verses = refText;
              lineEl.dataset.subtopics = subtopicText;
              lineEl.dataset.bookId = item.id;
            }

            // Click handler to show verse modal
            lineEl.style.cursor = "pointer";
            lineEl.addEventListener("click", (e) => {
              e.stopPropagation();
              showVerseModal(item.id, item.displayName, versePositions, topicData.name);
            });

            bandEl.appendChild(lineEl);
          });

          lines.appendChild(bandEl);
        });

        const verseCount = verseEntries.length;

        // Add expand button
        const expandBtn = document.createElement("button");
        expandBtn.className = "expand-verses-btn";
        expandBtn.textContent = String(verseCount);
        expandBtn.title = verseCount === 1 ? "View 1 verse" : `View ${verseCount} verses`;
        expandBtn.setAttribute("aria-label", expandBtn.title);
        expandBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showVerseModal(item.id, item.displayName, versePositions, topicData.name);
        });
        tile.appendChild(expandBtn);
      } else {
        // No topic selected: keep the panel clean
      }
      
      card.appendChild(lines);
    }
    
    tile.appendChild(card);
    
    // Add info button for book summaries (always visible for non-separator books)
    if (!item.isSeparator) {
      const infoBtn = document.createElement("button");
      infoBtn.className = "info-btn";
      infoBtn.innerHTML = "ⓘ";
      const hasSummary = bookSummaries && bookSummaries[item.id];
      infoBtn.title = hasSummary ? "Book summary" : "Summary not available";
      infoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (hasSummary) {
          showBookSummaryModal(item.id, item.displayName);
        }
      });
      tile.appendChild(infoBtn);
    }
    
    fragment.appendChild(tile);
  });

  treemapEl.appendChild(fragment);
};

const renderBookView = (bookId, topic = null) => {
  const grid = document.getElementById("book-grid");
  const titleEl = document.getElementById("book-title");
  const metaEl = document.getElementById("book-meta");
  const topicEl = document.getElementById("book-current-topic");
  const bookVerseCount = document.getElementById("book-verse-count");
  if (!grid || !titleEl || !metaEl || !topicEl) return;

  grid.innerHTML = "";
  topicEl.textContent = getCurrentTopicDisplayText();
  fitTextToWidth(topicEl);

  const book = bookId ? bibleData[bookId] : null;
  if (!book || !Array.isArray(book.chapters)) {
    delete grid.dataset.density;
    titleEl.textContent = "Book";
    metaEl.textContent = "Select a book to view chapters";
    if (bookVerseCount) bookVerseCount.textContent = "";
    setSourceLabel("Berean Standard Bible");
    setPinnedLegendGenre(null);
    return;
  }

  const bookName = BOOK_NAMES[bookId] || book.name || bookId;
  const totalVerses = getBookVerseTotal(bookId) || 0;
  const bookGenre = BOOK_GENRES[bookId] || "history";
  const chapterCount = book.chapters.length;
  const chapterDensity = chapterCount >= 150 ? "ultra" : (chapterCount >= 100 ? "high" : "normal");
  grid.dataset.density = chapterDensity;
  titleEl.textContent = bookName;
  setPinnedLegendGenre(bookGenre);
  updateBookGenreFooter(bookGenre, bookName);

  metaEl.innerHTML = "";
  const bookNameSpan = document.createElement("span");
  bookNameSpan.className = "book-meta-name";
  bookNameSpan.textContent = bookName;
  const metaText = document.createElement("span");
  metaText.textContent = `${chapterCount} chapters • ${totalVerses} verses`;
  const navWrap = document.createElement("span");
  navWrap.className = "book-nav-controls";
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "book-nav-btn";
  prevBtn.textContent = "Prev Book";
  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openBookInState2(getAdjacentBookId(bookId, -1));
  });
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "book-nav-btn";
  nextBtn.textContent = "Next Book";
  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openBookInState2(getAdjacentBookId(bookId, 1));
  });
  navWrap.appendChild(prevBtn);
  navWrap.appendChild(nextBtn);
  metaEl.appendChild(bookNameSpan);
  metaEl.appendChild(metaText);
  metaEl.appendChild(navWrap);

  const topicData = topic ? topicsData[topic] : null;
  const bookEntries = topicData && topicData.references ? topicData.references[bookId] : null;
  
  // Calculate total verses for this topic in this book
  let topicVerseCount = 0;
  if (bookEntries && Array.isArray(bookEntries)) {
    const verseSet = new Set();
    bookEntries.forEach((entry) => {
      const refs = Array.isArray(entry.refs) ? entry.refs : [];
      refs.forEach(ref => {
        verseSet.add(ref);
      });
    });
    topicVerseCount = verseSet.size;
  }
  
  // Update verse count display
  if (bookVerseCount) {
    if (topicData && topicVerseCount > 0) {
      bookVerseCount.textContent = `${topicVerseCount} verse${topicVerseCount !== 1 ? 's' : ''}`;
    } else {
      bookVerseCount.textContent = "";
    }
  }
  
  const entriesByChapter = new Map();

  if (bookEntries) {
    bookEntries.forEach((entry) => {
      const refs = Array.isArray(entry.refs) ? entry.refs : [];
      const primaryRef = refs[0] || "";
      const parsed = parseChapterVerse(primaryRef);
      const chapterNumber = parsed?.chapter || entry.chapter || null;
      const verseNumber = parsed?.verse || entry.verse || null;
      if (!chapterNumber || !verseNumber) return;
      if (!entriesByChapter.has(chapterNumber)) {
        entriesByChapter.set(chapterNumber, []);
      }
      entriesByChapter.get(chapterNumber).push({
        chapter: chapterNumber,
        verse: verseNumber,
        refs,
        subtopics: Array.isArray(entry.subtopics) ? entry.subtopics : []
      });
    });
  }

  const chapterItems = book.chapters.map((chapter, index) => {
    const chapterNumber = Number(chapter.number) || index + 1;
    const chapterVerseTotal = Number(chapter.verseCount) || (Array.isArray(chapter.verses) ? chapter.verses.length : 1);
    return {
      chapter,
      chapterNumber,
      chapterVerseTotal,
      value: Math.max(1, chapterVerseTotal)
    };
  });

  const rect = grid.getBoundingClientRect();
  const width = Math.max(rect.width, 320);
  let height = Math.max(rect.height, 320);
  const is4k = window.innerWidth >= 2560;
  const mobile = isMobileLayout();

  let columnCount = 4;
  if (chapterCount >= 150) {
    columnCount = 16;
  } else if (chapterCount >= 51) {
    columnCount = 12;
  } else if (chapterCount >= 29) {
    columnCount = 8;
  }
  if (mobile) {
    // Fewer, wider columns; tiles must stay tappable (>=72px wide).
    columnCount = chapterCount >= 51
      ? Math.min(6, Math.max(4, Math.floor(width / 72)))
      : Math.min(4, Math.max(3, Math.floor(width / 110)));
  }
  columnCount = clamp(columnCount, 2, Math.max(2, chapterCount));

  if (mobile) {
    // Height is an output on mobile: the grid grows and the page scrolls.
    // Row-major, uniform tile height: chapters 1,2,3 read across the top row.
    const avgTile = chapterDensity === "ultra" ? 56 : chapterDensity === "high" ? 72 : 96;
    height = Math.ceil(chapterCount / columnCount) * avgTile;
    grid.style.height = `${height}px`;

    const columnWidth = width / columnCount;
    chapterItems.forEach((item, idx) => {
      item.x = (idx % columnCount) * columnWidth;
      item.y = Math.floor(idx / columnCount) * avgTile;
      item.w = columnWidth;
      item.h = avgTile;
    });
  } else {
    grid.style.height = "";

    const booksPerCol = Math.ceil(chapterItems.length / columnCount);
    const minHeightFloor = chapterDensity === "ultra"
      ? (is4k ? 24 : 18)
      : chapterDensity === "high"
        ? (is4k ? 28 : 22)
        : (is4k ? 34 : 26);
    const minHeightCeiling = chapterDensity === "ultra"
      ? (is4k ? 86 : 70)
      : chapterDensity === "high"
        ? (is4k ? 100 : 84)
        : (is4k ? 120 : 96);
    const dynamicMinHeight = clamp(
      Math.floor(height / Math.max(booksPerCol + 1, 2)),
      minHeightFloor,
      minHeightCeiling
    );
    const columnWidth = width / columnCount;
    const columns = Array.from({ length: columnCount }, () => []);
    const effectiveColumns = Math.min(columnCount, chapterItems.length);
    const chapterWeights = chapterItems.map((item) => item.value);
    const chapterCountTotal = chapterItems.length;

    const prefixSums = new Array(chapterCountTotal + 1).fill(0);
    for (let i = 1; i <= chapterCountTotal; i += 1) {
      prefixSums[i] = prefixSums[i - 1] + chapterWeights[i - 1];
    }

    const rangeSum = (startIndex, endIndex) => prefixSums[endIndex] - prefixSums[startIndex];

    const dp = Array.from({ length: effectiveColumns + 1 }, () => new Array(chapterCountTotal + 1).fill(Number.POSITIVE_INFINITY));
    const split = Array.from({ length: effectiveColumns + 1 }, () => new Array(chapterCountTotal + 1).fill(0));

    dp[0][0] = 0;
    for (let i = 1; i <= chapterCountTotal; i += 1) {
      dp[1][i] = rangeSum(0, i);
    }

    for (let col = 2; col <= effectiveColumns; col += 1) {
      for (let i = col; i <= chapterCountTotal; i += 1) {
        for (let j = col - 1; j < i; j += 1) {
          const candidate = Math.max(dp[col - 1][j], rangeSum(j, i));
          if (candidate < dp[col][i]) {
            dp[col][i] = candidate;
            split[col][i] = j;
          }
        }
      }
    }

    const boundaries = [];
    let currentI = chapterCountTotal;
    for (let col = effectiveColumns; col > 1; col -= 1) {
      const boundary = split[col][currentI];
      boundaries.push(boundary);
      currentI = boundary;
    }
    boundaries.reverse();

    let start = 0;
    for (let col = 0; col < effectiveColumns; col += 1) {
      const end = col < boundaries.length ? boundaries[col] : chapterCountTotal;
      columns[col] = chapterItems.slice(start, end);
      start = end;
    }

    columns.forEach((column, colIndex) => {
      if (column.length === 0) return;
      const x = colIndex * columnWidth;
      const columnValue = column.reduce((sum, item) => sum + item.value, 0);
      const baseHeightTotal = dynamicMinHeight * column.length;
      const extraHeight = Math.max(0, height - baseHeightTotal);
      let y = 0;

      column.forEach((item) => {
        const valueRatio = columnValue > 0 ? (item.value / columnValue) : (1 / column.length);
        const proportionalHeight = baseHeightTotal > height
          ? height * valueRatio
          : dynamicMinHeight + (extraHeight * valueRatio);
        item.x = x;
        item.y = y;
        item.w = columnWidth;
        item.h = Math.max(1, proportionalHeight);
        y += item.h;
      });

      if (column.length > 0) {
        const usedHeight = y;
        const delta = height - usedHeight;
        if (Math.abs(delta) > 0.1) {
          const last = column[column.length - 1];
          last.h = Math.max(1, last.h + delta);
        }
      }
    });
  }

  const fragment = document.createDocumentFragment();
  chapterItems.forEach((item) => {
    const { chapter, chapterNumber, chapterVerseTotal } = item;

    const tile = document.createElement("div");
    tile.className = "chapter-tile";
    tile.style.left = `${item.x}px`;
    tile.style.top = `${item.y}px`;
    tile.style.width = `${Math.max(0, item.w)}px`;
    tile.style.height = `${Math.max(0, item.h)}px`;

    const card = document.createElement("article");
    card.className = "card card--abstract";
    card.setAttribute("data-genre", bookGenre);
    card.classList.add("is-clickable");

    const titleBar = document.createElement("div");
    titleBar.className = "card-title-bar";
    titleBar.textContent = String(chapterNumber);
    card.appendChild(titleBar);

    const lines = document.createElement("div");
    lines.className = "pin-lines";

    const chapterEntries = entriesByChapter.get(chapterNumber) || [];
    const firstChapterEntryVerse = chapterEntries.length > 0
      ? chapterEntries.map((entry) => Number(entry.verse) || 1).sort((a, b) => a - b)[0]
      : 1;

    const openChapterInReadView = () => {
      openChapterInState3(bookId, chapterNumber, firstChapterEntryVerse);
    };

    titleBar.addEventListener("click", (e) => {
      e.stopPropagation();
      openChapterInReadView();
    });

    card.addEventListener("click", () => {
      openChapterInReadView();
    });

    if (chapterEntries.length > 0) {
      // Sort by verse number
      const sortedEntries = [...chapterEntries].sort((a, b) => a.verse - b.verse);
      
      const versePositions = sortedEntries.map((entry) => {
        const percentage = (entry.verse / chapterVerseTotal) * 100;
        return {
          chapter: entry.chapter,
          verse: entry.verse,
          percentage,
          subtopics: entry.subtopics,
          refs: entry.refs
        };
      });

      // Grouped into vertical bands by position in the chapter, adaptively
      // clustering nearby groups together when the card doesn't have room
      // to show every distinct position as its own hoverable line (see
      // buildPinLineGroups).
      const bands = buildPinLineGroups(versePositions, item.h, (vp) => vp.verse);
      bands.forEach((bandGroups) => {
        const bandEl = document.createElement("div");
        // See the matching comment in renderTreemap - empty bands collapse
        // so populated ones can use the reclaimed height.
        bandEl.className = bandGroups.length > 0 ? "pin-line-band" : "pin-line-band pin-line-band--empty";

        bandGroups.forEach((group) => {
          const verses = group.verses;
          const verseCount = verses.length;
          const lineEl = document.createElement("div");
          lineEl.className = "pin-line";
          lineEl.style.flexBasis = `${getPinLineWidthPercent(verseCount)}%`;

          if (group.isCluster) {
            // See the matching comment in renderTreemap.
            lineEl.classList.add("pin-line-wrapped");
          } else if (verseCount > 10) {
            lineEl.classList.add("pin-line-wrapped");
            lineEl.style.height = "3px";
          }

          const subtopics = [...new Set(verses.flatMap((v) => v.subtopics))];
          const subtopicText = subtopics.join("; ");
          const allRefs = verses.flatMap((v) => v.refs || []);
          const referenceKind = getReferenceKindFromData({ subtopics, refs: allRefs, bookId });
          applyReferenceKindClass(lineEl, "pin-line", referenceKind);

          if (group.isCluster) {
            const cappedRefs = allRefs.slice(0, 6);
            let tooltipText = buildCounterpartTooltipText(`${verseCount} verses`, cappedRefs);
            if (allRefs.length > cappedRefs.length) {
              tooltipText += `\n+${allRefs.length - cappedRefs.length} more`;
            }
            lineEl.addEventListener("mouseenter", (e) => {
              showPlainTooltip(e, tooltipText);
              markCardPinLineHover(card);
            });
            lineEl.addEventListener("mousemove", updateTooltipPosition);
            lineEl.addEventListener("mouseleave", () => {
              hideTooltip();
              clearCardPinLineHoverSoon(card);
            });
          } else {
            const startRef = verses[0].refs && verses[0].refs[0];
            const endRef = verses[verses.length - 1].refs && verses[verses.length - 1].refs[0];
            const refText = verseCount === 1 ? startRef : `${startRef} - ${endRef}`;
            lineEl.addEventListener("mouseenter", (e) => {
              showTooltip(e, refText, subtopicText, bookId, verses[0].verse);
              markCardPinLineHover(card);
            });
            lineEl.addEventListener("mouseleave", () => {
              hideTooltip();
              clearCardPinLineHoverSoon(card);
            });
          }

          lineEl.style.cursor = "pointer";
          lineEl.addEventListener("click", (e) => {
            e.stopPropagation();
            showVerseModal(
              bookId,
              bookName,
              versePositions,
              topicData?.name || "Chapter references",
              {
                chapterNumber,
                initialVerse: verses[0].verse
              }
            );
          });

          bandEl.appendChild(lineEl);
        });

        lines.appendChild(bandEl);
      });

      const expandBtn = document.createElement("button");
      const verseCount = chapterEntries.length;
      expandBtn.className = "expand-verses-btn";
      expandBtn.textContent = String(verseCount);
      expandBtn.title = verseCount === 1 ? "View 1 verse" : `View ${verseCount} verses`;
      expandBtn.setAttribute("aria-label", expandBtn.title);
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showVerseModal(
          bookId,
          bookName,
          versePositions,
          topicData?.name || "Chapter references",
          {
            chapterNumber,
            initialVerse: firstChapterEntryVerse
          }
        );
      });
      tile.appendChild(expandBtn);
    }

    card.appendChild(lines);
    tile.appendChild(card);
    fragment.appendChild(tile);
  });

  grid.appendChild(fragment);
};

const renderReadView = (bookId, topic = null) => {
  const readTitle = document.getElementById("read-title");
  const readMeta = document.getElementById("read-meta");
  const readTopic = document.getElementById("read-current-topic");
  const verseCount = document.getElementById("verse-count");
  const readingBlock = document.querySelector(".reading-block");
  if (!readTitle || !readMeta || !readTopic || !readingBlock) return;
  const book = bookId ? bibleData[bookId] : null;
  const bookName = BOOK_NAMES[bookId] || book?.name || "Verse";
  setSourceLabel("Berean Standard Bible");
  const bookGenre = BOOK_GENRES[bookId] || "history";
  setPinnedLegendGenre(book && Array.isArray(book.chapters) ? bookGenre : null);
  updateBookGenreFooter(book && Array.isArray(book.chapters) ? bookGenre : null, bookName);
  readTitle.textContent = bookName;
  readTopic.textContent = getCurrentTopicDisplayText();
  fitTextToWidth(readTopic);

  readingBlock.innerHTML = "";

  if (!book || !Array.isArray(book.chapters)) {
    readMeta.textContent = "Select a book first";
    if (verseCount) verseCount.textContent = "";
    const title = document.createElement("h3");
    title.textContent = "Verse Reader";
    const hint = document.createElement("p");
    hint.textContent = "Choose a verse from Book view to read full text here.";
    readingBlock.appendChild(title);
    readingBlock.appendChild(hint);
    return;
  }

  const topicData = topic && topicsData[topic] ? topicsData[topic] : null;
  const bookEntries = topicData && topicData.references ? topicData.references[bookId] : null;
  const chapterVerseMap = new Map();
  const chapterVerseKinds = new Map();
  // Prophecy dataset only: raw subtopic text per verse, needed to resolve
  // OT/NT counterparts when `topic` is an aggregate "[All] ..." topic (see
  // resolveRealProphecyTopicName).
  const chapterVerseSubtopics = new Map();

  if (Array.isArray(bookEntries)) {
    bookEntries.forEach((entry) => {
      const refs = Array.isArray(entry.refs) ? entry.refs : [];
      const primaryRef = refs[0] || "";
      const parsed = parseChapterVerse(primaryRef);
      const chapterNumber = parsed?.chapter || entry.chapter || null;
      const verseNumber = parsed?.verse || entry.verse || null;
      if (!chapterNumber || !verseNumber) return;
      if (!chapterVerseMap.has(chapterNumber)) {
        chapterVerseMap.set(chapterNumber, new Set());
      }
      chapterVerseMap.get(chapterNumber).add(verseNumber);

      if (!chapterVerseKinds.has(chapterNumber)) {
        chapterVerseKinds.set(chapterNumber, new Map());
      }
      const verseKindMap = chapterVerseKinds.get(chapterNumber);
      const existingKind = verseKindMap.get(verseNumber) || null;
      const nextKind = getReferenceKindFromData({ subtopics: entry.subtopics || [], refs, bookId });
      verseKindMap.set(verseNumber, mergeReferenceKinds(existingKind, nextKind));

      if (!chapterVerseSubtopics.has(chapterNumber)) {
        chapterVerseSubtopics.set(chapterNumber, new Map());
      }
      chapterVerseSubtopics.get(chapterNumber).set(verseNumber, (entry.subtopics || []).join("; "));
    });
  }

  // Calculate total verse count for this topic in this book
  let totalVerseCount = 0;
  chapterVerseMap.forEach((verses) => {
    totalVerseCount += verses.size;
  });

  const referencedChapters = Array.from(chapterVerseMap.keys()).sort((a, b) => a - b);
  const fallbackChapter = referencedChapters[0] || 1;
  const preferredChapter = selectedReadReference?.chapter || fallbackChapter;
  const chapterNumber = clamp(preferredChapter, 1, book.chapters.length);
  const chapter = book.chapters[chapterNumber - 1];
  const verses = Array.isArray(chapter?.verses) ? chapter.verses : [];
  const highlightedVerses = chapterVerseMap.get(chapterNumber) || new Set();
  const highlightedVerseKinds = chapterVerseKinds.get(chapterNumber) || new Map();
  const highlightedVerseSubtopics = chapterVerseSubtopics.get(chapterNumber) || new Map();
  const highlightedVersesArray = Array.from(highlightedVerses).sort((a, b) => a - b);
  
  // Update verse count display for current chapter
  if (verseCount) {
    if (topicData && highlightedVersesArray.length > 0) {
      const chapterVerseCount = highlightedVersesArray.length;
      verseCount.textContent = `${chapterVerseCount} verse${chapterVerseCount !== 1 ? 's' : ''}`;
    } else {
      verseCount.textContent = "";
    }
  }
  
  // Track current verse index within highlighted verses
  let currentVerseIndex = 0;
  const currentVerse = selectedReadReference?.verse;
  if (highlightedVersesArray.length > 0 && currentVerse) {
    const idx = highlightedVersesArray.indexOf(currentVerse);
    if (idx !== -1) {
      currentVerseIndex = idx;
    }
  }

  const getPreferredVerseForChapter = (chapterNum) => {
    const verseSet = chapterVerseMap.get(chapterNum);
    if (verseSet && verseSet.size > 0) {
      return Math.min(...Array.from(verseSet));
    }
    return 1;
  };

  const setReadReference = (chapterNum, verseNum) => {
    selectedReadReference = {
      refText: `${bookName} ${chapterNum}:${verseNum}`,
      chapter: chapterNum,
      verse: verseNum
    };
    renderReadView(bookId, selectedTopic);
    // Chapter changes are history entries; back retraces them.
    syncHistory({ push: true });
  };
  
  const updateVerseHighlight = (verseList, targetVerseNum) => {
    // Remove is-current from all verses
    verseList.querySelectorAll('.chapter-verse.is-current').forEach(el => {
      el.classList.remove('is-current');
    });
    
    // Add is-current to target verse
    const verses = verseList.querySelectorAll('.chapter-verse');
    verses.forEach((verseEl, index) => {
      const verseNumber = Number(chapter.verses[index]?.n ?? chapter.verses[index]?.number) || index + 1;
      if (verseNumber === targetVerseNum) {
        verseEl.classList.add('is-current');
        // Update reference without re-rendering
        selectedReadReference = {
          refText: `${bookName} ${chapterNumber}:${targetVerseNum}`,
          chapter: chapterNumber,
          verse: targetVerseNum
        };
        // Update meta text
        readMeta.textContent = `Starting at ${selectedReadReference.refText}`;
        // Smooth scroll to verse
        scrollToVerse(verseList.parentElement, verseEl);
      }
    });
    
    // Update button states
    const newIndex = highlightedVersesArray.indexOf(targetVerseNum);
    prevVerseBtn.disabled = newIndex === 0;
    nextVerseBtn.disabled = newIndex === highlightedVersesArray.length - 1;

    // Verse hops within a chapter only replace the URL - a single browser
    // Back skips past them to the previous chapter/state.
    syncHistory();
  };

  const scrollToVerse = (container, target) => {
    if (!container || !target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  if (selectedReadReference && selectedReadReference.refText) {
    readMeta.textContent = `Starting at ${selectedReadReference.refText}`;
  } else {
    readMeta.textContent = "Choose a verse to read";
  }

  const chapterNav = document.createElement("div");
  chapterNav.className = "chapter-nav";

  const prevBtn = document.createElement("button");
  prevBtn.className = "chapter-nav-btn";
  prevBtn.type = "button";
  prevBtn.textContent = "Prev Ch.";
  prevBtn.disabled = chapterNumber <= 1;
  prevBtn.addEventListener("click", () => {
    if (chapterNumber <= 1) return;
    const prevChapter = chapterNumber - 1;
    const nextVerse = getPreferredVerseForChapter(prevChapter);
    setReadReference(prevChapter, nextVerse);
  });

  const chapterLabel = document.createElement("span");
  chapterLabel.className = "chapter-nav-label";
  chapterLabel.textContent = `Chapter ${chapterNumber}`;

  const prevVerseBtn = document.createElement("button");
  prevVerseBtn.className = "chapter-nav-btn chapter-nav-btn--ghost";
  prevVerseBtn.type = "button";
  prevVerseBtn.textContent = "◄ Prev verse";
  prevVerseBtn.disabled = highlightedVersesArray.length === 0 || currentVerseIndex === 0;

  const nextVerseBtn = document.createElement("button");
  nextVerseBtn.className = "chapter-nav-btn chapter-nav-btn--ghost";
  nextVerseBtn.type = "button";
  nextVerseBtn.textContent = "Next verse ►";
  nextVerseBtn.disabled = highlightedVersesArray.length === 0 || currentVerseIndex === highlightedVersesArray.length - 1;

  const nextBtn = document.createElement("button");
  nextBtn.className = "chapter-nav-btn";
  nextBtn.type = "button";
  nextBtn.textContent = "Next Ch.";
  nextBtn.disabled = chapterNumber >= book.chapters.length;
  nextBtn.addEventListener("click", () => {
    if (chapterNumber >= book.chapters.length) return;
    const nextChapter = chapterNumber + 1;
    const nextVerse = getPreferredVerseForChapter(nextChapter);
    setReadReference(nextChapter, nextVerse);
  });

  const chapterCenter = document.createElement("div");
  chapterCenter.className = "chapter-nav-center";
  chapterCenter.appendChild(chapterLabel);
  if (highlightedVersesArray.length > 0) {
    chapterCenter.appendChild(prevVerseBtn);
    chapterCenter.appendChild(nextVerseBtn);
  }

  chapterNav.appendChild(prevBtn);
  chapterNav.appendChild(chapterCenter);
  chapterNav.appendChild(nextBtn);
  readingBlock.appendChild(chapterNav);

  if (!verses.length) {
    const empty = document.createElement("p");
    empty.textContent = "Verse text unavailable.";
    readingBlock.appendChild(empty);
    return;
  }

  // Create wrapper for verses and sidebar
  const verseContentWrapper = document.createElement("div");
  verseContentWrapper.className = "verse-content-wrapper";

  const verseList = document.createElement("div");
  verseList.className = "chapter-verses";
  let selectedRow = null;
  let firstTopicRow = null;

  verses.forEach((verse, index) => {
    const verseNumber = Number(verse.n ?? verse.number) || index + 1;
    const verseText = verse.text || "";
    const verseRow = document.createElement("div");
    verseRow.className = "chapter-verse";

    const isHighlighted = highlightedVerses.has(verseNumber);
    const isCurrentVerse = selectedReadReference
      && selectedReadReference.chapter === chapterNumber
      && selectedReadReference.verse === verseNumber;

    let counterpartIcon = null;

    if (isHighlighted) {
      verseRow.classList.add("is-topic");
      const verseKind = highlightedVerseKinds.get(verseNumber) || null;
      applyReferenceKindClass(verseRow, "chapter-verse", verseKind);
      if (!firstTopicRow) {
        firstTopicRow = verseRow;
      }
      // Add pulsing glow to current highlighted verse
      if (isCurrentVerse) {
        verseRow.classList.add("is-current");
        selectedRow = verseRow;
      }

      if (activeDatasetMode === "prophecy" && (verseKind === "ot" || verseKind === "nt")) {
        const subtopicText = highlightedVerseSubtopics.get(verseNumber) || "";
        const realTopic = resolveRealProphecyTopicName(topic, subtopicText);
        const counterpartRefs = realTopic ? getProphecyCounterpartRefs(realTopic, verseKind) : [];
        if (counterpartRefs.length) {
          const counterpartLabel = verseKind === "ot" ? "NT Fulfillment" : "OT Prophecy";
          const tooltipText = buildCounterpartTooltipText(counterpartLabel, counterpartRefs);
          counterpartIcon = document.createElement("span");
          counterpartIcon.className = "prophecy-counterpart-icon";
          counterpartIcon.textContent = "⇄";
          counterpartIcon.setAttribute("aria-label", `Show ${counterpartLabel.toLowerCase()} reference`);
          counterpartIcon.addEventListener("mouseenter", (e) => showPlainTooltip(e, tooltipText));
          counterpartIcon.addEventListener("mousemove", updateTooltipPosition);
          counterpartIcon.addEventListener("mouseleave", hideTooltip);
        }
      }
    }

    const numberEl = document.createElement("span");
    numberEl.className = "chapter-verse-number";
    numberEl.textContent = `${verseNumber}`;
    if (counterpartIcon) {
      numberEl.appendChild(counterpartIcon);
    }

    const textEl = document.createElement("span");
    textEl.className = "chapter-verse-text";
    textEl.textContent = verseText;

    verseRow.appendChild(numberEl);
    verseRow.appendChild(textEl);
    verseList.appendChild(verseRow);
  });

  // Create and append chapter navigation sidebar
  const chapterNavSidebar = document.createElement("aside");
  chapterNavSidebar.className = "chapter-nav-sidebar";
  chapterNavSidebar.id = "chapter-nav-sidebar";

  verseContentWrapper.appendChild(verseList);
  verseContentWrapper.appendChild(chapterNavSidebar);
  readingBlock.appendChild(verseContentWrapper);

  // Populate chapter navigation sidebar
  renderChapterNavSidebar(verses, highlightedVerses, highlightedVerseKinds, chapterNumber, verseList, updateVerseHighlight);

  // Add event listeners for verse navigation (now that verseList exists)
  prevVerseBtn.addEventListener("click", () => {
    const currentIdx = highlightedVersesArray.indexOf(selectedReadReference?.verse);
    if (currentIdx > 0) {
      const prevVerse = highlightedVersesArray[currentIdx - 1];
      updateVerseHighlight(verseList, prevVerse);
    }
  });

  nextVerseBtn.addEventListener("click", () => {
    const currentIdx = highlightedVersesArray.indexOf(selectedReadReference?.verse);
    if (currentIdx < highlightedVersesArray.length - 1) {
      const nextVerse = highlightedVersesArray[currentIdx + 1];
      updateVerseHighlight(verseList, nextVerse);
    }
  });

  scrollToVerse(verseList, selectedRow || firstTopicRow);
};

const renderChapterNavSidebar = (verses, highlightedVerses, highlightedVerseKinds, chapterNumber, verseList, updateVerseHighlight) => {
  const sidebar = document.getElementById("chapter-nav-sidebar");
  if (!sidebar) return;

  sidebar.innerHTML = "";

  if (!verses || verses.length === 0) return;

  const track = document.createElement("div");
  track.className = "chapter-nav-track";

  // Group adjacent highlighted verses into ranges
  const highlightedArray = Array.from(highlightedVerses).sort((a, b) => a - b);
  const ranges = [];
  let currentRange = null;

  highlightedArray.forEach((verseNum) => {
    if (!currentRange || verseNum !== currentRange.end + 1) {
      if (currentRange) ranges.push(currentRange);
      currentRange = { start: verseNum, end: verseNum };
    } else {
      currentRange.end = verseNum;
    }
  });
  if (currentRange) ranges.push(currentRange);

  // Create indicators for each verse (or range)
  const totalVerses = verses.length;
  
  // If we have highlighted verses, create indicators for ranges
  if (ranges.length > 0) {
    ranges.forEach((range) => {
      const startPercent = ((range.start - 1) / totalVerses) * 100;
      const endPercent = (range.end / totalVerses) * 100;
      const heightPercent = endPercent - startPercent;
      
      const indicator = document.createElement("div");
      indicator.className = "chapter-nav-indicator is-topic";
      if (range.end > range.start) {
        indicator.classList.add("is-range");
      }

      let rangeKind = null;
      for (let verseNum = range.start; verseNum <= range.end; verseNum += 1) {
        const kind = highlightedVerseKinds && typeof highlightedVerseKinds.get === "function"
          ? highlightedVerseKinds.get(verseNum)
          : null;
        rangeKind = mergeReferenceKinds(rangeKind, kind);
      }
      applyReferenceKindClass(indicator, "chapter-nav-indicator", rangeKind);

      indicator.style.top = `${startPercent}%`;
      indicator.style.height = `${heightPercent}%`;
      indicator.dataset.verseStart = range.start;
      indicator.dataset.verseEnd = range.end;
      
      indicator.addEventListener("click", () => {
        updateVerseHighlight(verseList, range.start);
      });
      
      track.appendChild(indicator);
    });
  }

  // Create current position marker
  const positionMarker = document.createElement("div");
  positionMarker.className = "chapter-nav-position";
  positionMarker.style.top = "0%";
  
  // Update position marker based on scroll
  const updatePositionMarker = () => {
    if (!verseList) return;
    
    const scrollPercent = (verseList.scrollTop / (verseList.scrollHeight - verseList.clientHeight)) * 100;
    positionMarker.style.top = `${Math.max(0, Math.min(100, scrollPercent))}%`;
  };

  // Scroll event listener
  if (verseList) {
    verseList.addEventListener("scroll", updatePositionMarker);
    updatePositionMarker();
  }

  // Drag functionality
  let isDragging = false;
  let trackRect = null;

  const onDragStart = (e) => {
    isDragging = true;
    trackRect = track.getBoundingClientRect();
    e.preventDefault();
  };

  const onDragMove = (e) => {
    if (!isDragging || !trackRect || !verseList) return;
    
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    const relativeY = clientY - trackRect.top;
    const percent = Math.max(0, Math.min(1, relativeY / trackRect.height));
    
    const scrollTarget = percent * (verseList.scrollHeight - verseList.clientHeight);
    verseList.scrollTop = scrollTarget;
    
    e.preventDefault();
  };

  const onDragEnd = () => {
    isDragging = false;
    trackRect = null;
  };

  positionMarker.addEventListener("mousedown", onDragStart);
  positionMarker.addEventListener("touchstart", onDragStart, { passive: false });
  
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("touchmove", onDragMove, { passive: false });
  
  window.addEventListener("mouseup", onDragEnd);
  window.addEventListener("touchend", onDragEnd);

  track.appendChild(positionMarker);
  sidebar.appendChild(track);
};

const updateBookGenreFooter = (genre = null, bookName = null) => {
  console.log('[updateBookGenreFooter] Called with genre:', genre, 'bookName:', bookName);
  const legendEl = document.getElementById("genre-legend");
  if (!legendEl) {
    console.log('[updateBookGenreFooter] legendEl not found!');
    return;
  }
  const existingIndicator = legendEl.querySelector(".book-genre-indicator");
  if (existingIndicator) existingIndicator.remove();
  if (!genre) return;

  const genreLabel = GENRE_LABELS[genre] || genre;
  const indicator = document.createElement("span");
  indicator.className = "book-genre-indicator";
  indicator.setAttribute("data-genre", genre);
  const displayText = bookName ? `${bookName} • ${genreLabel}` : genreLabel;
  indicator.textContent = displayText;
  console.log('[updateBookGenreFooter] Inserting indicator with text:', displayText);
  legendEl.insertBefore(indicator, legendEl.firstChild);
};

const loadBooks = async () => {
  try {
    const response = await fetch("data/books-summary.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing data");
    const data = await response.json();
    if (!data || !Array.isArray(data.books) || data.books.length === 0) {
      throw new Error("No books");
    }
    return data.books;
  } catch (error) {
    return fallbackBooks;
  }
};

const loadVerseCounts = async () => {
  try {
    const response = await fetch("data/book-verse-counts.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing verse counts");
    const data = await response.json();
    if (!data || !data.books) throw new Error("Invalid verse counts data");
    return data.books;
  } catch (error) {
    console.warn("Failed to load verse counts");
    return {};
  }
};

const loadCharacterCounts = async () => {
  try {
    const response = await fetch("data/book-character-counts.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing character counts");
    const data = await response.json();
    if (!data || !data.books) throw new Error("Invalid character counts data");
    return data.books;
  } catch (error) {
    console.warn("Failed to load character counts");
    return {};
  }
};

const loadBible = async () => {
  try {
    const response = await fetch("data/bible.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing bible data");
    const data = await response.json();
    if (!data || !data.books) throw new Error("Invalid bible data");
    // Index by book ID for quick lookup
    const indexed = {};
    data.books.forEach((book) => {
      indexed[book.id] = book;
    });
    return indexed;
  } catch (error) {
    console.warn("Failed to load bible text data");
    return {};
  }
};

const loadBookSummaries = async () => {
  try {
    const response = await fetch("data/book-summaries.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing book summaries");
    const data = await response.json();
    return data || {};
  } catch (error) {
    console.warn("Failed to load book summaries:", error);
    return {};
  }
};

const boot = async () => {
  if (!treemapEl) return;
  booksData = await loadBooks();
  verseCounts = await loadVerseCounts();
  characterCounts = await loadCharacterCounts();
  bibleData = await loadBible();
  bookSummaries = await loadBookSummaries();

  // Deep-link support: ?dataset=<mode>&topic=<name> overrides whatever was
  // last stored locally, so a shared link always lands on the right topic.
  const urlParams = new URLSearchParams(window.location.search);
  const urlDatasetMode = urlParams.get("dataset");
  const urlTopic = urlParams.get("topic");

  if (topicInput) {
    const storedDatasetMode = getStoredDatasetMode();
    if (urlDatasetMode && DATASET_CONFIG[urlDatasetMode]) {
      activeDatasetMode = urlDatasetMode;
    } else if (storedDatasetMode && DATASET_CONFIG[storedDatasetMode]) {
      activeDatasetMode = storedDatasetMode;
    }
    if (datasetModeSelect) {
      datasetModeSelect.value = activeDatasetMode;
    }
    updateDatasetUI();

    await loadTopics();

    if (datasetModeSelect) {
      datasetModeSelect.addEventListener("change", async (e) => {
        const nextMode = e.target.value;
        if (!DATASET_CONFIG[nextMode]) {
          e.target.value = activeDatasetMode;
          return;
        }

        activeDatasetMode = nextMode;
        setStoredDatasetMode(nextMode);
        updateDatasetUI();

        const previousTopic = selectedTopic;
        await loadTopics();
        selectedTopic = previousTopic && topicsData[previousTopic]
          ? previousTopic
          : getDatasetDefaultTopic(nextMode);

        if (topicInput) {
          topicInput.value = selectedTopic || "";
          // Prophecy (and any other blank-default dataset) lands here with an
          // empty field - focus it so the suggestion dropdown is already open
          // for the user's next interaction.
          if (!selectedTopic) {
            topicInput.focus();
          }
        }
        setStoredTopic(selectedTopic);
        // Label before render - see the comment in applyTopicSelection.
        updateCurrentTopicLabel();
        renderCurrentState();
        syncHistory();
        updateTopicActionState();
        closeMobileMenu();
      });
    }
    
    // Listen for topic selection changes
    topicInput.addEventListener("change", (e) => {
      applyTopicSelection(e.target.value, { commit: true });
      closeMobileMenu();
    });

    // Also listen for input changes (for the suggestion dropdown)
    topicInput.addEventListener("input", (e) => {
      renderTopicSuggestions(e.target.value);
      applyTopicSelection(e.target.value, { commit: false });
    });

    // Arrow keys move the highlighted suggestion; Enter selects it (or, with
    // nothing highlighted, commits whatever text is currently typed - this
    // covers the exact-match-by-typing case, not just picking from the list).
    topicInput.addEventListener("keydown", (e) => {
      const list = getTopicSuggestionsList();
      const isOpen = list && !list.hidden;
      if (e.key === "ArrowDown") {
        if (!isOpen) renderTopicSuggestions(topicInput.value);
        if (topicSuggestionNames.length > 0) {
          e.preventDefault();
          const next = topicSuggestionActiveIndex + 1 >= topicSuggestionNames.length ? 0 : topicSuggestionActiveIndex + 1;
          highlightTopicSuggestion(next);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        if (isOpen && topicSuggestionNames.length > 0) {
          e.preventDefault();
          const next = topicSuggestionActiveIndex - 1 < 0 ? topicSuggestionNames.length - 1 : topicSuggestionActiveIndex - 1;
          highlightTopicSuggestion(next);
        }
        return;
      }
      if (e.key === "Escape") {
        if (isOpen) hideTopicSuggestions();
        return;
      }
      if (e.key === "Enter") {
        if (isOpen && topicSuggestionActiveIndex >= 0 && topicSuggestionNames[topicSuggestionActiveIndex]) {
          e.preventDefault();
          selectTopicSuggestion(topicSuggestionNames[topicSuggestionActiveIndex]);
          return;
        }
        applyTopicSelection(e.target.value, { commit: true });
        hideTopicSuggestions();
        closeMobileMenu();
      }
    });

    // Show suggestions on focus. Hide on blur, but delayed - a tap/click on a
    // suggestion fires its own click handler right after this blur, and the
    // list needs to still be in the DOM for that click to land.
    //
    // The delayed hide is cancelled on the next focus so it can't fire after
    // the input has already been refocused (e.g. clicking the clear button
    // blurs the input, then immediately refocuses it) - otherwise the
    // freshly-rendered list would flash open and then vanish 150ms later.
    let topicSuggestionsHideTimer = null;
    topicInput.addEventListener("focus", () => {
      if (topicSuggestionsHideTimer) {
        window.clearTimeout(topicSuggestionsHideTimer);
        topicSuggestionsHideTimer = null;
      }
      renderTopicSuggestions(topicInput.value);
    });
    topicInput.addEventListener("blur", () => {
      topicSuggestionsHideTimer = window.setTimeout(() => {
        hideTopicSuggestions();
        topicSuggestionsHideTimer = null;
      }, 150);
    });

    const linkedTopic = urlTopic ? resolveTopicKey(urlTopic) : null;
    const storedTopic = resolveTopicKey(getStoredTopic());
    if (linkedTopic) {
      applyTopicSelection(linkedTopic, { commit: true });
    } else if (storedTopic) {
      applyTopicSelection(storedTopic, { commit: true });
    } else {
      const initialTopic = getDatasetDefaultTopic(activeDatasetMode) || "";
      applyTopicSelection(initialTopic, { commit: true });
    }
  }

  if (topicClearBtn) {
    topicClearBtn.addEventListener("click", () => {
      applyTopicSelection(null, { commit: true });
      // Focus the now-empty field - the focus handler renders the
      // suggestion dropdown fresh with the full topic list.
      if (topicInput) topicInput.focus();
    });
  }

  if (topicRandomBtn) {
    topicRandomBtn.addEventListener("click", () => {
      const randomTopic = pickRandomTopic();
      if (randomTopic) {
        applyTopicSelection(randomTopic, { commit: true });
      }
    });
  }

  const contactCopyBtn = document.getElementById("contact-copy-btn");
  if (contactCopyBtn) {
    const defaultText = contactCopyBtn.dataset.defaultText || contactCopyBtn.textContent;
    const emailToCopy = contactCopyBtn.dataset.copyValue || "";
    let contactCopyResetTimer = null;
    contactCopyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(emailToCopy);
        contactCopyBtn.textContent = "Copied!";
      } catch (error) {
        // Clipboard API unavailable/denied - show the address itself so the
        // user can still select and copy it manually.
        contactCopyBtn.textContent = emailToCopy;
      }
      if (contactCopyResetTimer) clearTimeout(contactCopyResetTimer);
      contactCopyResetTimer = setTimeout(() => {
        contactCopyBtn.textContent = defaultText;
      }, 1500);
    });
  }

  // Initialize Jump to Book dropdowns
  const bookJumpSelect = document.getElementById("book-jump-select");
  const verseJumpBook = document.getElementById("verse-jump-book");
  const verseJumpChapter = document.getElementById("verse-jump-chapter");
  const verseJumpGo = document.getElementById("verse-jump-go");

  const populateBookDropdowns = () => {
    if (!booksData || booksData.length === 0) return;
    
    // Clear existing options (except the default one)
    const clearDropdown = (select) => {
      while (select.options.length > 1) {
        select.remove(1);
      }
    };

    clearDropdown(bookJumpSelect);
    clearDropdown(verseJumpBook);

    // Populate both dropdowns with books in canonical order
    BOOK_ORDER.forEach((bookId) => {
      const option1 = document.createElement("option");
      option1.value = bookId;
      option1.textContent = BOOK_NAMES[bookId] || bookId;
      bookJumpSelect.appendChild(option1);

      const option2 = document.createElement("option");
      option2.value = bookId;
      option2.textContent = BOOK_NAMES[bookId] || bookId;
      verseJumpBook.appendChild(option2);
    });
  };

  if (bookJumpSelect) {
    bookJumpSelect.addEventListener("change", (e) => {
      const bookId = e.target.value;
      if (bookId) {
        openBookInState2(bookId);
        e.target.value = ""; // Reset for next selection
      }
    });
  }

  if (verseJumpBook) {
    verseJumpBook.addEventListener("change", (e) => {
      const bookId = e.target.value;
      if (bookId) {
        // Populate chapter dropdown
        const book = bibleData[bookId];
        if (book && Array.isArray(book.chapters)) {
          while (verseJumpChapter.options.length > 1) {
            verseJumpChapter.remove(1);
          }
          for (let i = 1; i <= book.chapters.length; i++) {
            const option = document.createElement("option");
            option.value = i;
            option.textContent = `Chapter ${i}`;
            verseJumpChapter.appendChild(option);
          }
          verseJumpChapter.style.display = "block";
          verseJumpGo.style.display = "inline-block";
        }
      } else {
        verseJumpChapter.style.display = "none";
        verseJumpGo.style.display = "none";
      }
    });
  }

  if (verseJumpGo) {
    verseJumpGo.addEventListener("click", () => {
      const bookId = verseJumpBook.value;
      const chapterNum = parseInt(verseJumpChapter.value);
      if (bookId && chapterNum) {
        openChapterInState3(bookId, chapterNum);
        verseJumpBook.value = "";
        verseJumpChapter.value = "";
        verseJumpChapter.style.display = "none";
        verseJumpGo.style.display = "none";
      }
    });
  }

  populateBookDropdowns();

  // Deep-link restore: &state=&book=&ch=&v= re-open the exact Book/Verse
  // view (refresh in state 2/3 comes back where you were). Then normalize
  // the initial entry via replace so invalid nav params get cleaned and
  // dataset/topic are always stamped on. Uses urlParams captured at boot
  // start - the topic-selection sync above already rewrote location.search
  // (still state 1 at that point, so it strips the nav params).
  const navParams = urlParams;
  if (navParams.get("state") || navParams.get("book")) {
    isRestoringHistory = true;
    try {
      applyUrlNavState(navParams);
    } finally {
      isRestoringHistory = false;
    }
  } else {
    renderCurrentState();
  }
  syncHistory();

  // Browser back/forward: restore the app position from the URL. Registered
  // here (not top-level) so bibleData is guaranteed loaded before a restore.
  window.addEventListener("popstate", () => {
    isRestoringHistory = true;
    try {
      applyUrlNavState(new URLSearchParams(window.location.search));
    } finally {
      isRestoringHistory = false;
    }
    // Older entries can carry a stale topic/dataset (those only ever
    // replaceState the newest entry) - re-stamp the current ones.
    syncHistory();
  });

  attachGenreLegend();

  // Mobile renders SET the container height, which re-fires this observer —
  // key on width only in mobile mode so those height writes don't loop.
  const lastObservedRenderKeys = new Map();
  const observer = new ResizeObserver((entries) => {
    let needsRender = false;
    entries.forEach((entry) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      const key = isMobileLayout() ? `m${w}` : `d${w}x${h}`;
      if (lastObservedRenderKeys.get(entry.target) !== key) {
        lastObservedRenderKeys.set(entry.target, key);
        needsRender = true;
      }
    });
    if (needsRender) renderCurrentState();
  });
  observer.observe(treemapEl);
  const bookGridEl = document.getElementById("book-grid");
  if (bookGridEl) {
    observer.observe(bookGridEl);
  }

  MOBILE_LAYOUT_QUERY.addEventListener("change", () => {
    closeMobileMenu();
    renderCurrentState();
  });
};


// Use global BOOK_METADATA if available (loaded via <script>), fallback to empty object
const BOOK_METADATA = window.BOOK_METADATA || {};

const showBookSummaryModal = (bookId, bookName) => {
  const summary = bookSummaries[bookId];
  if (!summary) return;

  // Create modal overlay
  const modal = document.createElement("div");
  modal.className = "verse-modal-overlay";

  const modalContent = document.createElement("div");
  modalContent.className = "verse-modal";

  const header = document.createElement("div");
  header.className = "verse-modal-header";

  // Add author/date/notes if available
  const meta = BOOK_METADATA[bookId] || {};
  let metaHtml = "";
  if (meta.author || meta.date || meta.notes) {
    metaHtml += '<div class="book-meta">';
    if (meta.author) metaHtml += `<div><strong>Author:</strong> ${meta.author}</div>`;
    if (meta.date) metaHtml += `<div><strong>Date:</strong> ${meta.date}</div>`;
    if (meta.notes) metaHtml += `<div class="book-meta-notes"><strong>Notes:</strong> ${meta.notes}</div>`;
    metaHtml += '</div>';
  }
  // Add citation icon with tooltip, placed bottom-right
  header.innerHTML = `<h3>${bookName}</h3>${metaHtml}<p>Book Summary</p>`;
  const citationIcon = document.createElement("a");
  citationIcon.href = "https://www.wolfhawke.com/musings/bible-study/table-of-bible-book-dates";
  citationIcon.target = "_blank";
  citationIcon.rel = "noopener noreferrer";
  citationIcon.className = "book-citation-icon book-citation-header";
  citationIcon.innerHTML = '<span title="Citation: Diener, J.M. “When the Books of the Bible Were Written”. J.M. Diener’s Writings. 2021. https://www.wolfhawke.com/musings/bible-study/table-of-bible-book-dates. Accessed: 27 Feb. 2026." style="font-size:1.1em;vertical-align:middle;cursor:pointer;">ℹ️</span>';
  header.appendChild(citationIcon);

  const closeBtn = document.createElement("button");
  closeBtn.className = "verse-modal-close";
  closeBtn.innerHTML = "✕";
  header.appendChild(closeBtn);
  // Add close button handler
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    modal.remove();
  });

  const content = document.createElement("div");
  content.className = "verse-modal-content";

  const summaryText = document.createElement("p");
  summaryText.className = "book-summary-text";
  summaryText.textContent = summary.summary;
  content.appendChild(summaryText);

  // Add citation icon for summary source
  content.style.position = "relative";
  const summaryCitation = document.createElement("a");
  summaryCitation.href = "https://www.gotquestions.org/66-books-of-the-Bible.html";
  summaryCitation.target = "_blank";
  summaryCitation.rel = "noopener noreferrer";
  summaryCitation.className = "book-citation-icon book-citation-bottom";
  summaryCitation.innerHTML = '<span title="Citation: GotQuestions.org. &#34;66 Books of the Bible.&#34; https://www.gotquestions.org/66-books-of-the-Bible.html. Accessed: 27 Feb. 2026." style="font-size:1.1em;vertical-align:middle;cursor:pointer;">ℹ️</span>';
  content.appendChild(summaryCitation);

  modalContent.appendChild(header);
  modalContent.appendChild(content);
  modal.appendChild(modalContent);

  // Close on overlay click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  document.body.appendChild(modal);
};

const showVerseModal = (bookId, bookName, versePositions, topicName, options = {}) => {
  const { chapterNumber = null, initialVerse = null } = options;
  const isProphecyMode = activeDatasetMode === "prophecy";
  const isBsbTopicsMode = activeDatasetMode === "bsb-topics";
  
  // Get book statistics
  const book = bibleData[bookId];
  const totalVerses = getBookVerseTotal(bookId) || 0;
  const totalChapters = book && book.chapters ? book.chapters.length : 0;
  const topicVerseCount = versePositions.length;
  const chapterData = chapterNumber && book && Array.isArray(book.chapters)
    ? book.chapters[chapterNumber - 1]
    : null;
  const chapterVerseTotal = chapterData
    ? (Number(chapterData.verseCount) || (Array.isArray(chapterData.verses) ? chapterData.verses.length : 0))
    : 0;
  
  // Create modal overlay
  const modal = document.createElement("div");
  modal.className = "verse-modal-overlay";
  
  const modalContent = document.createElement("div");
  modalContent.className = "verse-modal";
  
  const header = document.createElement("div");
  header.className = "verse-modal-header";
  
  // Build header with stats
  const bookStats = chapterNumber
    ? `Chapter ${chapterNumber} • ${chapterVerseTotal.toLocaleString()} verse${chapterVerseTotal !== 1 ? 's' : ''}`
    : (totalChapters > 0
      ? `${totalChapters} chapter${totalChapters !== 1 ? 's' : ''} • ${totalVerses.toLocaleString()} verses`
      : "");
  const topicStatsLabel = isProphecyMode ? "prophecy verse" : "topic verse";
  const topicStats = `${topicVerseCount} ${topicStatsLabel}${topicVerseCount !== 1 ? 's' : ''}`;
  const headerSubtitle = `${topicName} • ${topicStats}`;
  
  const headerHTML = bookStats 
    ? `<h3>${bookName}</h3><p class="book-stats">${bookStats}</p><p>${headerSubtitle}</p>`
    : `<h3>${bookName}</h3><p>${headerSubtitle}</p>`;
  
  header.innerHTML = headerHTML;
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "verse-modal-close";
  closeBtn.innerHTML = "✕";
  closeBtn.addEventListener("click", () => modal.remove());
  header.appendChild(closeBtn);
  
  const content = document.createElement("div");
  content.className = "verse-modal-content verse-modal-content--split";

  const parseRefChapterVerse = (ref) => {
    if (!ref) return null;
    const match = ref.match(/(\d+):(\d+)/);
    if (!match) return null;
    return { chapter: Number(match[1]), verse: Number(match[2]) };
  };

  const buildRangeLabel = (startRef, endRef, startChapter, endChapter, startVerse, endVerse) => {
    if (startVerse === endVerse) {
      if (startRef) return startRef;
      if (startChapter) return `${bookName} ${startChapter}:${startVerse}`;
      return `${bookName} ${startVerse}`;
    }

    const startPrefix = startRef && startRef.includes(":") ? startRef.split(":")[0] : bookName;
    const endPrefix = endRef && endRef.includes(":") ? endRef.split(":")[0] : bookName;

    if (startChapter && endChapter && startChapter === endChapter) {
      if (startPrefix && endPrefix && startPrefix === endPrefix) {
        return `${startPrefix}:${startVerse}-${endVerse}`;
      }
      return `${bookName} ${startChapter}:${startVerse}-${endVerse}`;
    }

    if (startRef && endRef) {
      return `${startRef} - ${endRef}`;
    }

    if (startChapter && endChapter) {
      return `${bookName} ${startChapter}:${startVerse} - ${bookName} ${endChapter}:${endVerse}`;
    }

    return `${bookName} ${startVerse}-${endVerse}`;
  };

  const mergeAdjacentVerses = (positions) => {
    const sorted = [...positions].sort((a, b) => {
      const chapterA = a.chapter ?? parseRefChapterVerse((a.refs || [])[0])?.chapter ?? 0;
      const chapterB = b.chapter ?? parseRefChapterVerse((b.refs || [])[0])?.chapter ?? 0;
      if (chapterA !== chapterB) {
        return chapterA - chapterB;
      }
      return (a.verse ?? 0) - (b.verse ?? 0);
    });
    const groups = [];

    sorted.forEach((vp) => {
      const primaryRef = (vp.refs || [])[0] || "";
      const parsedRef = parseRefChapterVerse(primaryRef);
      const chapterNumber = vp.chapter ?? parsedRef?.chapter ?? null;
      const verseNumber = vp.verse ?? parsedRef?.verse ?? null;
      const subtopicText = (vp.subtopics || []).join("; ");
      const refText = primaryRef || `Verse ${verseNumber ?? vp.verse}`;
      const last = groups[groups.length - 1];
      
      // Filter refs to only include those from the current chapter
      const filteredRefs = (vp.refs || []).filter((ref) => {
        const parsed = parseRefChapterVerse(ref);
        return parsed && parsed.chapter === chapterNumber;
      });

      if (
        last &&
        chapterNumber !== null &&
        last.chapter === chapterNumber &&
        verseNumber !== null &&
        verseNumber === last.endVerse + 1 &&
        subtopicText === last.subtopicText
      ) {
        last.endVerse = verseNumber;
        last.endPercentage = vp.percentage;
        last.refs.push(...filteredRefs);
      } else {
        groups.push({
          chapter: chapterNumber,
          startVerse: verseNumber ?? vp.verse,
          endVerse: verseNumber ?? vp.verse,
          startPercentage: vp.percentage,
          endPercentage: vp.percentage,
          subtopicText,
          refs: [...filteredRefs],
          refText
        });
      }
    });

    return groups.map((group) => {
      const startRef = group.refs[0] || group.refText;
      const endRef = group.refs[group.refs.length - 1] || startRef;
      const rangeLabel = buildRangeLabel(
        startRef,
        endRef,
        group.chapter,
        group.chapter,
        group.startVerse,
        group.endVerse
      );
      const percentage = (group.startPercentage + group.endPercentage) / 2;

      return {
        startVerse: group.startVerse,
        endVerse: group.endVerse,
        percentage,
        renderTop: Math.max(0, Math.min(percentage, 100)),
        rangeLabel,
        subtopicText: group.subtopicText,
        refs: group.refs,
        referenceKind: getReferenceKindFromData({ subtopics: group.subtopicText, refs: group.refs, bookId })
      };
    });
  };

  const buildVerseDetailLines = (group) => {
    if (!group.refs || group.refs.length === 0) {
      return ["Verse text unavailable."];
    }

    // Parse all refs and deduplicate
    const parsedVerses = [];
    const seenVerses = new Set();
    
    group.refs.forEach((ref) => {
      const parsed = parseRefChapterVerse(ref);
      if (!parsed) return;
      
      const verseKey = `${parsed.chapter}:${parsed.verse}`;
      if (seenVerses.has(verseKey)) return;
      seenVerses.add(verseKey);
      
      parsedVerses.push({
        ref,
        chapter: parsed.chapter,
        verse: parsed.verse
      });
    });
    
    // Sort by chapter, then verse
    parsedVerses.sort((a, b) => {
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });
    
    // Build lines in sorted order
    const lines = [];
    parsedVerses.forEach(({ ref, chapter, verse }) => {
      const verseText = getVerseText(bookId, chapter, verse);
      if (verseText) {
        lines.push(`${ref} — ${verseText}`);
      }
    });

    if (lines.length === 0) {
      lines.push("Verse text unavailable.");
    }

    return lines;
  };

  const getReferenceBadges = (subtopicText = "") => {
    if (!subtopicText) return [];
    const badges = [];
    if (isProphecyMode) {
      if (subtopicText.includes(PROPHECY_OT_PREFIX)) {
        badges.push({ label: "OT Prophecy", className: "ref-badge--ot" });
      }
      if (subtopicText.includes(PROPHECY_NT_PREFIX)) {
        badges.push({ label: "NT Fulfillment", className: "ref-badge--nt" });
      }
    } else if (isBsbTopicsMode) {
      if (subtopicText.includes(BSB_NAVES_SOURCE_TAG)) {
        badges.push({ label: "Nave's", className: "ref-badge--naves" });
      }
      if (subtopicText.includes(BSB_TORREYS_SOURCE_TAG)) {
        badges.push({ label: "Torrey's", className: "ref-badge--torreys" });
      }
    }
    return badges;
  };

  const appendReferenceBadges = (container, subtopicText = "", kind = null) => {
    const badges = getReferenceBadges(subtopicText);
    if (badges.length) {
      const badgeRow = document.createElement("div");
      badgeRow.className = "ref-badge-row";
      badges.forEach((badge) => {
        const el = document.createElement("span");
        el.className = `ref-badge ${badge.className}`;
        el.textContent = badge.label;
        badgeRow.appendChild(el);
      });
      container.appendChild(badgeRow);
    }

    if (isProphecyMode && (kind === "ot" || kind === "nt")) {
      const realTopic = resolveRealProphecyTopicName(topicName, subtopicText);
      const counterpartRefs = realTopic ? getProphecyCounterpartRefs(realTopic, kind) : [];
      if (counterpartRefs.length) {
        const counterpartLabel = kind === "ot" ? "NT Fulfillment" : "OT Prophecy";
        const tooltipText = buildCounterpartTooltipText(counterpartLabel, counterpartRefs);
        const icon = document.createElement("span");
        icon.className = "prophecy-counterpart-icon";
        icon.textContent = "⇄";
        icon.setAttribute("aria-label", `Show ${counterpartLabel.toLowerCase()} reference`);
        icon.addEventListener("mouseenter", (e) => showPlainTooltip(e, tooltipText));
        icon.addEventListener("mousemove", updateTooltipPosition);
        icon.addEventListener("mouseleave", hideTooltip);
        container.appendChild(icon);
      }
    }
  };
  
  // Create visual representation with separated lines
  const visualization = document.createElement("div");
  visualization.className = "verse-visualization";
  
  const groupedPositions = mergeAdjacentVerses(versePositions);
  let detailPopup = null;
  let selectedGroup = null;
  const initialGroup = groupedPositions.find((group) => (
    typeof initialVerse === "number" && initialVerse >= group.startVerse && initialVerse <= group.endVerse
  )) || groupedPositions[0] || null;
  selectedGroup = initialGroup;
  const lineByKey = new Map();
  let listTooltipHideTimer = null;

  const setActiveLine = (key) => {
    const line = lineByKey.get(key);
    if (line) line.classList.add("is-active");
  };

  const clearActiveLine = (key) => {
    const line = lineByKey.get(key);
    if (line) line.classList.remove("is-active");
  };

  const showVerseDetail = (group, anchorEvent = null) => {
    if (detailPopup) detailPopup.remove();
    hideTooltip();
    selectedGroup = group;

    const detail = document.createElement("div");
    detail.className = "verse-detail-pop";

    const header = document.createElement("div");
    header.className = "verse-detail-header";
    const title = document.createElement("strong");
    title.textContent = group.rangeLabel;
    header.appendChild(title);

    if (group.subtopicText) {
      const subtitle = document.createElement("span");
      subtitle.className = "verse-detail-subtopic";
      subtitle.textContent = group.subtopicText;
      header.appendChild(subtitle);
      appendReferenceBadges(header, group.subtopicText, group.referenceKind);
    }

    const closeBtn = document.createElement("button");
    closeBtn.className = "verse-detail-close";
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => detail.remove());
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "verse-detail-body";
    body.textContent = buildVerseDetailLines(group).join("\n\n");

    detail.appendChild(header);
    detail.appendChild(body);

    detailPopup = detail;
    modalContent.appendChild(detail);

    const positionDetailPopup = (event = null) => {
      const containerRect = modalContent.getBoundingClientRect();
      const detailRect = detail.getBoundingClientRect();
      const padding = 12;

      let left = containerRect.width - detailRect.width - padding;
      let top = containerRect.height - detailRect.height - padding;

      if (event) {
        const clickX = event.clientX - containerRect.left;
        const clickY = event.clientY - containerRect.top;
        left = clickX + 16;
        top = clickY + 16;
      }

      left = Math.min(containerRect.width - detailRect.width - padding, Math.max(padding, left));
      top = Math.min(containerRect.height - detailRect.height - padding, Math.max(padding, top));

      detail.style.left = `${left}px`;
      detail.style.top = `${top}px`;
    };

    requestAnimationFrame(() => positionDetailPopup(anchorEvent));

    // Make popup draggable within modal
    header.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const containerRect = modalContent.getBoundingClientRect();
      const detailRect = detail.getBoundingClientRect();
      const offsetX = event.clientX - detailRect.left;
      const offsetY = event.clientY - detailRect.top;
      const padding = 12;

      const onMouseMove = (moveEvent) => {
        const left = moveEvent.clientX - containerRect.left - offsetX;
        const top = moveEvent.clientY - containerRect.top - offsetY;
        const clampedLeft = Math.min(containerRect.width - detailRect.width - padding, Math.max(padding, left));
        const clampedTop = Math.min(containerRect.height - detailRect.height - padding, Math.max(padding, top));
        detail.style.left = `${clampedLeft}px`;
        detail.style.top = `${clampedTop}px`;
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });
  };

  groupedPositions.forEach((group, index) => {
    const groupKey = `group-${index}`;
    const verseItem = document.createElement("div");
    verseItem.className = "verse-item";
    
    const line = document.createElement("div");
    line.className = "verse-line";
    applyReferenceKindClass(line, "verse-line", group.referenceKind);
    line.style.top = `${group.renderTop}%`;
    const verseCount = Math.max(1, (group.endVerse - group.startVerse + 1));
    const widthPercent = Math.min(100, 20 + (verseCount * 6));
    line.style.width = `${widthPercent}%`;
    line.style.left = "10px";
    line.style.right = "auto";
    const subtopicText = group.subtopicText;
    const refText = group.rangeLabel;

    lineByKey.set(groupKey, line);
    
    line.addEventListener('mouseenter', (e) => {
      setActiveLine(groupKey);
      showTooltip(e, refText, subtopicText, bookId, group.startVerse);
    });
    line.addEventListener('mouseleave', () => {
      clearActiveLine(groupKey);
      hideTooltip();
    });
    line.style.cursor = "pointer";
    line.addEventListener("click", (event) => {
      showVerseDetail(group, event);
    });

    verseItem.appendChild(line);
    visualization.appendChild(verseItem);
  });
  
  content.appendChild(visualization);
  
  // Verse list
  const list = document.createElement("div");
  list.className = "verse-list";
  
  groupedPositions.forEach((group, index) => {
    const groupKey = `group-${index}`;
    const item = document.createElement("div");
    item.className = "verse-list-item";
    const subtopicText = group.subtopicText;
    const refText = group.rangeLabel;
    item.innerHTML = `<strong>${refText}</strong>`;
    appendReferenceBadges(item, subtopicText, group.referenceKind);
    if (subtopicText) {
      const detail = document.createElement("span");
      detail.className = "verse-subtopic";
      detail.textContent = subtopicText;
      item.appendChild(detail);
    }
    item.addEventListener("mouseenter", (e) => {
      if (listTooltipHideTimer) {
        clearTimeout(listTooltipHideTimer);
        listTooltipHideTimer = null;
      }
      setActiveLine(groupKey);
      showTooltip(e, refText, subtopicText, bookId, group.startVerse);
    });
    item.addEventListener("mousemove", updateTooltipPosition);
    item.addEventListener("mouseleave", () => {
      clearActiveLine(groupKey);
      listTooltipHideTimer = setTimeout(() => {
        hideTooltip();
      }, 80);
    });
    item.style.cursor = "pointer";
    item.addEventListener("click", (event) => {
      showVerseDetail(group, event);
    });
    list.appendChild(item);
  });
  
  content.appendChild(list);

  const syncVisualizationHeight = () => {
    const targetHeight = list.clientHeight;
    if (targetHeight > 0) {
      visualization.style.height = `${targetHeight}px`;
    }
  };

  requestAnimationFrame(syncVisualizationHeight);
  const paneResizeObserver = new ResizeObserver(syncVisualizationHeight);
  paneResizeObserver.observe(list);
  
  const footer = document.createElement("div");
  footer.className = "verse-modal-footer";
  const state3Btn = document.createElement("button");
  state3Btn.className = "state3-nav-btn";
  state3Btn.textContent = chapterNumber ? "Open Chapter in Verse View" : "View Full Verse Text";
  state3Btn.disabled = groupedPositions.length === 0;
  state3Btn.addEventListener("click", () => {
    const targetGroup = selectedGroup || initialGroup;
    if (!targetGroup) return;
    const parsedTarget = parseRefChapterVerse((targetGroup.refs || [])[0] || "");
    const targetChapter = chapterNumber || parsedTarget?.chapter || 1;
    const targetVerse = targetGroup.startVerse || initialVerse || 1;
    const navBookName = BOOK_NAMES[bookId] || bibleData[bookId]?.name || bookName;

    selectedBookId = bookId;
    selectedReadReference = {
      refText: `${navBookName} ${targetChapter}:${targetVerse}`,
      chapter: targetChapter,
      verse: targetVerse
    };
    preserveSelectedBookForNextRender = true;
    isRenderingStateTransition = true;
    paneResizeObserver.disconnect();
    modal.remove();
    setState(3);
  });
  footer.appendChild(state3Btn);
  
  modalContent.appendChild(header);
  modalContent.appendChild(content);
  modalContent.appendChild(footer);
  modal.appendChild(modalContent);

  const cleanupModal = () => {
    paneResizeObserver.disconnect();
    modal.remove();
  };

  closeBtn.onclick = cleanupModal;
  
  modal.addEventListener("click", (e) => {
    if (e.target === modal) cleanupModal();
  });
  
  document.body.appendChild(modal);
};

boot();
// Mouse thumb buttons (back/forward) are handled natively by the browser now
// that app states are real history entries - popstate above restores them.

const loadTopics = async () => {
  try {
    const config = DATASET_CONFIG[activeDatasetMode] || DATASET_CONFIG.topics;
    const response = await fetch(config.file, { cache: "no-store" });
    if (!response.ok) throw new Error("Missing topics data");
    const rawTopicsData = await response.json();
    topicsData = activeDatasetMode === "prophecy"
      ? withProphecyAggregateTopics(rawTopicsData)
      : rawTopicsData;
    if (!topicsData || Object.keys(topicsData).length === 0) throw new Error("No topics");

    const topicNames = Object.keys(topicsData);
    topicsIndex.clear();
    topicNames.forEach((name) => {
      topicsIndex.set(normalizeTopicKey(name), name);
    });
    allTopicNames = topicNames;
    hideTopicSuggestions();
  } catch (error) {
    console.warn(`Failed to load ${activeDatasetMode} data, using fallback`);
    const fallbackTopics = ["angels", "birth of Jesus Christ", "crucifixion of Jesus Christ", "demons", "appearance of Jesus", "paradise", "resurrection", "Son of man", "transfiguration"];
    topicsData = {};
    fallbackTopics.forEach((name) => {
      topicsData[name] = { name, references: {} };
    });
    topicsIndex.clear();
    fallbackTopics.forEach((name) => {
      topicsIndex.set(normalizeTopicKey(name), name);
    });
    allTopicNames = fallbackTopics;
    hideTopicSuggestions();
  }
};

const attachGenreLegend = () => {
  const legendEl = document.getElementById("genre-legend");
  if (!legendEl) return;
  
  legendEl.innerHTML = "";
  const genres = ["law", "history", "poetry", "prophecy", "gospel", "epistle", "apocalyptic"];
  
  genres.forEach((genre) => {
    const item = document.createElement("span");
    item.className = "legend-item legend-genre";
    item.setAttribute("data-genre", genre);
    
    const colorBar = document.createElement("span");
    colorBar.className = "legend-color-bar";
    colorBar.style.borderColor = `var(--genre-${genre})`;
    
    const label = document.createElement("span");
    label.textContent = GENRE_LABELS[genre];
    
    item.appendChild(colorBar);
    item.appendChild(label);
    
    // Highlight books of this genre when hovering over legend
    item.addEventListener("mouseenter", () => {
      if (pinnedLegendGenre) return;
      const cards = document.querySelectorAll(`.treemap-item .card[data-genre="${genre}"]`);
      cards.forEach(card => card.classList.add("genre-highlighted"));
    });
    
    item.addEventListener("mouseleave", () => {
      if (pinnedLegendGenre) return;
      const cards = document.querySelectorAll(".treemap-item .card.genre-highlighted");
      cards.forEach(card => card.classList.remove("genre-highlighted"));
    });
    
    legendEl.appendChild(item);
  });
};
