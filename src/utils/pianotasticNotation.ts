import {
  Score,
  Measure,
  Pitch,
  NoteEvent,
  TimeSignature,
  HandTemplate,
  NoteStep,
  AccidentalType,
  NoteDuration,
  Volta,
} from '../types/score';
import { INDIAN_TAALS } from './indianTaals';

/**
 * Return standard musical glyph for an accidental:
 * Sharp: ♯ (U+266F)
 * Flat: ♭ (U+266D)
 * Natural: ♮ (U+266E)
 */
export function getAccidentalGlyph(accidental: AccidentalType | undefined): string {
  if (accidental === 'sharp') return '♯';
  if (accidental === 'flat') return '♭';
  if (accidental === 'natural') return '♮';
  if (accidental === 'double_sharp') return '𝄪';
  if (accidental === 'double_flat') return '𝄫';
  return '';
}

/**
 * Convert numeric octave (0 to 8) to superscript character:
 * Examples: 4 -> '⁴', 3 -> '³', 5 -> '⁵', 2 -> '²'
 */
export function getSuperscriptOctave(octave: number | null | undefined): string {
  if (octave === null || octave === undefined || typeof octave !== 'number') return '';
  const superscripts: Record<number, string> = {
    0: '⁰',
    1: '¹',
    2: '²',
    3: '³',
    4: '⁴',
    5: '⁵',
    6: '⁶',
    7: '⁷',
    8: '⁸',
    9: '⁹',
  };
  return superscripts[octave] ?? `${octave}`;
}

/**
 * Convert actual musical pitch octave (standard scientific pitch, where Middle C = C4 / MIDI 60)
 * to the display octave convention based on the selected keyboard layout:
 * - 61 Keys:
 *     Lowest C (MIDI 36) is C¹
 *     Middle C (MIDI 60) is C³
 *     Highest C (MIDI 96) is C⁶
 *     Formula: actualOctave - 1.
 * - 76 Keys:
 *     Lowest C is C² (MIDI 36), Middle C is C⁴ (MIDI 60). Standard scientific convention.
 * - 88 Keys:
 *     Lowest C is C¹ (MIDI 24), Middle C is C⁴ (MIDI 60), Highest C is C⁸ (MIDI 108).
 */
export function getDisplayOctave(
  actualOctave: number | null | undefined,
  keyboardLayout: '61' | '76' | '88' = '61'
): number {
  const oct = typeof actualOctave === 'number' ? actualOctave : 4;
  if (keyboardLayout === '61') {
    // Offset by -1 so Middle C (C4) renders as C³, C2 as C¹, C7 as C⁶
    return Math.max(0, oct - 1);
  }
  return oct;
}

/**
 * Format a Pitch into clean letter notation with its exact superscript octave.
 * Respects keyboard layout convention ('61' | '76' | '88').
 * Examples on 61-key: Middle C -> "C³", C5 -> "C⁴", Bb3 -> "B♭²"
 * Examples on 88-key: Middle C -> "C⁴", C5 -> "C⁵", Bb3 -> "B♭³"
 */
export function formatNoteLetter(
  pitch: Pitch | null | undefined,
  defaultOctave = 4,
  keyboardLayout: '61' | '76' | '88' = '61'
): string {
  if (!pitch || !pitch.step) return '—';
  const acc = getAccidentalGlyph(pitch.accidental);
  const actualOct = typeof pitch.octave === 'number' ? pitch.octave : defaultOctave;
  const dispOct = getDisplayOctave(actualOct, keyboardLayout);
  const oct = getSuperscriptOctave(dispOct);
  return `${pitch.step}${acc}${oct}`;
}

export function formatNoteWithOctave(
  pitch: Pitch | null | undefined,
  defaultOctave = 4,
  keyboardLayout: '61' | '76' | '88' = '61'
): string {
  return formatNoteLetter(pitch, defaultOctave, keyboardLayout);
}

/**
 * Format Time Signature + Taal label above notation according to user-friendly specification:
 * Examples:
 *   Time Signature : 4/4 (Keharwa Taal)
 *   Time Signature : 3/4 (Dadra Taal)
 *   Time Signature : 5/4 (5-Matra Taal)
 *   Time Signature : 4/4 (Western Standard) -> "Time Signature : 4/4"
 */
