import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
// @ts-ignore (flubber ships no types in some setups)
import { toCircle } from 'flubber';

const FOREST = '#f3faf9'; // splash background
const LEAF = '#0c0c0c'; // N and text
const AMBER = '#6347ee'; // the dot
const LOGO_SCALE = 0.65; // 1 = current size. Lower = smaller.

const LETTERS = ['e', 's', 't', 'l', 'y'];
const N_START_SCALE = 1.5; // the N opens big, then shrinks to make room for "estly"
const DOT_GROW = 1.5; // size the dot grows to once it is alone
const BASELINE_NUDGE = 0; // if the N sits a bit high/low next to the text, change this (in 1/100 of font size)
const N_MORPH_MS = 600; // how long the N takes to turn into the dot
const ERASE = 'pull' as 'pull' | 'drop' | 'rise' | 'flip' | 'hop' | 'zoom' | 'squash'; // how "estly" disappears
// The N is the font's OWN N: its real outline, taken from each font file, so it matches the letters exactly.
//   d     = the N's outline (units are 1/100 of the font size, origin at the N's top-left corner)
//   w, h  = the N's width and height in those units
//   gap   = the font's natural space between the N and the "e"
//   tight = how much closer the letters sit (fraction of font size; 0 = font's own spacing)
//   thick = extra thickness for the N and the letters (fraction of font size; 0 = off, 0.02 = thicker, 0.04 = very thick)
const N_STYLES = {
  jakarta: { d: 'M0 74.5V0H11.9L45.5 44.3V0H61V74.5H49L15.5 29.2V74.5Z', w: 61.0, h: 74.5, gap: 9.9, tight: 0.045, thick: 0.01 }, // Plus Jakarta Sans
  dela: { d: 'M83.9 0Q83.2 16.9 83.2 36.2Q83.2 55.6 83.9 72.5H48.1L23.9 17.9L25.7 72.5H0Q0.8 53.1 0.8 36.2Q0.8 19.4 0 0H36.8L61.1 56.1L59.4 0Z', w: 83.9, h: 72.5, gap: 7.0, tight: 0.005, thick: 0 }, // Dela Gothic One (already very heavy)
  syne: { d: 'M61.4 47.4V0H74.7V64.7H61.4L13.3 17.7V64.7H0V0H13.3Z', w: 74.7, h: 64.7, gap: 2.5, tight: 0.001, thick: 0.04 }, // Syne Bold
};
const N_LOOK: keyof typeof N_STYLES = 'syne'; // which font the whole wordmark uses (N and "estly" both follow this)
const { d: N_PATH, w: NW, h: NH, gap: N_GAP, tight: TIGHTEN, thick: THICKEN_PX } = N_STYLES[N_LOOK];

