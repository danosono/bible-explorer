const treemapEl = document.getElementById("treemap");
const stateSlider = document.querySelector(".state-slider");
const stateCaptions = document.querySelectorAll(".state-captions span");
const statePill = document.querySelector(".control-pill");
const topicInput = document.getElementById("topic-input");
const topicAction = document.getElementById("topic-action");
const currentTopicEl = document.getElementById("current-topic");
const sourceLabelEl = document.querySelector(".source");

// Global state for topics
let topicsData = {};
let verseCounts = {}; // Book verse counts for percentage calculation
let bibleData = {}; // Bible text data
let bookSummaries = {}; // Book summaries
let selectedTopic = null;
let booksData = [];
let selectedBookId = null;
let selectedReadReference = null;
let preserveSelectedBookForNextRender = false;
let isRenderingStateTransition = false;
let pinnedLegendGenre = null;
const DEFAULT_TOPIC = "life";
const FALLBACK_NAV_TOPIC = "Love";
const FALLBACK_NAV_BOOK = "JHN";
const STORED_TOPIC_KEY = "bibleExplorerTopic";
const topicsIndex = new Map();
let allTopicNames = [];
const MAX_TOPIC_OPTIONS = 200;

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
  if (!chapterData.verses || !chapterData.verses[verse - 1]) return null;
  
  const verseText = chapterData.verses[verse - 1].text;
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
  const bookName = book?.name || BOOK_NAMES[bookId] || bookId;
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
};

const updateCurrentTopicLabel = () => {
  if (!currentTopicEl) return;
  currentTopicEl.textContent = selectedTopic || "All topics";
};