export function formatTimeSignatureWithTaal(
  timeSignature?: TimeSignature | string,
  indianTaal?: string
): string {
  let num = 4;
  let den = 4;
  if (typeof timeSignature === 'string') {
    const parts = timeSignature.split('/');
    num = parseInt(parts[0], 10) || 4;
    den = parseInt(parts[1], 10) || 4;
  } else if (timeSignature) {
    num = timeSignature.numerator || 4;
    den = timeSignature.denominator || 4;
  }
  const tsStr = `${num}/${den}`;
  if (!indianTaal || indianTaal === 'None') {
    return `Time Signature : ${tsStr}`;
  }
  const cleanTaal = indianTaal.replace(/\s*Taal\s*$/i, '').trim();
  const capitalizedTaal = cleanTaal ? cleanTaal.charAt(0).toUpperCase() + cleanTaal.slice(1) : '';
  return `Time Signature : ${tsStr} (${capitalizedTaal} Taal)`;
}

/**
 * Deprecated dot checks: always return false to completely disable octave dots.
 */
export function getOctaveType(pitch: Pitch | null | undefined): 'low' | 'middle' | 'high' {
  if (!pitch || typeof pitch.octave !== 'number') return 'middle';
  if (pitch.octave <= 3) return 'low';
  if (pitch.octave >= 5) return 'high';
  return 'middle';
}

export function hasOctaveDotBelow(_pitch: Pitch | null | undefined): boolean {
  return false;
}

export function hasOctaveDotAbove(_pitch: Pitch | null | undefined): boolean {
  return false;
}

/**
 * Normalize score voltas:
 * If score.voltas exists, return it.
 * Otherwise, if legacy measures have voltaEnding, convert to structured Voltas.
 */
export function getNormalizedVoltas(score: Score): Volta[] {
  if (score.voltas && score.voltas.length > 0) {
    return score.voltas;
  }
  // Synthesize from measures if legacy score
  const voltas: Volta[] = [];
  let currentVoltaEnding: number | null = null;
  let startMeasureId: string | null = null;
  let endMeasureId: string | null = null;

  score.measures.forEach((m) => {
    if (m.voltaEnding) {
      if (currentVoltaEnding === m.voltaEnding) {
        endMeasureId = m.id;
      } else {
        if (currentVoltaEnding && startMeasureId && endMeasureId) {
          voltas.push({
            id: `volta_legacy_${startMeasureId}`,
            type: 'volta',
            endingNumbers: [currentVoltaEnding],
            startMeasureId,
            endMeasureId,
            closedEnd: currentVoltaEnding === 1,
          });
        }
        currentVoltaEnding = m.voltaEnding;
        startMeasureId = m.id;
        endMeasureId = m.id;
      }
    } else {
      if (currentVoltaEnding && startMeasureId && endMeasureId) {
        voltas.push({
          id: `volta_legacy_${startMeasureId}`,
          type: 'volta',
          endingNumbers: [currentVoltaEnding],
          startMeasureId,
          endMeasureId,
          closedEnd: currentVoltaEnding === 1,
        });
        currentVoltaEnding = null;
        startMeasureId = null;
        endMeasureId = null;
      }
    }
  });

  if (currentVoltaEnding && startMeasureId && endMeasureId) {
    voltas.push({
      id: `volta_legacy_${startMeasureId}`,
      type: 'volta',
      endingNumbers: [currentVoltaEnding],
      startMeasureId,
      endMeasureId,
      closedEnd: currentVoltaEnding === 1,
    });
  }

  return voltas;
}

/**
 * Sync voltaEnding onto measures so legacy export and MIDI routes remain synchronized
 */
export function syncMeasuresVoltaEndings(measures: Measure[], voltas: Volta[]): Measure[] {
  const measureVoltaMap = new Map<string, number>();

  voltas.forEach((v) => {
    const startIdx = measures.findIndex((m) => m.id === v.startMeasureId);
    const endIdx = measures.findIndex((m) => m.id === v.endMeasureId);
    if (startIdx !== -1 && endIdx !== -1) {
      const from = Math.min(startIdx, endIdx);
      const to = Math.max(startIdx, endIdx);
      const endingNum = v.endingNumbers[0] as 1 | 2 | 3;
      for (let i = from; i <= to; i++) {
        measureVoltaMap.set(measures[i].id, endingNum);
      }
    } else if (startIdx !== -1) {
      measureVoltaMap.set(measures[startIdx].id, v.endingNumbers[0] as 1 | 2 | 3);
    }
  });

  return measures.map((m) => {
    const ending = measureVoltaMap.get(m.id);
    if (m.voltaEnding !== ending) {
      return { ...m, voltaEnding: ending as 1 | 2 | 3 | undefined };
    }
    return m;
  });
}