// "estly" is drawn from the same font files as the N: each letter is its real outline (units are 1/100 of the font
// size, origin at the N's top-left corner, so the baseline sits at y = NH). Drawing the letters as shapes instead of
// text is what lets each one pop in on its own.
//   adv  = how far to move along to the next letter (kerning included)
//   d    = the letter's outline (the "e" includes its hole)
//   head = how far the tallest letter pokes above the N's top, desc = how far the "y" hangs below the baseline
type Glyph = { adv: number; d: string };
const LETTER_SHAPES: Record<keyof typeof N_STYLES, { head: number; desc: number; glyphs: Glyph[] }> = {
  jakarta: {
    head: 1.2,
    desc: 22.0,
    glyphs: [
      { adv: 61.1, d: 'M31.8 75.7Q23.1 75.7 16.7 71.8Q10.3 68 6.8 61.5Q3.3 55 3.3 47.1Q3.3 38.9 7 32.5Q10.6 26.1 16.8 22.4Q23 18.7 30.8 18.7Q37.3 18.7 42.3 20.7Q47.3 22.8 50.8 26.5Q54.2 30.2 56 35Q57.8 39.9 57.8 45.6Q57.8 47.2 57.7 48.8Q57.5 50.3 57.1 51.4H18.9Q19.1 53.5 19.9 55.3Q21.4 58.8 24.5 60.8Q27.6 62.7 32 62.7Q36 62.7 38.9 61.1Q41.7 59.5 43.3 56.7L55.3 62.4Q53.7 66.4 50.2 69.4Q46.8 72.4 42.1 74.1Q37.4 75.7 31.8 75.7Z M19.2 40.4H41.9Q41.8 39.1 41.4 37.9Q40.3 34.6 37.6 32.6Q34.8 30.7 30.8 30.7Q26.9 30.7 24.1 32.6Q21.3 34.5 19.9 38.2Q19.5 39.2 19.2 40.4Z' }, // e
      { adv: 51.5, d: 'M26.9 75.7Q17.9 75.7 11.3 71.5Q4.6 67.2 2.2 60L13.2 54.8Q15.3 59.2 18.9 61.7Q22.5 64.2 26.9 64.2Q30.1 64.2 31.8 62.9Q33.5 61.6 33.5 59.3Q33.5 58.1 32.9 57.2Q32.3 56.4 31.1 55.7Q29.9 55 28.1 54.5L18.8 51.9Q12.1 50 8.5 45.8Q4.9 41.5 4.9 35.7Q4.9 30.6 7.5 26.8Q10.1 23 14.8 20.8Q19.5 18.7 25.6 18.7Q33.6 18.7 39.7 22.4Q45.7 26.2 48.2 33L37.1 38.2Q35.9 34.8 32.8 32.8Q29.6 30.7 25.6 30.7Q22.7 30.7 21.1 31.9Q19.4 33.1 19.4 35.2Q19.4 36.3 20 37.2Q20.6 38.1 22 38.8Q23.3 39.5 25.3 40.1L34 42.7Q40.8 44.7 44.4 48.8Q48 52.8 48 58.7Q48 63.8 45.4 67.6Q42.7 71.4 38 73.6Q33.3 75.7 26.9 75.7Z' }, // s
      { adv: 42.1, d: 'M31.8 75.1Q21.9 75.1 16.5 69.8Q11 64.4 11 54.8V32.9H1.8V19.9H2.3Q6.5 19.9 8.8 17.8Q11 15.7 11 11.5V7.5H26V19.9H38.8V32.9H26V53.8Q26 56.6 27 58.4Q28 60.3 30.1 61.2Q32.2 62.1 35.3 62.1Q36 62.1 36.9 62Q37.8 61.9 38.8 61.8V74.5Q37.3 74.7 35.4 74.9Q33.5 75.1 31.8 75.1Z' }, // t
      { adv: 26.0, d: 'M5.5 74.5V-1.2H20.5V74.5Z' }, // l
      { adv: 60.2, d: 'M14 96.5Q11.6 96.5 9.4 96.1Q7.1 95.7 5.4 94.8V82.5Q6.8 82.9 8.7 83.2Q10.6 83.5 12.2 83.5Q16.6 83.5 18.5 81.5Q20.4 79.4 21.6 76.8L22.6 74.5L1.1 19.9H17.2L30.1 55L43 19.9H59.1L35.7 79.6Q33.5 85.2 30.3 89Q27.1 92.8 23.1 94.7Q19 96.5 14 96.5Z' }, // y
    ],
  },
  dela: {
    head: 5.5,
    desc: 26.2,
    glyphs: [
      { adv: 72.5, d: 'M24.3 47.5Q25.1 51.9 28.2 54.6Q31.4 57.4 37.2 57.4Q41.4 57.4 45.1 55.8Q48.8 54.1 51 51.1Q57.7 54.4 68.8 58.2Q65.7 65.2 57.6 69.3Q49.4 73.5 36.3 73.5Q19.3 73.5 11.2 65.7Q3 57.8 3 45Q3 32.5 11.1 24.7Q19.2 16.9 36.3 16.9Q46.5 16.9 54 20.3Q61.5 23.7 65.5 29.7Q69.5 35.8 69.5 43.6Q69.5 46.2 69.3 47.5Z M25 39.1H48.6Q47.4 35.9 44.7 34Q42 32 37.7 32Q32.7 32 29.5 33.9Q26.3 35.8 25 39.1Z' }, // e
      { adv: 68.9, d: 'M3 64 13.5 49.7Q18.1 53 24.6 54.9Q31.1 56.7 35.8 56.7Q40.3 56.7 42.8 55.5Q45.2 54.2 45.2 52.2Q45.2 50.6 44 49.7Q42.8 48.8 40.7 48.8Q39.4 48.8 37.8 48.9Q36.1 49 35.1 49.1Q29.9 49.7 24.4 49.7Q15.5 49.7 9.9 46.4Q4.4 43 4.4 35.4Q4.4 26.6 12.7 21.7Q21 16.9 37.1 16.9Q45 16.9 53 19.1Q61.1 21.4 67.3 25.9L55.8 37.5Q50.1 34.5 45.2 33.2Q40.2 32 35.2 32Q31.7 32 29.2 33.4Q26.7 34.8 26.7 36.6Q26.7 38 27.8 38.8Q28.8 39.6 30.5 39.6Q32.2 39.6 35.2 39.3Q42.5 38.8 46.1 38.8Q56.5 38.8 62.2 42.3Q67.9 45.8 67.9 53Q67.9 63.8 59.5 68.7Q51.1 73.5 36.3 73.5Q27.9 73.5 19.2 71.2Q10.6 68.8 3 64Z' }, // s
      { adv: 51.3, d: 'M49.3 35.8Q40.1 35.2 32.5 34.9L32.4 45.5Q32.4 50.9 34.8 54Q37.1 57 43.1 57Q45.4 57 47.5 56.6Q47.1 60.3 47.1 64.1Q47.1 65.9 47.3 72.3Q42.9 73.1 39.9 73.3Q36.9 73.5 32.1 73.5Q20.4 73.5 15.6 67.8Q10.7 62.2 10.7 52.1L10.8 35.2Q6.1 35.4 1 35.8V18.1Q6.2 18.1 9.8 14.8Q13.4 11.5 14.1 6.9H41.3Q36.2 13.9 30 18.1H49.3Z' }, // t
      { adv: 31.6, d: 'M27.4 50.9Q27.4 65.8 27.6 72.5H4L4.1 61.2Q4.3 42.6 4.3 32.5Q4.3 22.9 4.1 5.3L4 -5.5H27.6Q27.4 8.7 27.4 17.7Q27.4 27.7 27.5 32.5Q27.4 38.5 27.4 50.9Z' }, // l
      { adv: 69.8, d: 'M69.8 17.9 67.5 23.7Q58 49 47.6 72.5Q42.2 84.5 32 91.8Q21.8 99 6.4 98.7Q4.5 90.4 3.2 85.8Q2 81.1 0 76.4Q5.5 77.7 10.3 77.7Q18.1 77.7 22.7 74.4Q19.1 63.7 14.2 51.4Q9.3 39.1 0 17.9H23.7Q24.9 22.9 27 29.5Q29.1 36.1 31.2 42.2Q31.8 44.1 33.1 47.9Q34.5 51.8 35.3 54.4L37.9 46.5Q45.4 24.8 46.8 17.9Z' }, // y
    ],
  },
  syne: {
    head: 5.0,
    desc: 20.0,
    glyphs: [
      { adv: 67.8, d: 'M51.3 48.2H63.9Q63.1 53.3 59.7 57.3Q56.2 61.3 50.3 63.6Q44.4 65.9 35.9 65.9Q26.4 65.9 19.1 62.9Q11.8 59.8 7.7 54Q3.6 48.2 3.6 40Q3.6 31.8 7.6 26Q11.6 20.1 18.8 17Q25.9 13.9 35.5 13.9Q45.3 13.9 51.8 17Q58.3 20.1 61.5 26.4Q64.6 32.6 64.1 42.3H16.7Q17.2 46.1 19.6 49.2Q21.9 52.3 26 54.1Q30 55.9 35.6 55.9Q41.8 55.9 46 53.8Q50.1 51.6 51.3 48.2Z M34.9 23.8Q27.7 23.8 23.2 26.9Q18.7 30.1 17.4 34.7H51.2Q50.7 29.7 46.5 26.8Q42.2 23.8 34.9 23.8Z' }, // e
      { adv: 56.4, d: 'M4 48.2H16Q17.1 51.6 20.6 53.8Q24 55.9 29.6 55.9Q33.4 55.9 35.5 55.2Q37.6 54.5 38.4 53.2Q39.2 51.8 39.2 50.1Q39.2 48 37.9 46.9Q36.6 45.7 33.9 45Q31.2 44.3 27 43.7Q22.8 43 18.9 42Q15 41 12 39.4Q9 37.7 7.2 35.2Q5.5 32.6 5.5 28.9Q5.5 25.3 7.2 22.5Q9 19.7 12.2 17.8Q15.3 15.9 19.6 14.9Q23.8 13.9 28.7 13.9Q36.1 13.9 41 16.1Q45.9 18.2 48.4 22.1Q50.8 25.9 50.8 30.9H39.3Q38.5 27.2 36.1 25.6Q33.7 23.9 28.7 23.9Q23.8 23.9 21.3 25.4Q18.8 26.9 18.8 29.5Q18.8 31.6 20.4 32.8Q21.9 33.9 25 34.6Q28 35.3 32.6 36.1Q36.5 36.9 40 37.9Q43.6 38.9 46.4 40.5Q49.2 42 50.9 44.5Q52.5 47.1 52.5 51Q52.5 55.8 49.8 59.1Q47 62.4 41.9 64.2Q36.8 65.9 29.7 65.9Q23.4 65.9 18.9 64.6Q14.3 63.2 11.3 61.1Q8.3 58.9 6.7 56.5Q5 54 4.4 51.8Q3.8 49.6 4 48.2Z' }, // s
      { adv: 43.4, d: 'M2.5 15H15.3V1.4H28.3V15H41.1V25.1H28.3V64.7H15.3V25.1H2.5Z' }, // t
      { adv: 27.1, d: 'M7 -5H20V64.7H7Z' }, // l
      { adv: 63.9, d: 'M1.5 15H15.3L31.7 51.5L48.4 15H62.3L27.9 84.7H14.4L25.4 64.2Z' }, // y
    ],
  },
};
const SHAPES = LETTER_SHAPES[N_LOOK];
const GLYPHS = SHAPES.glyphs;
// where each letter starts, in the same 1/100 units (each letter pulled in a little by TIGHTEN)
const PEN_X = GLYPHS.map((_, i) => GLYPHS.slice(0, i).reduce((sum, g) => sum + g.adv - TIGHTEN * 100, 0));
const WORD_W = PEN_X[PEN_X.length - 1] + GLYPHS[GLYPHS.length - 1].adv;
const GLYPH_PAD = 4; // room around each letter so the thick edge is not cut off

