import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COLORS, HOME_LANES, SAFE_TRACK, TRACK, pawnPosition } from '../engine.js';

const svg = await readFile(new URL('../assets/boards/nstar-board.svg', import.meta.url), 'utf8');

test('NStar board wells and home lanes align with the shared rules engine', () => {
  for (const color of Object.keys(COLORS)) {
    for (let pawn = 0; pawn < 4; pawn++) {
      const [row, col] = pawnPosition(color, pawn, -1);
      assert.ok(svg.includes(`<circle cx="${(col + .5) * 100}" cy="${(row + .5) * 100}" r="51"`), `${color} yard well ${pawn + 1} must align`);
    }
    for (const [row,col] of HOME_LANES[color]) {
      assert.ok(svg.includes(`x="${col * 100 + 1}" y="${row * 100 + 1}" width="98" height="98" rx="8" fill="url(#${color}lane)"`), `${color} home lane at ${row},${col} must align`);
    }
  }
});

test('all safe spaces are marked on the NStar board', () => {
  for (const index of SAFE_TRACK) {
    const [row,col] = TRACK[index];
    const cx = (col + .5) * 100, cy = (row + .5) * 100;
    const isEntry = Object.values(COLORS).some(color => color.start === index);
    const marker = isEntry ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="24"` : `<polygon points="${cx.toFixed(1)},${(cy - 29).toFixed(1)}`;
    assert.ok(svg.includes(marker), `safe track index ${index} must be visibly marked`);
  }
});