export function formatSubdivisionDisplay(pitch: Pitch | null | undefined): string {
  if (!pitch || !pitch.step) return '.';
  return formatNoteLetter(pitch);
}

/**
 * Total number of beat columns in a measure based on its time signature or Indian Taal cycle.
 * Keharwa = 8-matra cycle: 8 matras in a single measure (not split).
 * Dadra = 6-matra cycle: 6 matras in a single measure (not split).
 */
export function getMeasureTotalBeats(
  measure: Measure | null | undefined,
  defaultTs?: TimeSignature | string,
  indianTaal?: string
): number {
  const taal = indianTaal || (measure as any)?.indianTaal;
  if (taal && taal !== 'None') {
    const lower = taal.toLowerCase().trim();
    if (lower.includes('keharwa')) {
      return 8;
    }
    if (lower.includes('dadra')) {
      return 6;
    }
    if (lower.includes('teentaal') || lower.includes('tintal')) {
      return 16;
    }
    if (lower.includes('ektaal')) {
      return 12;
    }
    if (lower.includes('jhaptal') || lower.includes('jhap')) {
      return 10;
    }
    if (lower.includes('rupak')) {
      return 7;
    }
    if (lower.includes('deepchandi')) {
      return 14;
    }
    const matchNum = lower.match(/(\d+)\s*-?\s*matra/);
    if (matchNum) {
      return parseInt(matchNum[1], 10);
    }
    const foundTaal = INDIAN_TAALS.find(
      (t) => t.id.toLowerCase() === lower || t.name.toLowerCase() === lower
    );
    if (foundTaal && foundTaal.beats) {
      return foundTaal.beats;
    }
  }
  if (measure?.timeSignature?.numerator) {
    return measure.timeSignature.numerator;
  }
  if (typeof defaultTs === 'string') {
    const num = parseInt(defaultTs.split('/')[0], 10);
    if (!isNaN(num) && num > 0) return num;
  }
  return (defaultTs as TimeSignature)?.numerator || 4;
}

/**
 * Determines whether a specific beat in Measure 1 is locked by the Pickup Beat setting.
 * When pickupBeat = 3, Beat 1 and Beat 2 (index 0 and 1) are locked.
 */
export function isBeatLockedByPickup(
  measureNumber: number,
  beatIndex: number,
  pickupBeat: number = 1
): boolean {
  if (measureNumber !== 1) return false;
  const pBeat = Math.max(1, pickupBeat);
  return beatIndex + 1 < pBeat;
}

/**
 * Finds the first editable position in the score taking into account pickup beats.
 */
export function getFirstEditablePosition(score: Score): {
  measureId: string;
  beatIndex: number;
  subBeatIndex: number;
} {
  if (!score.measures || score.measures.length === 0) {
    return { measureId: '', beatIndex: 0, subBeatIndex: 0 };
  }
  const firstMeasure = score.measures[0];
  const pickupBeat = score.metadata.pickupBeat || 1;
  const totalBeats = getMeasureTotalBeats(
    firstMeasure,
    score.metadata.initialTimeSignature,
    score.metadata.indianTaal
  );
  // pickupBeat is 1-based (e.g. 3 -> beatIndex 2)
  const initialBeatIndex = Math.min(totalBeats - 1, Math.max(0, pickupBeat - 1));
  return {
    measureId: firstMeasure.id,
    beatIndex: initialBeatIndex,
    subBeatIndex: 0,
  };
}

/**
 * Returns the effective Value (notes per beat: 1, 2, 3, or 4) for a given beat.
 * The Value setting begins applying from the beat where it was changed onward.
 * Previous beats strictly retain their original Value.
 */
export function getEffectiveBeatValue(
  score: Score,
  measureIndex: number,
  beatIndex: number
): number {
  if (!score.measures || score.measures.length === 0) return 1;

  // Scan backwards from (measureIndex, beatIndex) to find the most recent explicit Value
  for (let mIdx = measureIndex; mIdx >= 0; mIdx--) {
    const measure = score.measures[mIdx];
    if (!measure) continue;
    const totalBeats = getMeasureTotalBeats(
      measure,
      score.metadata.initialTimeSignature,
      score.metadata.indianTaal
    );
    const startBeat = mIdx === measureIndex ? beatIndex : totalBeats - 1;

    for (let b = startBeat; b >= 0; b--) {
      const explicitVal = measure.beatValues?.[b];
      if (explicitVal && [1, 2, 3, 4].includes(explicitVal)) {
        return explicitVal;
      }
    }
  }

  return 1; // Default is 1 note per beat
}