// ---- SPEED: all the timings in milliseconds. Lower = faster. ----
const START_DELAY = 100; // pause before anything happens
const N_DRAW_MS = 450; // the N writing itself in
const N_HOLD_MS = 150; // the big N stays for a moment
const SHRINK_MS = 600; // the N shrinks and slides left
const POP_MS = 560; // how long each letter of "estly" takes to pop in
const POP_STAGGER = 220; // gap between one letter starting to pop and the next
const POP_OVERSHOOT = 1.7; // how far a letter bounces past its size before it settles (0 = no bounce, 3 = very bouncy)
const READ_MS = 450; // "Nestly" stays on screen before it goes away
const ERASE_MS = 460; // how long each letter takes to go (it eases to a soft stop at the N)
const ERASE_STAGGER = 80; // gap between one letter starting and the next

// ---------------------------------------------------------------------------------------------------
// ONE CLOCK. Instead of chaining dozens of little animations (each one waiting on the JavaScript thread to start
// the next, which falls apart when the phone hitches), everything is placed on a single timeline. One clock runs
// on the phone's UI thread, and every property just reads "where should I be at this time?". If the phone lags,
// frames are skipped but nothing can drift out of sync or start late.
// ---------------------------------------------------------------------------------------------------
type Ease = (x: number) => number;
type Seg = { at: number; ms: number; to: number; ease?: Ease };
type Track = { node: Animated.AnimatedInterpolation<number>; at: (x: number) => number };