const getStoredTopic = () => {
  try {
    return localStorage.getItem(STORED_TOPIC_KEY);
  } catch (error) {
    return null;
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

const updateTopicActionState = (stateValue = getCurrentState()) => {
  if (!topicAction) return;
  const isOverview = stateValue === 1;
  topicAction.textContent = "Clear Topic";
  topicAction.disabled = !isOverview && !selectedTopic;
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

  if (commit) {
    setStoredTopic(selectedTopic);
  }

  // Only re-render during typing in Overview (state 1) and Book (state 2)
  // For Verse view (state 3), wait for commit to avoid scroll jumping
  const currentState = getCurrentState();
  if (commit || currentState <= 2) {
    renderCurrentState();
  }
  
  updateCurrentTopicLabel();
  updateTopicActionState();
};

const getTopicOptions = (filterValue) => {
  const normalized = normalizeTopicKey(filterValue);
  if (!normalized) {
    return allTopicNames.slice(0, MAX_TOPIC_OPTIONS);
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
    if (startsWithMatches.length >= MAX_TOPIC_OPTIONS) break;
  }
  if (startsWithMatches.length >= MAX_TOPIC_OPTIONS) {
    return startsWithMatches.slice(0, MAX_TOPIC_OPTIONS);
  }
  const combined = startsWithMatches.concat(containsMatches);
  if (combined.length > MAX_TOPIC_OPTIONS) {
    return combined.slice(0, MAX_TOPIC_OPTIONS);
  }
  return combined;
};

const updateTopicOptions = (filterValue) => {
  if (!topicInput) return;
  const listId = "topic-list";
  let list = document.getElementById(listId);
  if (!list) {
    list = document.createElement("datalist");
    list.id = listId;
    list.className = "topic-datalist";
    topicInput.parentElement.appendChild(list);
    topicInput.setAttribute("list", listId);
  }
  list.innerHTML = "";
  const fragment = document.createDocumentFragment();
  getTopicOptions(filterValue).forEach((topic) => {
    const option = document.createElement("option");
    option.value = String(topic);
    fragment.appendChild(option);
  });
  list.appendChild(fragment);
};

const stateNames = {
  1: "Bible",
  2: "Book",
  3: "Verse"
};

if (stateSlider && statePill) {
  stateSlider.addEventListener("input", () => {
    const value = Number(stateSlider.value) || 1;
    setState(value);
  });
  updateStateUI(Number(stateSlider.value) || 1);
}

stateCaptions.forEach(caption => {
  caption.addEventListener("click", () => {
    const targetState = Number(caption.dataset.state);
    if (targetState) {
      setState(targetState);
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
      value: Math.max(1, Number(book.verseCount) || 1),
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
      displayName: "0 AD",
      value: 30,
      verseCount: 30,
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
  const minHeight = 110; // Minimum height to show 3 pin lines
  const booksPerCol = Math.ceil(items.length / cols);
  
  let columnItems = Array.from({ length: cols }, () => []);
  let currentCol = 0;

  items.forEach((item, index) => {
    columnItems[currentCol].push(item);
    if ((index + 1) % booksPerCol === 0 && currentCol < cols - 1) {
      currentCol++;
    }
  });

  // First pass: calculate heights with minimums
  let maxColumnHeight = 0;
  columnItems.forEach((column) => {
    if (column.length === 0) return;
    const columnValue = column.reduce((sum, item) => sum + item.value, 0);
    let totalHeight = 0;
    
    column.forEach((item) => {
      const heightProportion = item.value / columnValue;
      const proportionalHeight = height * heightProportion;
      const itemHeight = Math.max(minHeight, proportionalHeight);
      totalHeight += itemHeight;
    });
    
    maxColumnHeight = Math.max(maxColumnHeight, totalHeight);
  });
  
  // Scale factor if columns exceed available height
  const scaleFactor = maxColumnHeight > height ? height / maxColumnHeight : 1;

  // Second pass: apply scaled heights
  columnItems.forEach((column, colIndex) => {
    if (column.length === 0) return;
    const x = colIndex * colWidth;
    const columnValue = column.reduce((sum, item) => sum + item.value, 0);
    let y = 0;

    column.forEach((item) => {
      const heightProportion = item.value / columnValue;
      const proportionalHeight = height * heightProportion;
      const itemHeight = Math.max(minHeight, proportionalHeight) * scaleFactor;
      item.w = colWidth;
      item.h = itemHeight;
      item.x = x;
      item.y = y;
      item.colIndex = colIndex;
      y += itemHeight;
    });
  });
};

const renderTreemap = (books, topic = null) => {
  if (!treemapEl) return;
  setSourceLabel("Berean Standard Bible");
  setPinnedLegendGenre(null);
  const rect = treemapEl.getBoundingClientRect();
  const width = Math.max(rect.width, 320);
  const height = Math.max(rect.height, 320);

  const items = buildItems(books);
  normalizeAreas(items, width, height);
  squarify(items, width, height);
  enforceAspectRatios(items, width, height);

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
        
        // Group adjacent verses into ranges
        const verseRanges = [];
        let currentRange = null;
        
        versePositions.forEach((vp) => {
          if (!currentRange || vp.absoluteVerse > currentRange.endVerse + 1) {
            // Start new range
            if (currentRange) verseRanges.push(currentRange);
            currentRange = {
              startVerse: vp.absoluteVerse,
              endVerse: vp.absoluteVerse,
              verses: [vp],
              percentage: vp.percentage
            };
          } else {
            // Extend current range
            currentRange.endVerse = vp.absoluteVerse;
            currentRange.verses.push(vp);
          }
        });
        if (currentRange) verseRanges.push(currentRange);
        
        // Render lines for each range with width based on verse count
        verseRanges.forEach((range) => {
          const verseCount = range.verses.length;
          const lineEl = document.createElement("div");
          lineEl.className = "pin-line";
          lineEl.style.position = "absolute";
          lineEl.style.top = `${range.percentage}%`;
          
          // Calculate line width based on verse count
          // 1 verse = 20%, scale up to 100% for larger counts
          const baseWidth = 20;
          const maxWidth = 100;
          const width = Math.min(baseWidth + (verseCount - 1) * 8, maxWidth);
          lineEl.style.width = `${width}%`;
          
          // Handle wrapping for very large verse counts (>10 verses)
          if (verseCount > 10) {
            lineEl.classList.add("pin-line-wrapped");
            // Add visual indicator for wrapped/large groups
            lineEl.style.height = "3px";
          }
          
          // Create tooltip data
          const startRef = range.verses[0].refs && range.verses[0].refs[0];
          const endRef = range.verses[range.verses.length - 1].refs && range.verses[range.verses.length - 1].refs[0];
          const refText = verseCount === 1 ? startRef : `${startRef} - ${endRef}`;
          const subtopics = [...new Set(range.verses.flatMap(v => v.subtopics))];
          const subtopicText = subtopics.join("; ");
          
          lineEl.addEventListener('mouseenter', (e) => {
            showTooltip(e, refText, subtopicText, item.id, range.startVerse);
          });
          lineEl.addEventListener('mouseleave', hideTooltip);
          lineEl.dataset.verses = refText;
          lineEl.dataset.subtopics = subtopicText;
          lineEl.dataset.bookId = item.id;
          
          // Click handler to show verse modal
          lineEl.style.cursor = "pointer";
          lineEl.addEventListener("click", (e) => {
            e.stopPropagation();
            showVerseModal(item.id, item.displayName, versePositions, topicData.name);
          });
          
          lines.appendChild(lineEl);
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
  topicEl.textContent = selectedTopic || "All topics";

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
  const height = Math.max(rect.height, 320);
  const is4k = window.innerWidth >= 2560;

  let columnCount = 4;
  if (chapterCount >= 150) {
    columnCount = 16;
  } else if (chapterCount >= 51) {
    columnCount = 12;
  } else if (chapterCount >= 29) {
    columnCount = 8;
  }
  columnCount = clamp(columnCount, 2, Math.max(2, chapterCount));

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
        const renderTop = Math.max(0.8, Math.min(99.2, percentage));
        return {
          chapter: entry.chapter,
          verse: entry.verse,
          percentage,
          renderTop,
          subtopics: entry.subtopics,
          refs: entry.refs
        };
      });

      // Group adjacent verses into ranges
      const verseRanges = [];
      let currentRange = null;
      
      versePositions.forEach((vp) => {
        if (!currentRange || vp.verse > currentRange.endVerse + 1) {
          // Start new range
          if (currentRange) verseRanges.push(currentRange);
          currentRange = {
            startVerse: vp.verse,
            endVerse: vp.verse,
            verses: [vp],
            renderTop: vp.renderTop
          };
        } else {
          // Extend current range
          currentRange.endVerse = vp.verse;
          currentRange.verses.push(vp);
        }
      });
      if (currentRange) verseRanges.push(currentRange);

      // Render lines for each range with width based on verse count
      verseRanges.forEach((range) => {
        const verseCount = range.verses.length;
        const lineEl = document.createElement("div");
        lineEl.className = "pin-line";
        lineEl.style.position = "absolute";
        lineEl.style.top = `${range.renderTop}%`;

        // Calculate line width based on verse count
        // 1 verse = 20%, scale up to 100% for larger counts
        const baseWidth = 20;
        const maxWidth = 100;
        const width = Math.min(baseWidth + (verseCount - 1) * 8, maxWidth);
        lineEl.style.width = `${width}%`;

        // Handle wrapping for very large verse counts (>10 verses)
        if (verseCount > 10) {
          lineEl.classList.add("pin-line-wrapped");
          lineEl.style.height = "3px";
        }

        const startRef = range.verses[0].refs && range.verses[0].refs[0];
        const endRef = range.verses[range.verses.length - 1].refs && range.verses[range.verses.length - 1].refs[0];
        const refText = verseCount === 1 ? startRef : `${startRef} - ${endRef}`;
        const subtopics = [...new Set(range.verses.flatMap(v => v.subtopics))];
        const subtopicText = subtopics.join("; ");
        
        lineEl.addEventListener("mouseenter", (e) => {
          showTooltip(e, refText, subtopicText, bookId, range.startVerse);
        });
        lineEl.addEventListener("mouseleave", hideTooltip);
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
              initialVerse: range.startVerse
            }
          );
        });
        lines.appendChild(lineEl);
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
  setPinnedLegendGenre(null);
  updateBookGenreFooter(null);
  readTitle.textContent = bookName;
  readTopic.textContent = selectedTopic || "All topics";

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
  };
  
  const updateVerseHighlight = (verseList, targetVerseNum) => {
    // Remove is-current from all verses
    verseList.querySelectorAll('.chapter-verse.is-current').forEach(el => {
      el.classList.remove('is-current');
    });
    
    // Add is-current to target verse
    const verses = verseList.querySelectorAll('.chapter-verse');
    verses.forEach((verseEl, index) => {
      const verseNumber = Number(chapter.verses[index]?.number) || index + 1;
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

  const title = document.createElement("h3");
  title.textContent = bookName;
  readingBlock.appendChild(title);

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

  const verseList = document.createElement("div");
  verseList.className = "chapter-verses";
  let selectedRow = null;
  let firstTopicRow = null;

  verses.forEach((verse, index) => {
    const verseNumber = Number(verse.number) || index + 1;
    const verseText = verse.text || "";
    const verseRow = document.createElement("div");
    verseRow.className = "chapter-verse";

    const isHighlighted = highlightedVerses.has(verseNumber);
    const isCurrentVerse = selectedReadReference
      && selectedReadReference.chapter === chapterNumber
      && selectedReadReference.verse === verseNumber;

    if (isHighlighted) {
      verseRow.classList.add("is-topic");
      if (!firstTopicRow) {
        firstTopicRow = verseRow;
      }
      // Add pulsing glow to current highlighted verse
      if (isCurrentVerse) {
        verseRow.classList.add("is-current");
        selectedRow = verseRow;
      }
    }

    const numberEl = document.createElement("span");
    numberEl.className = "chapter-verse-number";
    numberEl.textContent = `${verseNumber}`;

    const textEl = document.createElement("span");
    textEl.className = "chapter-verse-text";
    textEl.textContent = verseText;

    verseRow.appendChild(numberEl);
    verseRow.appendChild(textEl);
    verseList.appendChild(verseRow);
  });

  readingBlock.appendChild(verseList);

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
  bibleData = await loadBible();
  bookSummaries = await loadBookSummaries();
  
  if (topicInput) {
    await loadTopics();
    
    // Listen for topic selection changes
    topicInput.addEventListener("change", (e) => {
      applyTopicSelection(e.target.value, { commit: true });
    });
    
    // Also listen for input changes (for autocomplete)
    topicInput.addEventListener("input", (e) => {
      updateTopicOptions(e.target.value);
      applyTopicSelection(e.target.value, { commit: false });
    });

    const storedTopic = resolveTopicKey(getStoredTopic());
    if (storedTopic) {
      applyTopicSelection(storedTopic, { commit: true });
    } else {
      applyTopicSelection(DEFAULT_TOPIC, { commit: true });
    }
  }

  if (topicAction) {
    topicAction.addEventListener("click", () => {
      const stateValue = getCurrentState();
      if (stateValue === 1) {
        applyTopicSelection(DEFAULT_TOPIC, { commit: true });
      } else {
        applyTopicSelection(null, { commit: true });
      }
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
  
  renderCurrentState();
  attachGenreLegend();

  const observer = new ResizeObserver(() => {
    renderCurrentState();
  });
  observer.observe(treemapEl);
  const bookGridEl = document.getElementById("book-grid");
  if (bookGridEl) {
    observer.observe(bookGridEl);
  }
};

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
  header.innerHTML = `<h3>${bookName}</h3><p>Book Summary</p>`;
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "verse-modal-close";
  closeBtn.innerHTML = "✕";
  header.appendChild(closeBtn);
  
  const content = document.createElement("div");
  content.className = "verse-modal-content";
  
  const summaryText = document.createElement("p");
  summaryText.className = "book-summary-text";
  summaryText.textContent = summary.summary;
  content.appendChild(summaryText);
  
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
  // Create modal overlay
  const modal = document.createElement("div");
  modal.className = "verse-modal-overlay";
  
  const modalContent = document.createElement("div");
  modalContent.className = "verse-modal";
  
  const header = document.createElement("div");
  header.className = "verse-modal-header";
  const headerSubtitle = chapterNumber
    ? `${topicName} • Chapter ${chapterNumber}`
    : topicName;
  header.innerHTML = `<h3>${bookName}</h3><p>${headerSubtitle}</p>`;
  
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
        last.refs.push(...(vp.refs || []));
      } else {
        groups.push({
          chapter: chapterNumber,
          startVerse: verseNumber ?? vp.verse,
          endVerse: verseNumber ?? vp.verse,
          startPercentage: vp.percentage,
          endPercentage: vp.percentage,
          subtopicText,
          refs: [...(vp.refs || [])],
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
        refs: group.refs
      };
    });
  };

  const buildVerseDetailLines = (group) => {
    if (!group.refs || group.refs.length === 0) {
      return ["Verse text unavailable."];
    }

    const lines = [];
    group.refs.forEach((ref) => {
      const parsed = parseRefChapterVerse(ref);
      if (!parsed) return;
      const verseText = getVerseText(bookId, parsed.chapter, parsed.verse);
      if (verseText) {
        lines.push(`${ref} — ${verseText}`);
      }
    });

    if (lines.length === 0) {
      lines.push("Verse text unavailable.");
    }

    return lines;
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

// Handle mouse back/forward buttons for state navigation
let lastNavigationTime = 0;
const handleMouseNavigation = (event) => {
  // Prevent duplicate events (Edge fires both mouseup and auxclick)
  const now = Date.now();
  if (now - lastNavigationTime < 100) {
    return;
  }
  
  // Check for back/forward buttons
  // Firefox uses button 3/4 in mouseup, Edge/Chrome use button 3/4 in auxclick
  // Some mice/browsers might also use button 7/8
  const isBack = event.button === 3 || event.button === 8;
  const isForward = event.button === 4 || event.button === 7;
  
  if (isBack) {
    // Back: go to previous state (but not below 1)
    const currentState = getCurrentState();
    if (currentState > 1) {
      event.preventDefault();
      event.stopPropagation();
      lastNavigationTime = now;
      setState(currentState - 1);
      return false;
    }
    // If we're at State 1, let browser handle it (go to previous page)
  } else if (isForward) {
    // Forward: go to next state (but not above 3)
    const currentState = getCurrentState();
    if (currentState < 3) {
      event.preventDefault();
      event.stopPropagation();
      lastNavigationTime = now;
      setState(currentState + 1);
      return false;
    }
    // If we're at State 3, let browser handle it (go forward in history if available)
  }
};

// Listen for both mouseup and auxclick to support different browsers
document.addEventListener('mouseup', handleMouseNavigation, true);
document.addEventListener('auxclick', handleMouseNavigation, true);

const loadTopics = async () => {
  try {
    // Load topics with verse references
    const response = await fetch("data/topics-with-references.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing topics data");
    topicsData = await response.json();
    if (!topicsData || Object.keys(topicsData).length === 0) throw new Error("No topics");

    const topicNames = Object.keys(topicsData);
    topicsIndex.clear();
    topicNames.forEach((name) => {
      topicsIndex.set(normalizeTopicKey(name), name);
    });
    allTopicNames = topicNames;
    updateTopicOptions("");
  } catch (error) {
    console.warn("Failed to load topics data, using fallback");
    const fallbackTopics = ["angels", "birth of Jesus Christ", "crucifixion of Jesus Christ", "demons", "appearance of Jesus", "paradise", "resurrection", "Son of man", "transfiguration"];
    topicsIndex.clear();
    fallbackTopics.forEach((name) => {
      topicsIndex.set(normalizeTopicKey(name), name);
    });
    allTopicNames = fallbackTopics;
    updateTopicOptions("");
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