/**
 * Extracts note pitches for each beat of a measure.
 * Falls back to converting legacy or imported rhEvents/lhEvents if beatNotes is not yet set.
 */
export function getMeasureBeatPitches(
  measure: Measure,
  totalBeats: number,
  handTemplate: HandTemplate = 'Both'
): (Pitch | null)[][] {
  const result: (Pitch | null)[][] = [];

  // 1. If explicit beatNotes exists, return it
  if (measure.beatNotes && Object.keys(measure.beatNotes).length > 0) {
    for (let b = 0; b < totalBeats; b++) {
      result.push(measure.beatNotes[b] || []);
    }
    return result;
  }

  // 2. Otherwise derive from rhEvents (or lhEvents if LH-only)
  const events = handTemplate === 'LH' ? measure.lhEvents : measure.rhEvents;
  const beatBuckets: (Pitch | null)[][] = Array.from({ length: totalBeats }, () => []);

  if (events && events.length > 0) {
    let currentBeatAcc = 0;
    for (const ev of events) {
      if (ev.type === 'note' && ev.pitches && ev.pitches.length > 0) {
        const beatIdx = Math.floor(currentBeatAcc);
        if (beatIdx >= 0 && beatIdx < totalBeats) {
          beatBuckets[beatIdx].push(...ev.pitches);
        }
      }
      // Calculate duration in quarter beats
      let beatLen = 1;
      if (ev.duration === 'whole') beatLen = 4;
      else if (ev.duration === 'half') beatLen = 2;
      else if (ev.duration === 'quarter') beatLen = 1;
      else if (ev.duration === 'eighth') beatLen = 0.5;
      else if (ev.duration === 'sixteenth') beatLen = 0.25;
      if (ev.isDotted) beatLen *= 1.5;
      currentBeatAcc += beatLen;
    }
  }

  for (let b = 0; b < totalBeats; b++) {
    result.push(beatBuckets[b]);
  }

  return result;
}

/**
 * Synchronize rhEvents and lhEvents with beatNotes so that audioEngine playback,
 * MIDI generation, and MusicXML export stay 100% playable and valid.
 */