const makeTrack = (clock: Animated.Value, from: number, segs: Seg[]): Track => {
  const ins: number[] = [0];
  const outs: number[] = [from];
  let cur = from;
  let last = 0;
  const push = (t: number, o: number) => {
    ins.push(Math.max(t, ins[ins.length - 1] + 0.001)); // always strictly increasing
    outs.push(o);
  };
  [...segs]
    .sort((a, b) => a.at - b.at)
    .forEach((s) => {
      const at = Math.max(s.at, last);
      if (at > last) push(at, cur); // hold the value until this move starts
      const n = s.ms <= 2 ? 1 : 12;
      const ease = s.ease ?? ((x: number) => x);
      for (let k = 1; k <= n; k++) push(at + (s.ms * k) / n, cur + (s.to - cur) * ease(k / n));
      cur = s.to;
      last = at + s.ms;
    });
  if (ins.length < 2) push(1, from);
  const valueAt = (x: number) => {
    if (x <= ins[0]) return outs[0];
    for (let i = 1; i < ins.length; i++) {
      if (x <= ins[i]) return outs[i - 1] + ((outs[i] - outs[i - 1]) * (x - ins[i - 1])) / (ins[i] - ins[i - 1]);
    }
    return outs[outs.length - 1];
  };
  return { node: clock.interpolate({ inputRange: ins, outputRange: outs, extrapolate: 'clamp' }), at: valueAt };
};

