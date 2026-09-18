#!/usr/bin/env node
/**
 * Generates a bank of original 5x5 Latin Square puzzles in the dMAT style.
 *
 * Each puzzle is a fresh, randomly generated Latin square (no content copied
 * from any copyrighted source). A subset of cells is hidden, one hidden cell
 * is marked as the question ("?"), and we greedily remove clues while
 * verifying — via the same "naked single" elimination logic a test taker
 * would use (a letter is forced when it's the only one missing from its
 * row/column) — that the "?" cell can still be logically deduced.
 *
 * Output: data/latin-squares.json — an array of 20 puzzles.
 *
 * Run: node scripts/generate-latin-squares.js
 */

const fs = require("fs");
const path = require("path");

const SIZE = 5;
const LETTERS = ["A", "B", "C", "D", "E"];
const NUM_QUESTIONS = 20;

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Simple deterministic-seedable PRNG (mulberry32) so runs are reproducible.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLatinSquare(rng) {
  // Start from a cyclic Latin square, then randomize symbols/rows/cols.
  const base = [];
  for (let i = 0; i < SIZE; i++) {
    const row = [];
    for (let j = 0; j < SIZE; j++) {
      row.push(LETTERS[(i + j) % SIZE]);
    }
    base.push(row);
  }

  const symbolMap = shuffle(LETTERS, rng);
  const rowOrder = shuffle([0, 1, 2, 3, 4], rng);
  const colOrder = shuffle([0, 1, 2, 3, 4], rng);

  const grid = [];
  for (let i = 0; i < SIZE; i++) {
    const row = [];
    for (let j = 0; j < SIZE; j++) {
      const srcLetter = base[rowOrder[i]][colOrder[j]];
      const mapped = symbolMap[LETTERS.indexOf(srcLetter)];
      row.push(mapped);
    }
    grid.push(row);
  }
  return grid;
}

// Naked-single elimination fixed point. Returns a NEW grid (nulls kept where
// not deducible). Mutates nothing passed in.
function propagate(partialGrid) {
  const grid = partialGrid.map((row) => row.slice());
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] !== null) continue;
        const used = new Set();
        for (let k = 0; k < SIZE; k++) {
          if (grid[r][k]) used.add(grid[r][k]);
          if (grid[k][c]) used.add(grid[k][c]);
        }
        const candidates = LETTERS.filter((l) => !used.has(l));
        if (candidates.length === 1) {
          grid[r][c] = candidates[0];
          changed = true;
        }
      }
    }
  }
  return grid;
}

function isDeducible(partialGrid, targetR, targetC) {
  const result = propagate(partialGrid);
  return result[targetR][targetC] !== null;
}

function buildPuzzle(rng, targetClueCount) {
  const solution = randomLatinSquare(rng);

  const qR = Math.floor(rng() * SIZE);
  const qC = Math.floor(rng() * SIZE);

  // Start fully revealed except the question cell.
  const allCells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (r === qR && c === qC) continue;
      allCells.push([r, c]);
    }
  }

  const revealed = new Set(allCells.map(([r, c]) => `${r},${c}`));

  function buildPartial(revealedSet) {
    const grid = [];
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) {
        if (r === qR && c === qC) {
          row.push(null);
        } else {
          row.push(revealedSet.has(`${r},${c}`) ? solution[r][c] : null);
        }
      }
      grid.push(row);
    }
    return grid;
  }

  // Greedily try to remove clues (in random order) while keeping the "?"
  // cell deducible, stopping once we hit the target clue count.
  const order = shuffle(allCells, rng);
  for (const [r, c] of order) {
    if (revealed.size <= targetClueCount) break;
    const key = `${r},${c}`;
    revealed.delete(key);
    const partial = buildPartial(revealed);
    if (!isDeducible(partial, qR, qC)) {
      // Can't remove this one without breaking deducibility; put it back.
      revealed.add(key);
    }
  }

  const finalGrid = buildPartial(revealed);
  // Sanity check.
  if (!isDeducible(finalGrid, qR, qC)) {
    throw new Error("Generated puzzle is not deducible — this should not happen.");
  }

  const displayGrid = finalGrid.map((row) => row.slice());
  displayGrid[qR][qC] = "?";

  return {
    grid: displayGrid,
    questionRow: qR,
    questionCol: qC,
    answer: solution[qR][qC],
    options: LETTERS.slice(),
    clueCount: revealed.size,
  };
}

function main() {
  const seed = 20260917; // fixed seed -> reproducible puzzle bank
  const rng = mulberry32(seed);

  // Ramp difficulty across the 20 questions, similar to the real exam's
  // structure (few low, several medium, several high difficulty items).
  // Difficulty here = fewer starting clues = more deduction steps needed.
  const difficultyPlan = [
    ...Array(6).fill({ level: "low", target: 15 }),
    ...Array(8).fill({ level: "medium", target: 10 }),
    ...Array(6).fill({ level: "high", target: 6 }),
  ];

  const puzzles = [];
  for (let i = 0; i < NUM_QUESTIONS; i++) {
    const plan = difficultyPlan[i];
    let puzzle;
    let attempts = 0;
    do {
      puzzle = buildPuzzle(rng, plan.target);
      attempts++;
    } while (puzzle.clueCount > plan.target + 4 && attempts < 5);
    puzzles.push({
      id: i + 1,
      difficulty: plan.level,
      ...puzzle,
    });
  }

  const outPath = path.join(__dirname, "..", "data", "latin-squares.json");
  fs.writeFileSync(outPath, JSON.stringify(puzzles, null, 2));
  console.log(`Wrote ${puzzles.length} puzzles to ${outPath}`);
  console.log(
    "Clue counts:",
    puzzles.map((p) => p.clueCount).join(", ")
  );
}

main();