export function syncMeasureEventsFromBeatData(
  measure: Measure,
  defaultTs: TimeSignature,
  handTemplate: HandTemplate = 'Both',
  indianTaal?: string
): Measure {
  const totalBeats = getMeasureTotalBeats(measure, defaultTs, indianTaal);
  const rhEvents: NoteEvent[] = [];
  const lhEvents: NoteEvent[] = [];

  const now = Date.now();

  for (let b = 0; b < totalBeats; b++) {
    const pitches = measure.beatNotes?.[b] || [];
    const beatLyric = measure.beatLyrics?.[b];
    const value = measure.beatValues?.[b] || Math.max(1, pitches.length);

    if (pitches.length === 0) {
      // Empty beat: insert rest
      if (handTemplate !== 'LH') {
        rhEvents.push({
          id: `rh_${measure.id}_b${b}_rest`,
          type: 'rest',
          pitches: [],
          duration: 'quarter',
          lyricSyllable: beatLyric,
        });
      }
      if (handTemplate !== 'RH') {
        lhEvents.push({
          id: `lh_${measure.id}_b${b}_rest`,
          type: 'rest',
          pitches: [],
          duration: 'quarter',
        });
      }
    } else {
      // Notes / Subdivisions entered: determine subdivision duration
      const effectiveSlots = Math.max(pitches.length, value);
      const duration: NoteDuration =
        effectiveSlots === 1 ? 'quarter' : effectiveSlots === 2 ? 'eighth' : 'sixteenth';

      for (let pIdx = 0; pIdx < effectiveSlots; pIdx++) {
        const p = pitches[pIdx] ?? null;
        const evId = `rh_${measure.id}_b${b}_s${pIdx}_${now}`;
        const noteLyric = measure.beatLyrics?.[`${b}_${pIdx}`] || (pIdx === 0 ? beatLyric : undefined);

        if (!p || !p.step) {
          // Empty subdivision (e.g. '. B' slot 0 is null): silent rest!
          if (handTemplate !== 'LH') {
            rhEvents.push({
              id: `${evId}_rest`,
              type: 'rest',
              pitches: [],
              duration,
            });
          }
          if (handTemplate !== 'RH') {
            lhEvents.push({
              id: `lh_${measure.id}_b${b}_s${pIdx}_${now}_rest`,
              type: 'rest',
              pitches: [],
              duration,
            });
          }
        } else {
          // Real note at this subdivision
          if (handTemplate !== 'LH') {
            rhEvents.push({
              id: evId,
              type: 'note',
              pitches: [p],
              duration,
              lyricSyllable: noteLyric,
            });
          }
          if (handTemplate !== 'RH') {
            const pOctave = typeof p.octave === 'number' && !isNaN(p.octave) ? p.octave : 4;
            lhEvents.push({
              id: `lh_${measure.id}_b${b}_s${pIdx}_${now}`,
              type: 'note',
              pitches: [{ ...p, octave: Math.max(1, pOctave - 1) }], // lh accompaniment
              duration,
            });
          }
        }
      }
    }
  }

  // Keep chordSymbols in sync with beatChords
  const chordSymbols = [...(measure.chordSymbols || [])];
  if (measure.beatChords) {
    // Rebuild or update chordSymbols from beatChords
    const updatedChords: typeof chordSymbols = [];
    for (const [beatKey, chordName] of Object.entries(measure.beatChords)) {
      const bIdx = Number(beatKey);
      if (chordName && chordName.trim()) {
        const root = chordName.slice(0, 1).toUpperCase();
        const quality = chordName.slice(1);
        updatedChords.push({
          id: `cs_${measure.id}_b${bIdx}`,
          beatOffset: bIdx,
          root,
          quality,
          formatted: chordName.trim(),
        });
      }
    }
    if (updatedChords.length > 0 || Object.keys(measure.beatChords).length > 0) {
      chordSymbols.length = 0;
      chordSymbols.push(...updatedChords);
    }
  }

  return {
    ...measure,
    chordSymbols,
    rhEvents: handTemplate === 'LH' ? [] : rhEvents,
    lhEvents: handTemplate === 'RH' ? [] : lhEvents,
  };
}

/**
 * Calculates the next cursor position after entering a note:
 * - If current beat requires more notes (for Value 2, 3, or 4), stays on beat and increments subBeatIndex.
 * - If beat is completed, auto-advances to the next beat.
 * - When completing the final beat of a measure, automatically moves to Beat 1 of the next measure.
 */
export function calculateNextCursorPosition(
  score: Score,
  currentMeasureId: string,
  currentBeatIndex: number,
  currentSubBeatIndex: number,
  effectiveValue: number
): {
  nextMeasureId: string;
  nextBeatIndex: number;
  nextSubBeatIndex: number;
  shouldAppendMeasure: boolean;
} {
  // 1. If more notes are needed to complete the current beat's Value:
  if (currentSubBeatIndex + 1 < effectiveValue) {
    return {
      nextMeasureId: currentMeasureId,
      nextBeatIndex: currentBeatIndex,
      nextSubBeatIndex: currentSubBeatIndex + 1,
      shouldAppendMeasure: false,
    };
  }

  // 2. Beat completed! Move to next beat
  const measureIdx = score.measures.findIndex((m) => m.id === currentMeasureId);
  const currentMeasure = score.measures[measureIdx] || score.measures[0];
  const totalBeats = getMeasureTotalBeats(
    currentMeasure,
    score.metadata.initialTimeSignature,
    score.metadata.indianTaal
  );

  if (currentBeatIndex + 1 < totalBeats) {
    // Move to next beat in current measure
    return {
      nextMeasureId: currentMeasureId,
      nextBeatIndex: currentBeatIndex + 1,
      nextSubBeatIndex: 0,
      shouldAppendMeasure: false,
    };
  }

  // 3. Final beat of measure completed! Move to Beat 1 of next measure
  if (measureIdx + 1 < score.measures.length) {
    const nextMeasure = score.measures[measureIdx + 1];
    return {
      nextMeasureId: nextMeasure.id,
      nextBeatIndex: 0,
      nextSubBeatIndex: 0,
      shouldAppendMeasure: false,
    };
  }

  // 4. We reached the end of the score! Signal to append a new measure
  return {
    nextMeasureId: currentMeasureId,
    nextBeatIndex: 0,
    nextSubBeatIndex: 0,
    shouldAppendMeasure: true,
  };
}
