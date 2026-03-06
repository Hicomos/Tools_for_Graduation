// ─────────────────────────────────────────────
//  Text Preprocessing
// ─────────────────────────────────────────────

export function cleanText(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
    .trim();
}

export function isCJK(text: string): boolean {
  const cjkChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  return cjkChars > text.length * 0.15;
}

// ─────────────────────────────────────────────
//  1. N-gram Algorithm (existing, enhanced)
// ─────────────────────────────────────────────

export function buildCharNgrams(text: string, size = 5): Set<string> {
  const cleaned = normalizeForCompare(text);
  const ngrams = new Set<string>();
  for (let i = 0; i <= cleaned.length - size; i++) {
    ngrams.add(cleaned.slice(i, i + size));
  }
  if (cleaned.length < size && cleaned.length > 0) ngrams.add(cleaned);
  return ngrams;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function buildWordNgrams(tokens: string[], size = 3): Set<string> {
  const ngrams = new Set<string>();
  for (let i = 0; i <= tokens.length - size; i++) {
    ngrams.add(tokens.slice(i, i + size).join(' '));
  }
  if (tokens.length < size) tokens.forEach((t) => ngrams.add(t));
  return ngrams;
}

export function buildNgramSet(text: string): Set<string> {
  return isCJK(text) ? buildCharNgrams(text, 5) : buildWordNgrams(tokenize(text), 3);
}

/** Containment: fraction of A's ngrams that appear in B */
export function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let hit = 0;
  a.forEach((g) => { if (b.has(g)) hit++; });
  return hit / a.size;
}

export function computeNgramRates(ngramSets: Set<string>[]): { rate: number; pairwise: number[] }[] {
  return ngramSets.map((set, i) => {
    const others = new Set<string>();
    ngramSets.forEach((s, j) => { if (j !== i) s.forEach((g) => others.add(g)); });
    const rate = containment(set, others);
    const pairwise = ngramSets.map((s, j) => (j === i ? 1 : containment(set, s)));
    return { rate, pairwise };
  });
}

// ─────────────────────────────────────────────
//  2. Edit Distance (Normalized)
// ─────────────────────────────────────────────

/**
 * Sample-based edit distance for long texts.
 * We chunk both texts into fixed segments and average the similarity.
 */
function editDistanceSampled(a: string, b: string): number {
  const MAX_LEN = 300;

  // If texts are short enough, compute directly
  if (a.length <= MAX_LEN && b.length <= MAX_LEN) {
    return editSimilarityDirect(a, b);
  }

  // Sample segments evenly from both texts
  const SAMPLES = 5;
  const CHUNK = 200;
  let total = 0;

  for (let k = 0; k < SAMPLES; k++) {
    const aStart = Math.floor((k / SAMPLES) * Math.max(0, a.length - CHUNK));
    const bStart = Math.floor((k / SAMPLES) * Math.max(0, b.length - CHUNK));
    const aChunk = a.slice(aStart, aStart + CHUNK);
    const bChunk = b.slice(bStart, bStart + CHUNK);
    total += editSimilarityDirect(aChunk, bChunk);
  }

  return total / SAMPLES;
}

function editSimilarityDirect(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const la = a.length;
  const lb = b.length;

  // Use two-row DP to save memory
  let prev = new Uint32Array(lb + 1);
  let curr = new Uint32Array(lb + 1);

  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }

  const dist = prev[lb];
  const maxLen = Math.max(la, lb);
  return 1 - dist / maxLen;
}

/**
 * Compute pairwise edit-distance similarity between all docs.
 * Returns similarity[i][j] = how similar doc i is to doc j.
 */
export function computeEditSimilarities(texts: string[]): number[][] {
  const normed = texts.map((t) => normalizeForCompare(t).slice(0, 2000));
  const n = normed.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sim = editDistanceSampled(normed[i], normed[j]);
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }
  return matrix;
}

/** For each doc, compute its edit-based "duplication rate" vs others combined */
export function computeEditRates(editMatrix: number[][]): number[] {
  return editMatrix.map((row, i) => {
    const others = row.filter((_, j) => j !== i);
    if (others.length === 0) return 0;
    return Math.max(...others); // worst-case: most similar to any other
  });
}

// ─────────────────────────────────────────────
//  3. LSH – Locality Sensitive Hashing (MinHash)
// ─────────────────────────────────────────────

const LSH_NUM_HASHES = 128;
const LSH_BANDS = 16;       // num_hashes / rows_per_band = 16 bands of 8
const LSH_ROWS = 8;

// Simple fast hash functions using linear congruential generators
function makeHashFn(a: number, b: number, p: number, m: number): (x: number) => number {
  return (x: number) => ((a * x + b) % p) % m;
}

const PRIME = 2_147_483_647; // Mersenne prime
const HASH_FNS: Array<(x: number) => number> = Array.from({ length: LSH_NUM_HASHES }, (_, i) => {
  const a = (i * 2654435761 + 1) >>> 0 || 1;
  const b = (i * 2246822519 + 7) >>> 0;
  return makeHashFn(a % PRIME, b % PRIME, PRIME, PRIME);
});

function strHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function computeMinHash(ngramSet: Set<string>): Uint32Array {
  const sig = new Uint32Array(LSH_NUM_HASHES).fill(PRIME);
  ngramSet.forEach((gram) => {
    const code = strHashCode(gram);
    for (let k = 0; k < LSH_NUM_HASHES; k++) {
      const h = HASH_FNS[k](code);
      if (h < sig[k]) sig[k] = h;
    }
  });
  return sig;
}