// Lays out the whole animation. dx/dy = where the lockup sits when the N is alone in the middle of the screen.
const buildTimeline = (clock: Animated.Value, F: number, dx: number, dy: number, oh: number, topY: number) => {
  const segs: Record<string, Seg[]> = {};
  const add = (name: string, at: number, ms: number, to: number, ease?: Ease) => {
    (segs[name] = segs[name] || []).push({ at, ms, to, ease });
  };
  const ease = Easing.bezier(0.65, 0, 0.25, 1);
  const outCubic = Easing.out(Easing.cubic);
  const outQuad = Easing.out(Easing.quad);
  const inQuad = Easing.in(Easing.quad);
  const inCubic = Easing.in(Easing.cubic);
  const soft = Easing.bezier(0.45, 0, 0.15, 1); // gathers speed, then lands softly

  // 1. The N writes itself in, left to right.
  let tm = START_DELAY;
  add('draw', tm, N_DRAW_MS, 1, ease);
  tm += N_DRAW_MS + N_HOLD_MS;

  // 2. The N shrinks and slides left, making room for "estly".
  add('nScale', tm, SHRINK_MS, 1, ease);
  add('lockupX', tm, SHRINK_MS, 0, ease);
  add('lockupY', tm, SHRINK_MS, 0, ease);
  tm += SHRINK_MS + 60;

  // 2b. "estly" pops in one letter at a time: each letter grows from nothing, goes a little past its size, then settles.
  LETTERS.forEach((_, i) => add(`op${i}`, tm, 1, 1));
  tm += 1;
  const pop = Easing.out(Easing.back(POP_OVERSHOOT));
  LETTERS.forEach((_, i) => add(`s${i}`, tm + i * POP_STAGGER, POP_MS, 1, pop));
  tm += (LETTERS.length - 1) * POP_STAGGER + POP_MS + READ_MS;

  // 3. "estly" goes away (see ERASE at the top). Returns the time that letter finishes.
  const addErase = (i: number, base: number) => {
    const op = `op${i}`;
    const X = `x${i}`;
    const Y = `y${i}`;
    const S = `s${i}`;
    const R = `r${i}`;
    const from = (order: number) => base + order * ERASE_STAGGER;
    const back = LETTERS.length - 1 - i; // order starting from the y
    let at = from(back);
    switch (ERASE) {
      case 'pull': // slide back into the N, slowing down as it arrives, starting with the e
        at = from(i);
        add(op, at, ERASE_MS, 0, inQuad);
        add(X, at, ERASE_MS, -F * 0.55 * (i + 1), soft);
        add(S, at, ERASE_MS, 0.2, soft);
        break;
      case 'drop':
        add(op, at, ERASE_MS, 0, inCubic);
        add(Y, at, ERASE_MS, F * 0.6, inCubic);
        add(S, at, ERASE_MS, 0.6, inCubic);
        break;
      case 'rise':
        add(op, at, ERASE_MS, 0, inCubic);
        add(Y, at, ERASE_MS, -F * 0.6, inCubic);
        add(S, at, ERASE_MS, 0.6, inCubic);
        break;
      case 'flip':
        add(op, at, ERASE_MS, 0, inCubic);
        add(R, at, ERASE_MS, 1, inCubic);
        break;
      case 'hop':
        add(Y, at, 150, -F * 0.22, outQuad);
        add(Y, at + 150, 230, F * 0.15, inQuad);
        add(S, at + 150, 230, 0, inQuad);
        add(op, at + 150, 230, 0, inQuad);
        return at + 380;
      case 'zoom':
        at = from(i * 0.4); // almost together
        add(op, at, ERASE_MS, 0, inCubic);
        add(S, at, ERASE_MS, 2.2, inCubic);
        break;
      case 'squash':
        at = from(i);
        add(op, at, ERASE_MS, 0, inCubic);
        add(S, at, ERASE_MS, 0.01, inCubic);
        break;
    }
    return at + ERASE_MS;
  };
  let eraseEnd = tm;
  LETTERS.forEach((_, i) => {
    eraseEnd = Math.max(eraseEnd, addErase(i, tm));
  });
  tm = eraseEnd + 60;

  // 4. The N itself turns into a circle (drawn on the JS side), then the dot swells with a little bump.
  const morphA = tm;
  add('morph', tm, N_MORPH_MS, 1, Easing.bezier(0.6, 0, 0.2, 1));
  tm += N_MORPH_MS;
  add('dotOp', tm, 90, 1);
  add('dotScale', tm, 140, 1.35, outCubic);
  add('nOp', tm + 140, 1, 0);
  add('dotScale', tm + 141, 170, 1, outCubic);
  tm += 141 + 170 + 200;

  // 5. The dot glides to the middle of the screen and grows.
  add('lockupX', tm, 750, dx, ease);
  add('lockupY', tm, 750, dy, ease);
  tm += 750;
  add('dotScale', tm, 290, DOT_GROW * 1.15, outCubic);
  tm += 290;
  add('dotScale', tm, 190, DOT_GROW, ease);
  tm += 190;

  // 6. Down, back up, then to the top.
  const squash = (at: number, sx: number, sy: number, ms: number, e: Ease) => {
    add('dotSX', at, ms, sx, e);
    add('dotSY', at, ms, sy, e);
  };
  squash(tm, 1.16, 0.84, 170, outQuad);
  tm += 170;
  const fallEase = Easing.bezier(0.55, 0, 1, 0.45);
  add('dotY', tm, 480, oh * 0.2, fallEase);
  squash(tm, 0.9, 1.14, 480, fallEase);
  tm += 480;
  squash(tm, 1.4, 0.62, 110, outQuad);
  tm += 110;
  const upEase = Easing.bezier(0.2, 0.7, 0.3, 1);
  add('dotY', tm, 480, -oh * 0.035, upEase);
  squash(tm, 0.92, 1.12, 480, upEase);
  tm += 480;
  add('dotY', tm, 220, 0, ease);
  squash(tm, 1, 1, 220, ease);
  tm += 220 + 140;
  add('dotY', tm, 820, topY - oh / 2, Easing.bezier(0.65, 0, 0.2, 1));
  squash(tm, 0.94, 1.1, 400, outQuad);
  squash(tm + 400, 1, 1, 420, outQuad);
  tm += 820;

  // 7. The dot becomes a window: it grows until it covers the screen, and the app is visible inside it.
  const holeA = tm;
  add('dotOp', tm, 140, 0);
  add('hole', tm, 1200, 1, Easing.bezier(0.76, 0, 0.16, 1));
  tm += 1200;

  const t = (name: string, from: number) => makeTrack(clock, from, segs[name] || []);
  return {
    total: tm,
    morphA,
    morphB: morphA + N_MORPH_MS,
    holeA,
    morph: t('morph', 0),
    hole: t('hole', 0),
    draw: t('draw', 0).node,
    lockupX: t('lockupX', dx).node,
    lockupY: t('lockupY', dy).node,
    nScale: t('nScale', N_START_SCALE).node,
    nOpacity: t('nOp', 1).node,
    dotOpacity: t('dotOp', 0).node,
    dotScale: t('dotScale', 1).node,
    dotY: t('dotY', 0).node,
    dotSX: t('dotSX', 1).node,
    dotSY: t('dotSY', 1).node,
    letterOp: LETTERS.map((_, i) => t(`op${i}`, 0).node),
    letterX: LETTERS.map((_, i) => t(`x${i}`, 0).node),
    letterY: LETTERS.map((_, i) => t(`y${i}`, 0).node),
    letterS: LETTERS.map((_, i) => t(`s${i}`, 0.001).node),
    letterR: LETTERS.map((_, i) => t(`r${i}`, 0).node),
  };
};