/** Estimate Jaccard similarity from two MinHash signatures */
export function minHashSimilarity(sigA: Uint32Array, sigB: Uint32Array): number {
  let matches = 0;
  for (let k = 0; k < LSH_NUM_HASHES; k++) {
    if (sigA[k] === sigB[k]) matches++;
  }
  return matches / LSH_NUM_HASHES;
}

export interface LSHBucket {
  band: number;
  key: string;
  docs: number[];
}

/** Build LSH index and return candidate pairs (likely similar) */
export function buildLSHIndex(signatures: Uint32Array[]): Set<string> {
  const candidatePairs = new Set<string>();
  // Band-based LSH
  for (let b = 0; b < LSH_BANDS; b++) {
    const buckets: Map<string, number[]> = new Map();
    for (let i = 0; i < signatures.length; i++) {
      const bandSlice = Array.from(signatures[i].slice(b * LSH_ROWS, (b + 1) * LSH_ROWS)).join(',');
      if (!buckets.has(bandSlice)) buckets.set(bandSlice, []);
      buckets.get(bandSlice)!.push(i);
    }
    buckets.forEach((docs) => {
      if (docs.length > 1) {
        for (let x = 0; x < docs.length; x++) {
          for (let y = x + 1; y < docs.length; y++) {
            const key = `${Math.min(docs[x], docs[y])}-${Math.max(docs[x], docs[y])}`;
            candidatePairs.add(key);
          }
        }
      }
    });
  }
  return candidatePairs;
}

export function computeLSHSimilarities(signatures: Uint32Array[]): number[][] {
  const n = signatures.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sim = minHashSimilarity(signatures[i], signatures[j]);
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }
  return matrix;
}

export function computeLSHRates(lshMatrix: number[][]): number[] {
  return lshMatrix.map((row, i) => {
    const others = row.filter((_, j) => j !== i);
    if (others.length === 0) return 0;
    return Math.max(...others);
  });
}

// ─────────────────────────────────────────────
//  4. Repeated Segment Detection (≥ 10 chars)
// ─────────────────────────────────────────────

const MIN_SEGMENT_CHARS = 10; // minimum Chinese chars / tokens

/**
 * Find all continuous repeated segments between textA and textB
 * using a sliding window approach on normalized text.
 * Returns matched segments (from A that appear in B).
 */
export function findRepeatedSegments(
  textA: string,
  textB: string,
  minLen = MIN_SEGMENT_CHARS
): string[] {
  // For CJK: character sliding window; For Latin: word-based
  const useCJK = isCJK(textA) || isCJK(textB);

  if (useCJK) {
    return findCJKSegments(textA, textB, minLen);
  } else {
    return findWordSegments(textA, textB, minLen);
  }
}

function findCJKSegments(textA: string, textB: string, minLen: number): string[] {
  // Strip non-CJK/alphanumeric for matching, but keep original for display
  const cleanA = textA.replace(/\s+/g, '').toLowerCase();
  const cleanB = textB.replace(/\s+/g, '').toLowerCase();

  const results: string[] = [];
  const seen = new Set<string>();

  // Build suffix set of B with position index for fast lookup
  const bSet = new Set<string>();
  // Index all substrings of B of length >= minLen (limited for performance)
  const MAX_B = 5000;
  const bSlice = cleanB.slice(0, MAX_B);
  for (let start = 0; start < bSlice.length - minLen + 1; start++) {
    // Only store segments up to 80 chars for the set
    bSet.add(bSlice.slice(start, start + minLen));
  }

  // Scan A for segments that start a match in B
  const MAX_A = 5000;
  const aSlice = cleanA.slice(0, MAX_A);
  let i = 0;
  while (i < aSlice.length - minLen + 1) {
    const seed = aSlice.slice(i, i + minLen);
    if (bSet.has(seed)) {
      // Extend match as far as possible
      let len = minLen;
      while (
        i + len < aSlice.length &&
        bSlice.includes(aSlice.slice(i, i + len + 1))
      ) {
        len++;
        if (len > 80) break; // cap at 80 chars
      }
      const segment = aSlice.slice(i, i + len);
      if (!seen.has(segment)) {
        seen.add(segment);
        results.push(segment);
      }
      i += len; // skip ahead
    } else {
      i++;
    }
  }

  return results.slice(0, 20);
}

function findWordSegments(textA: string, textB: string, minWords: number): string[] {
  const wordsA = tokenize(textA);
  const wordsB = tokenize(textB);
  const results: string[] = [];
  const seen = new Set<string>();

  // Build a set of word ngrams from B (window = minWords)
  const bWindowSet = new Set<string>();
  for (let j = 0; j <= wordsB.length - minWords; j++) {
    bWindowSet.add(wordsB.slice(j, j + minWords).join(' '));
  }

  let i = 0;
  while (i <= wordsA.length - minWords) {
    const seed = wordsA.slice(i, i + minWords).join(' ');
    if (bWindowSet.has(seed)) {
      let len = minWords;
      while (i + len < wordsA.length) {
        const ext = wordsA.slice(i, i + len + 1).join(' ');
        if (wordsB.join(' ').includes(ext)) {
          len++;
          if (len > 30) break;
        } else break;
      }
      const seg = wordsA.slice(i, i + len).join(' ');
      if (!seen.has(seg)) {
        seen.add(seg);
        results.push(seg);
      }
      i += len;
    } else {
      i++;
    }
  }
  return results.slice(0, 20);
}

// ─────────────────────────────────────────────
//  5. Combined Score
// ─────────────────────────────────────────────

export function combinedScore(ngram: number, edit: number, lsh: number): number {
  // Weighted: N-gram 40%, Edit 30%, LSH 30%
  return ngram * 0.4 + edit * 0.3 + lsh * 0.3;
}