type Props = {
  visible: boolean;
  onReveal?: () => void; // fires when the round window starts opening onto your app
  onFinished?: () => void; // fires when the window covers the whole screen
};

// Where the dot ends up (topY) and how big the circle must be to cover the screen from there (R).
const revealGeometry = (ow: number, oh: number) => {
  const topY = Math.max(64, oh * 0.11);
  const R = Math.hypot(ow / 2, Math.max(topY, oh - topY)) + 8;
  return { topY, R };
};

type Lay = { lw: number; lh: number; nx: number; ny: number; ow: number; oh: number };

export default function NestlyLoader({ visible, onReveal, onFinished }: Props) {
  const { width: winW } = useWindowDimensions();
  const F = Math.min(winW * 0.17, 120) * LOGO_SCALE; // wordmark font size
  const u = F / 100; // 1 unit = 1% of the font size; the N and the letters are drawn in these units

  const [lay, setLay] = useState<Lay | null>(null);
  const measured = useRef({ lw: 0, lh: 0, nx: -1, ny: -1, ow: 0, oh: 0 });
  // These shapes change on every frame, so they are updated directly (setNativeProps) instead of re-rendering
  // the whole loader 60 times a second. That is what keeps it smooth on slower phones.
  const nPathRef = useRef<any>(null); // the N's outline (it turns into a circle)
  const holePathRef = useRef<any>(null); // the cover with the round window
  const startedRef = useRef(false); // once the animation has started, later layout changes must not restart it
  const clockRef = useRef(new Animated.Value(0));
  const clock = clockRef.current; // the one clock (milliseconds)

  // Keep the latest callbacks in refs so a new inline function never restarts the animation.
  const onRevealRef = useRef(onReveal);
  const onFinishedRef = useRef(onFinished);
  onRevealRef.current = onReveal;
  onFinishedRef.current = onFinished;

  const commit = () => {
    if (startedRef.current) return;
    const c = measured.current;
    if (c.lw > 0 && c.nx >= 0 && c.ow > 0) {
      setLay((p) =>
        p && p.lw === c.lw && p.lh === c.lh && p.nx === c.nx && p.ny === c.ny && p.ow === c.ow && p.oh === c.oh
          ? p
          : { ...c }
      );
    }
  };
  const onOverlayLayout = (e: LayoutChangeEvent) => {
    measured.current.ow = e.nativeEvent.layout.width;
    measured.current.oh = e.nativeEvent.layout.height;
    commit();
  };
  const onLockupLayout = (e: LayoutChangeEvent) => {
    measured.current.lw = e.nativeEvent.layout.width;
    measured.current.lh = e.nativeEvent.layout.height;
    commit();
  };
  const onNLayout = (e: LayoutChangeEvent) => {
    measured.current.nx = e.nativeEvent.layout.x;
    measured.current.ny = e.nativeEvent.layout.y;
    commit();
  };

  // Where the lockup sits while the N is alone in the middle, and the whole timeline built from that.
  const dotD0 = 24 * u;
  const geo = lay ? revealGeometry(lay.ow, lay.oh) : { topY: 0, R: 0 };
  const dx = lay ? lay.lw / 2 - (lay.nx + (NW / 2) * u) : 0; // moves the lockup so the N's centre is mid-screen
  const dy = lay ? lay.lh / 2 - (lay.ny + (NH / 2) * u) : 0;
  const tl = useMemo(
    () => buildTimeline(clock, F, dx, dy, lay ? lay.oh : 0, geo.topY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clock, F, dx, dy, lay ? lay.oh : 0, geo.topY]
  );

  useEffect(() => {
    if (!visible) {
      startedRef.current = false;
      return;
    }
    if (!lay) return;

    const { ow, oh } = lay;
    const { topY, R } = geo;
    const r0 = (dotD0 * DOT_GROW) / 2; // the window starts exactly as big as the dot
    const coverD = `M0 0H${ow}V${oh}H0Z`;
    const holeD = (r: number) =>
      coverD + (r > 0 ? `M${ow / 2 - r} ${topY}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z` : '');

    // ---- start state ----
    clock.setValue(0);
    nPathRef.current?.setNativeProps({ d: N_PATH });
    holePathRef.current?.setNativeProps({ d: coverD });

    // The N's outline and the round window are redrawn on the JS side, following the clock. They only
    // do work while their part of the timeline is running.
    const toDot = toCircle(N_PATH, NW / 2, NH / 2, 12, { maxSegmentLength: 4 });
    let morphDone = false;
    let revealed = false;
    const sub = clock.addListener(({ value }) => {
      if (value >= tl.morphA && !morphDone) {
        const p = tl.morph.at(value);
        nPathRef.current?.setNativeProps({ d: p <= 0 ? N_PATH : toDot(Math.min(1, p)) });
        if (value >= tl.morphB) morphDone = true;
      }
      if (value >= tl.holeA) {
        const p = tl.hole.at(value);
        holePathRef.current?.setNativeProps({ d: holeD(r0 + (R - r0) * p) });
        if (!revealed && p > 0) {
          revealed = true;
          onRevealRef.current?.(); // your app is starting to show
        }
      }
    });

    // wait two frames so the first layout has settled before anything moves
    let raf2 = 0;
    const anim = Animated.timing(clock, {
      toValue: tl.total,
      duration: tl.total,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        startedRef.current = true;
        anim.start(({ finished }) => {
          if (!finished) return;
          holePathRef.current?.setNativeProps({ d: holeD(R + 2) });
          onFinishedRef.current?.();
        });
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      anim.stop();
      clock.removeListener(sub);
    };
  }, [visible, lay, tl, clock]);

  if (!visible) return null;

  // ---- the N is drawn from the font's own outline (N_PATH). 1 unit = u pixels. ----
  const PAD = 4; // room around the N so its thickened edge is not cut off
  const boxW = (NW + 2 * PAD) * u;
  const boxH = (NH + 2 * PAD) * u;
  const dotD = dotD0;
  const reveal = lay ? { ow: lay.ow, oh: lay.oh, ...revealGeometry(lay.ow, lay.oh) } : null;
  const dotComp = tl.dotSY.interpolate({ inputRange: [0, 1], outputRange: [(dotD * DOT_GROW) / 2, 0] });
  // the writing-in effect: a window slides in from the left while the N slides the opposite way, so the N
  // stays put and is uncovered from left to right
  const wipeWindowX = tl.draw.interpolate({ inputRange: [0, 1], outputRange: [-boxW, 0] });
  const wipeInnerX = tl.draw.interpolate({ inputRange: [0, 1], outputRange: [boxW, 0] });
  // every letter gets the same drawing box: room above for tall letters, below for the y, GLYPH_PAD at the sides
  const gTop = SHAPES.head + GLYPH_PAD;
  const gBottom = SHAPES.desc + GLYPH_PAD;
  // the N and the word both sit on the baseline by the same rule (same height, same bottom margin)
  const baselineMargin = (BASELINE_NUDGE - THICKEN_PX * 50) * u; // thickened letters hang a little below the baseline

  return (
    <Animated.View
      pointerEvents="auto" // the loader catches every tap, so nothing underneath can be touched while it plays
      onStartShouldSetResponder={() => true}
      onLayout={onOverlayLayout}
      style={[styles.overlay, { opacity: 1, backgroundColor: reveal ? 'transparent' : FOREST }]}
    >
      {reveal && (
        <Svg pointerEvents="none" width={reveal.ow} height={reveal.oh} style={styles.fill}>
          <Path ref={holePathRef} fill={FOREST} fillRule="evenodd" d={`M0 0H${reveal.ow}V${reveal.oh}H0Z`} />
        </Svg>
      )}
      <Animated.View
        onLayout={onLockupLayout}
        style={[
          styles.lockup,
          { transform: [{ translateX: tl.lockupX }, { translateY: tl.lockupY }] },
        ]}
      >
        <Animated.View
          onLayout={onNLayout}
          style={{
            width: NW * u,
            height: NH * u,
            marginRight: (N_GAP - TIGHTEN * 100) * u,
            marginBottom: baselineMargin,
            transform: [{ scale: tl.nScale }],
          }}
        >
          <Animated.View
            style={{
              position: 'absolute',
              left: -PAD * u,
              top: -PAD * u,
              width: boxW,
              height: boxH,
              overflow: 'hidden',
              opacity: tl.nOpacity,
              transform: [{ translateX: wipeWindowX }],
            }}
          >
            <Animated.View style={{ width: boxW, height: boxH, transform: [{ translateX: wipeInnerX }] }}>
              <Svg width={boxW} height={boxH} viewBox={`${-PAD} ${-PAD} ${NW + 2 * PAD} ${NH + 2 * PAD}`}>
                <Path
                  ref={nPathRef}
                  d={N_PATH}
                  fill={LEAF}
                  stroke={LEAF}
                  strokeWidth={THICKEN_PX * 100}
                  strokeLinejoin="round"
                />
              </Svg>
            </Animated.View>
          </Animated.View>

          {/* the dot: it does not exist until the N has turned into it, at the centre of the N */}
          <Animated.View
            style={{
              position: 'absolute',
              left: (NW / 2) * u - dotD / 2,
              top: (NH / 2) * u - dotD / 2,
              width: dotD,
              height: dotD,
              borderRadius: dotD / 2,
              backgroundColor: AMBER,
              opacity: tl.dotOpacity,
              transform: [
                { translateY: tl.dotY },
                { translateY: dotComp },
                { scaleX: tl.dotSX },
                { scaleY: tl.dotSY },
                { scale: tl.dotScale },
              ],
            }}
          />
        </Animated.View>

        {/* "estly": one drawing per letter, placed by hand along the baseline. Each letter pops in and goes away
            through its own motion (see the POP and ERASE settings at the top). */}
        <View style={{ width: WORD_W * u, height: NH * u, marginBottom: baselineMargin, overflow: 'visible' }}>
          {LETTERS.map((letter, i) => {
            const g = GLYPHS[i];
            return (
              <Animated.View
                key={`${letter}-${i}`}
                style={{
                  position: 'absolute',
                  left: PEN_X[i] * u,
                  top: 0,
                  width: g.adv * u,
                  height: 80 * u, // tall enough that the letter grows and shrinks from the middle of its body, not the top of the N
                  overflow: 'visible',
                  opacity: tl.letterOp[i],
                  transform: [
                    { perspective: 600 },
                    { translateX: tl.letterX[i] },
                    { translateY: tl.letterY[i] },
                    { rotateX: tl.letterR[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
                    { scale: tl.letterS[i] },
                  ],
                }}
              >
                <Svg
                  pointerEvents="none"
                  style={{ position: 'absolute', left: -GLYPH_PAD * u, top: -gTop * u }}
                  width={(g.adv + 2 * GLYPH_PAD) * u}
                  height={(NH + gTop + gBottom) * u}
                  viewBox={`${-GLYPH_PAD} ${-gTop} ${g.adv + 2 * GLYPH_PAD} ${NH + gTop + gBottom}`}
                >
                  <Path d={g.d} fill={LEAF} stroke={LEAF} strokeWidth={THICKEN_PX * 100} strokeLinejoin="round" />
                </Svg>
              </Animated.View>
            );
          })}
        </View>
      </Animated.View>

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: FOREST,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  lockup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
});