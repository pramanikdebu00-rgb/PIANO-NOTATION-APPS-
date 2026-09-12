import {
  Score,
  Measure,
  Pitch,
  NoteStep,
  AccidentalType,
  Volta,
  ScoreTextAnnotation,
} from '../types/score';
import {
  getAccidentalGlyph,
  getMeasureTotalBeats,
  isBeatLockedByPickup,
  getMeasureBeatPitches,
  getEffectiveBeatValue,
  getNormalizedVoltas,
  getSuperscriptOctave,
  getDisplayOctave,
  formatTimeSignatureWithTaal,
} from '../utils/pianotasticNotation';

export interface PrintableDocumentOptions {
  paperSize?: 'A4' | 'Letter' | 'A3' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  margins?: { top: number; right: number; bottom: number; left: number };
  scaling?: number;
  keyboardLayout?: '61' | '76' | '88';
  showHeader?: boolean;
  showFooter?: boolean;
  headerAdjustmentTop?: number;
  footerAdjustmentBottom?: number;
}

export interface PrintableNote {
  subBeatIndex: number;
  subBeatCount: number;
  pitch: Pitch | null;
  step?: NoteStep;
  accidental?: AccidentalType | null;
  accidentalGlyph: string; // '♯', '♭', '♮', or ''
  canonicalOctave: number; // e.g. 4 for Middle C
  displayOctave: number; // e.g. 3 on 61-key, 4 on 76/88-key
  superscriptOctave: string; // '⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'
  formattedNoteWithOctave: string; // e.g. "C³" or "C♯⁴"
  isEmpty: boolean;
  isRestDot: boolean;
  x: number;
  y: number;
}

export interface PrintableLyric {
  subBeatIndex: number;
  text: string;
  x: number;
  y: number;
}

export interface PrintableBeat {
  beatIndex: number; // 0-indexed
  beatNumber: number; // 1-indexed (e.g. 1, 2, 3, 4, 5, 6, 7, 8 for Keharwa!)
  colX: number;
  colWidth: number;
  colCenterX: number;
  chord?: string;
  lyrics: PrintableLyric[];
  symbols: string[];
  notes: PrintableNote[];
  isLocked: boolean;
}

export interface PrintableMeasure {
  measure: Measure;
  measureId: string;
  measureNumber: number;
  measureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  timeSignature: string;
  taal?: string;
  totalBeats: number;
  barlineType: 'single' | 'double' | 'repeat_start' | 'repeat_end' | 'repeat_both' | 'final';
  hasDoubleBarline: boolean;
  voltas: Volta[];
  beats: PrintableBeat[];
}

export interface PrintableSystem {
  systemIndex: number;
  y: number;
  height: number;
  measures: PrintableMeasure[];
}

export interface PrintableTextObject {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
}

export interface PrintablePage {
  pageIndex: number; // 0-indexed
  pageNumber: number; // 1-indexed (1, 2, 3...)
  pageNumberLabel: string; // "1", "2", "3" (never "1/2"!)
  isFirstPage: boolean;
  pageWidth: number;
  pageHeight: number;
  staffMarginLeft: number;
  staffMarginRight: number;
  showHeader: boolean;
  showFooter: boolean;
  runningHeaderTitle?: string;
  runningHeaderComposer?: string;
  systems: PrintableSystem[];
  textObjects: PrintableTextObject[];
}

export interface PrintableScoreDocument {
  title: string;
  subtitle?: string;
  composer?: string;
  lyricist?: string;
  initialKeySignature: string;
  initialTimeSignature: string;
  indianTaal?: string;
  timeSignatureFormatted: string; // e.g. "Time Signature : 4/4 (Keharwa Taal)"
  tempoBpm: number;
  tempoFormatted: string; // e.g. "♩ = 80"
  paperSize: 'A4' | 'Letter' | 'A3' | 'Legal';
  orientation: 'portrait' | 'landscape';
  pageWidth: number;
  pageHeight: number;
  margins: { top: number; right: number; bottom: number; left: number };
  contentWidth: number;
  scaling: number;
  keyboardLayout: '61' | '76' | '88';
  totalPages: number;
  pages: PrintablePage[];
}

// Clean placeholder text
function cleanTextValue(val?: string | null): string | undefined {
  if (!val) return undefined;
  const s = val.trim();
  if (
    !s ||
    s === '##' ||
    s === '#' ||
    s.toLowerCase() === 'chord' ||
    s.toLowerCase() === '+ chord' ||
    s.toLowerCase() === 'lyric' ||
    s.toLowerCase() === '+ lyric' ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'null' ||
    s.toLowerCase() === '[object object]'
  ) {
    return undefined;
  }
  return s;
}

/**
 * Builds the canonical printable representation of a score.
 * This is the SINGLE SOURCE OF TRUTH for Print Preview, Save as PDF, and Browser Print.
 */
export function buildPrintableScoreDocument(
  score: Score,
  options?: PrintableDocumentOptions
): PrintableScoreDocument {
  const paperSize =
    options?.paperSize ||
    (score.layoutSettings.pageSize as 'A4' | 'Letter' | 'A3' | 'Legal') ||
    'A4';
  const orientation = options?.orientation || score.layoutSettings.orientation || 'portrait';
  const isLandscape = orientation === 'landscape';

  // Paper dimensions at standard 96 DPI:
  let baseWidth = 794;
  let baseHeight = 1123;
  const lowerSize = paperSize.toLowerCase();
  if (lowerSize === 'letter') {
    baseWidth = 816;
    baseHeight = 1056;
  } else if (lowerSize === 'a3') {
    baseWidth = 1123;
    baseHeight = 1587;
  } else if (lowerSize === 'legal') {
    baseWidth = 816;
    baseHeight = 1344;
  }

  const pageWidth = isLandscape ? baseHeight : baseWidth;
  const pageHeight = isLandscape ? baseWidth : baseHeight;

  const defaultMargins = { top: 40, right: 44, bottom: 40, left: 44 };
  const margins = {
    top: options?.margins?.top ?? score.layoutSettings.pageMargins?.top ?? defaultMargins.top,
    right: options?.margins?.right ?? score.layoutSettings.pageMargins?.right ?? defaultMargins.right,
    bottom: options?.margins?.bottom ?? score.layoutSettings.pageMargins?.bottom ?? defaultMargins.bottom,
    left: options?.margins?.left ?? score.layoutSettings.pageMargins?.left ?? defaultMargins.left,
  };

  const staffMarginLeft = margins.left;
  const staffMarginRight = margins.right;
  const contentWidth = Math.max(300, pageWidth - staffMarginLeft - staffMarginRight);

  const scaling = options?.scaling ?? 1.0;
  const keyboardLayout: '61' | '76' | '88' =
    options?.keyboardLayout ||
    score.layoutSettings.keyboardLayout ||
    score.metadata.keyboardLayout ||
    '61';

  const handTemplate = score.metadata.handTemplate || 'Both';
  const pickupBeat = score.metadata.pickupBeat || 1;

  const title = score.metadata.title || 'Untitled Notation';
  const subtitle = score.metadata.subtitle || '';
  const composer = score.metadata.composer || 'Pianotastic Academy';
  const lyricist = score.metadata.lyricist || '';
  const initialTimeSignatureRaw = score.metadata.initialTimeSignature || '4/4';
  const initialTimeSignature =
    typeof initialTimeSignatureRaw === 'string'
      ? initialTimeSignatureRaw
      : `${initialTimeSignatureRaw.numerator || 4}/${initialTimeSignatureRaw.denominator || 4}`;
  const indianTaal = score.metadata.indianTaal;
  const initialKeySignature = score.metadata.initialKeySignature || 'C_major';
  const tempoBpm = score.metadata.tempoBpm || 80;

  // Exact structured Time Signature + Taal formatting
  const timeSignatureFormatted = formatTimeSignatureWithTaal(initialTimeSignatureRaw, indianTaal);
  const tempoFormatted = `♩ = ${tempoBpm}`;

  const measureBlockHeight = 136;
  const systemGap = 24;

  const getChordForBeat = (measure: Measure, beatIndex: number): string | undefined => {
    if (measure.beatChords && measure.beatChords[beatIndex] !== undefined) {
      return cleanTextValue(measure.beatChords[beatIndex]);
    }
    if (measure.chordSymbols && measure.chordSymbols.length > 0) {
      const cs = measure.chordSymbols.find((c) => Math.floor(c.beatOffset) === beatIndex);
      return cs ? cleanTextValue(cs.formatted || `${cs.root}${cs.quality || ''}`) : undefined;
    }
    return undefined;
  };

  // Content-Aware Natural Width Calculator for Measure
  const getMeasureNaturalWidth = (measure: Measure): number => {
    const ts = measure.timeSignature || initialTimeSignatureRaw;
    const totalBeats = getMeasureTotalBeats(measure, ts, indianTaal);
    const baseBeatWidth = 44;
    const beatPitchesList = getMeasureBeatPitches(measure, totalBeats, handTemplate);
    let contentRequired = 0;

    for (let b = 0; b < totalBeats; b++) {
      const val = measure.beatValues?.[b] || 1;
      const pitches = beatPitchesList[b] || [];
      const count = Math.max(val, pitches.length, 1);

      let noteSpacing = baseBeatWidth;
      if (count === 2) noteSpacing = 58;
      else if (count === 3) noteSpacing = 78;
      else if (count >= 4) noteSpacing = 24 * count + 6;

      const hasAccidental = pitches.some(
        (p) => Boolean(p && p.accidental && p.accidental !== 'natural')
      );
      if (hasAccidental) noteSpacing += 8;

      const chord = getChordForBeat(measure, b);
      let chordSpacing = 0;
      if (chord) {
        chordSpacing = chord.length * 8.5 + 14;
      }

      const rawLyric = cleanTextValue(measure.beatLyrics?.[b]);
      let lyricSpacing = 0;
      if (rawLyric) {
        lyricSpacing = rawLyric.length * 8 + 16;
      }
      for (let s = 1; s < count; s++) {
        const subLyric = cleanTextValue(measure.beatLyrics?.[`${b}_${s}`]);
        if (subLyric) {
          lyricSpacing += subLyric.length * 7.5 + 10;
        }
      }

      const beatWidth = Math.max(baseBeatWidth, noteSpacing, chordSpacing, lyricSpacing);
      contentRequired += beatWidth;
    }

    contentRequired += 20;
    const measureLock = score.layoutSettings.measureLockPerLine;
    const isLocked = measureLock !== null && measureLock !== undefined && measureLock > 0;
    const targetBars = isLocked ? Math.max(1, Math.round(measureLock)) : (score.layoutSettings.barsPerLine || 4);
    const minBlankWidth = targetBars >= 6 ? 108 : targetBars === 5 ? 120 : 140;
    const defaultBlankWidth = Math.max(minBlankWidth, totalBeats * (targetBars >= 6 ? 34 : 40) + 20);

    return Math.max(defaultBlankWidth, contentRequired, measure.customWidth || 0);
  };

  // Systems grouping and justification
  const sysRawList: {
    systemIndex: number;
    measures: { measure: Measure; width: number; measureIdx: number; naturalWidth: number }[];
  }[] = [];

  const measureLock = score.layoutSettings.measureLockPerLine;
  const isLocked = measureLock !== null && measureLock !== undefined && measureLock > 0;
  const lockCount = isLocked ? Math.max(1, Math.round(measureLock)) : null;
  const userBarsPerLine = score.layoutSettings.barsPerLine || score.layoutSettings.measuresPerSystemAuto || 4;
  const autoBarsPerLine = Math.max(1, userBarsPerLine);

  let curSysMeasures: { measure: Measure; width: number; measureIdx: number; naturalWidth: number }[] = [];
  let curSysNatSum = 0;

  score.measures.forEach((m, idx) => {
    const natWidth = getMeasureNaturalWidth(m);
    const prevMeasure = curSysMeasures.length > 0 ? curSysMeasures[curSysMeasures.length - 1].measure : null;
    const prevHadManualBreak = prevMeasure ? Boolean(prevMeasure.systemBreak) : false;

    let shouldBreak = false;
    if (curSysMeasures.length > 0) {
      if (prevHadManualBreak) {
        shouldBreak = true;
      } else if (isLocked && lockCount) {
        shouldBreak = curSysMeasures.length >= lockCount;
      } else {
        const wouldExceedBars = curSysMeasures.length >= autoBarsPerLine;
        const wouldOverflowWidth = curSysNatSum + natWidth > contentWidth;
        shouldBreak = wouldExceedBars || wouldOverflowWidth;
      }
    }

    if (curSysMeasures.length > 0 && shouldBreak) {
      sysRawList.push({ systemIndex: sysRawList.length, measures: curSysMeasures });
      curSysMeasures = [];
      curSysNatSum = 0;
    }

    curSysMeasures.push({
      measure: m,
      width: 0,
      measureIdx: idx,
      naturalWidth: natWidth,
    });
    curSysNatSum += natWidth;
  });

  if (curSysMeasures.length > 0) {
    sysRawList.push({ systemIndex: sysRawList.length, measures: curSysMeasures });
  }

  // Justify systems across contentWidth
  sysRawList.forEach((sys) => {
    const totalNat = Math.max(1, sys.measures.reduce((acc, it) => acc + it.naturalWidth, 0));
    const targetCount = isLocked && lockCount ? lockCount : autoBarsPerLine;
    const prevMeasure = sys.measures[sys.measures.length - 1]?.measure;
    const isFullLine = sys.measures.length >= targetCount || Boolean(prevMeasure?.systemBreak);

    const targetLineWidth = isFullLine
      ? contentWidth
      : Math.min(contentWidth, Math.max(totalNat, (contentWidth / targetCount) * sys.measures.length));

    let accumulatedWidth = 0;
    sys.measures.forEach((item, itemIdx) => {
      if (itemIdx === sys.measures.length - 1) {
        item.width = targetLineWidth - accumulatedWidth;
      } else {
        const propWidth = Math.round((targetLineWidth * item.naturalWidth) / totalNat);
        item.width = propWidth;
        accumulatedWidth += propWidth;
      }
    });
  });

  // Normalized voltas from score
  const normalizedVoltas = getNormalizedVoltas(score);

  // Group systems into pages
  const pageMarginBottom = Math.max(28, margins.bottom);
  const footerReservedHeight = 44;
  const bottomPrintableMargin = pageHeight - pageMarginBottom - footerReservedHeight;

  const getSystemExtraSpace = (sys: typeof sysRawList[0], globalSysIdx: number) => {
    const lastMeasure = sys.measures[sys.measures.length - 1]?.measure;
    if (!score.spacingObjects || score.spacingObjects.length === 0) return 0;
    const match = score.spacingObjects.filter(
      (s) => (lastMeasure && s.afterMeasureId === lastMeasure.id) || s.systemIndex === globalSysIdx
    );
    return match.reduce((sum, s) => sum + (s.amount || 0), 0);
  };

  const rawPages: { systems: typeof sysRawList; startY: number }[] = [];
  let curPageSystems: typeof sysRawList = [];
  const firstPageStartY = 145;
  const subsequentPageStartY = 50;
  let currentY = firstPageStartY;

  sysRawList.forEach((sys, sysIdx) => {
    const extraSpace = getSystemExtraSpace(sys, sysIdx);
    const sysSpan = measureBlockHeight + systemGap + extraSpace;
    const prevSystem = curPageSystems.length > 0 ? curPageSystems[curPageSystems.length - 1] : null;
    const prevHadPageBreak = prevSystem
      ? prevSystem.measures.some((m) => m.measure.pageBreak)
      : false;

    const wouldOverflowPage = currentY + sysSpan > bottomPrintableMargin;

    if (curPageSystems.length > 0 && (wouldOverflowPage || prevHadPageBreak)) {
      rawPages.push({
        systems: curPageSystems,
        startY: rawPages.length === 0 ? firstPageStartY : subsequentPageStartY,
      });
      curPageSystems = [];
      currentY = subsequentPageStartY;
    }

    curPageSystems.push(sys);
    currentY += sysSpan;
  });

  if (curPageSystems.length > 0) {
    rawPages.push({
      systems: curPageSystems,
      startY: rawPages.length === 0 ? firstPageStartY : subsequentPageStartY,
    });
  }

  if (rawPages.length === 0) {
    rawPages.push({ systems: [], startY: firstPageStartY });
  }

  // Canonical text objects resolution
  const rawTextList = score.textObjects || score.textAnnotations || [];
  const canonicalTextObjects: PrintableTextObject[] = [];

  rawTextList.forEach((t) => {
    let resolvedPage = t.pageIndex ?? 0;
    let resolvedX = t.x ?? 120;
    let resolvedY = t.y ?? 120;

    if (t.x === undefined || t.y === undefined) {
      for (let pIdx = 0; pIdx < rawPages.length; pIdx++) {
        const p = rawPages[pIdx];
        let sysY = p.startY;
        for (let sIdx = 0; sIdx < p.systems.length; sIdx++) {
          const sys = p.systems[sIdx];
          let accW = 0;
          for (let mIdx = 0; mIdx < sys.measures.length; mIdx++) {
            const item = sys.measures[mIdx];
            if (item.measure.id === t.measureId || item.measure.measureNumber === t.measureNumber) {
              resolvedPage = pIdx;
              const mX = staffMarginLeft + accW;
              const bIdx = t.beatIndex !== undefined ? t.beatIndex : 0;
              resolvedX = Math.round(mX + bIdx * 50 + (t.offsetX || 0));
              resolvedY = Math.round(
                t.placement === 'below'
                  ? sysY + measureBlockHeight + 18 + (t.offsetY || 0)
                  : sysY - 8 + (t.offsetY || 0)
              );
              break;
            }
            accW += item.width;
          }
          sysY += measureBlockHeight + systemGap;
        }
      }
    }

    canonicalTextObjects.push({
      id: t.id,
      text: t.text || (t as any).content || '',
      x: resolvedX,
      y: resolvedY,
      fontSize: t.fontSize || 14,
      fontFamily: t.fontFamily || "'Plus Jakarta Sans', sans-serif",
      fontWeight: t.fontWeight || ((t as any).isBold ? 'bold' : 'normal'),
      color: t.color || '#1e293b',
    });
  });

  // Construct structured PrintablePages
  const totalPages = rawPages.length;
  const pages: PrintablePage[] = rawPages.map((pageData, pIdx) => {
    const isFirstPage = pIdx === 0;
    const pageNumber = pIdx + 1;
    const pageNumberLabel = String(pageNumber); // "1", "2", "3" - strictly individual numbers!

    let sysY = pageData.startY;
    const printableSystems: PrintableSystem[] = [];

    pageData.systems.forEach((sys) => {
      let currentMeasureX = staffMarginLeft;
      const printableMeasures: PrintableMeasure[] = [];

      sys.measures.forEach((item) => {
        const m = item.measure;
        const measureWidth = item.width;
        const ts = m.timeSignature || initialTimeSignature;
        const totalBeats = getMeasureTotalBeats(m, ts, indianTaal);
        const colWidth = measureWidth / totalBeats;
        const beatPitchesList = getMeasureBeatPitches(m, totalBeats, handTemplate);

        // Voltas for this measure
        const measureVoltas = normalizedVoltas.filter(
          (v) => v.startMeasureId === m.id || v.endMeasureId === m.id
        );

        // Barline type
        const hasDouble =
          (m as any).barlineRight === 'double' ||
          Boolean((m as any).hasDoubleBarline) ||
          m.barlineType === 'double';
        let barlineType: 'single' | 'double' | 'repeat_start' | 'repeat_end' | 'repeat_both' | 'final' =
          hasDouble ? 'double' : (m.barlineType as any) || 'single';

        const printableBeats: PrintableBeat[] = [];

        for (let b = 0; b < totalBeats; b++) {
          const colX = currentMeasureX + b * colWidth;
          const colCenterX = colX + colWidth / 2;
          const isLockedBeat = isBeatLockedByPickup(m.measureNumber, b, pickupBeat);

          // Chord
          const chord = getChordForBeat(m, b);

          // Lyrics
          const printableLyrics: PrintableLyric[] = [];
          const mainLyric = cleanTextValue(m.beatLyrics?.[b]);
          if (mainLyric) {
            printableLyrics.push({
              subBeatIndex: 0,
              text: mainLyric,
              x: colCenterX,
              y: sysY + 130,
            });
          }

          // Symbols (e.g. ⌣)
          const symbols = (m.beatSymbols?.[b] || []).filter((s) => Boolean(s && s.trim()));

          // Notes
          const effVal = m.beatValues?.[b] || getEffectiveBeatValue(score, item.measureIdx, b);
          const rawPitches = beatPitchesList[b] || [];
          const pitches: (Pitch | null)[] =
            effVal > 1
              ? Array.from({ length: effVal }, (_, i) => rawPitches[i] ?? null)
              : rawPitches;

          const printableNotes: PrintableNote[] = [];
          const noteCount = pitches.length;

          if (noteCount === 0 || isLockedBeat) {
            // Empty beat or locked pickup beat
            printableNotes.push({
              subBeatIndex: 0,
              subBeatCount: 1,
              pitch: null,
              accidentalGlyph: '',
              canonicalOctave: handTemplate === 'LH' ? 3 : 4,
              displayOctave: getDisplayOctave(handTemplate === 'LH' ? 3 : 4, keyboardLayout),
              superscriptOctave: '',
              formattedNoteWithOctave: isLockedBeat ? '—' : '—',
              isEmpty: true,
              isRestDot: false,
              x: colCenterX,
              y: sysY + 84,
            });
          } else {
            pitches.forEach((p, pIdx) => {
              const subWidth = colWidth / noteCount;
              const subX = colX + pIdx * subWidth;
              const noteX = subX + subWidth / 2;

              const isEmptySub = !p || !p.step;
              const isRestDot = Boolean(p && (p as any).isRest);
              const canonicalOctave = p?.octave ?? (handTemplate === 'LH' ? 3 : 4);
              const displayOct = getDisplayOctave(canonicalOctave, keyboardLayout);
              const accGlyph = p?.accidental && p.accidental !== 'natural' ? getAccidentalGlyph(p.accidental) : '';
              const supOct = isEmptySub ? '' : getSuperscriptOctave(displayOct);
              const formattedNote = isEmptySub
                ? isRestDot
                  ? '.'
                  : noteCount > 1
                  ? '.'
                  : '—'
                : `${p?.step}${accGlyph}${supOct}`;

              printableNotes.push({
                subBeatIndex: pIdx,
                subBeatCount: noteCount,
                pitch: p,
                step: p?.step,
                accidental: p?.accidental,
                accidentalGlyph: accGlyph,
                canonicalOctave,
                displayOctave: displayOct,
                superscriptOctave: supOct,
                formattedNoteWithOctave: formattedNote,
                isEmpty: isEmptySub,
                isRestDot,
                x: noteX,
                y: sysY + 84,
              });

              // Sub-lyrics if any
              if (pIdx > 0) {
                const subLyric = cleanTextValue(m.beatLyrics?.[`${b}_${pIdx}`]);
                if (subLyric) {
                  printableLyrics.push({
                    subBeatIndex: pIdx,
                    text: subLyric,
                    x: noteX,
                    y: sysY + 130,
                  });
                }
              }
            });
          }

          printableBeats.push({
            beatIndex: b,
            beatNumber: b + 1, // 1..8 for Keharwa, 1..6 for Dadra!
            colX,
            colWidth,
            colCenterX,
            chord,
            lyrics: printableLyrics,
            symbols,
            notes: printableNotes,
            isLocked: isLockedBeat,
          });
        }

        const tsString =
          typeof ts === 'string'
            ? ts
            : `${(ts as any)?.numerator || 4}/${(ts as any)?.denominator || 4}`;

        printableMeasures.push({
          measure: m,
          measureId: m.id,
          measureNumber: m.measureNumber,
          measureIndex: item.measureIdx,
          x: currentMeasureX,
          y: sysY,
          width: measureWidth,
          height: measureBlockHeight,
          timeSignature: tsString,
          taal: indianTaal,
          totalBeats,
          barlineType,
          hasDoubleBarline: hasDouble,
          voltas: measureVoltas,
          beats: printableBeats,
        });

        currentMeasureX += measureWidth;
      });

      printableSystems.push({
        systemIndex: sys.systemIndex,
        y: sysY,
        height: measureBlockHeight,
        measures: printableMeasures,
      });

      const extraSpace = getSystemExtraSpace(sys, sys.systemIndex);
      sysY += measureBlockHeight + systemGap + extraSpace;
    });

    // Page text objects
    const pageTextObjs = canonicalTextObjects.filter((t) => {
      const orig = rawTextList.find((o) => o.id === t.id);
      return (orig?.pageIndex ?? 0) === pIdx;
    });

    return {
      pageIndex: pIdx,
      pageNumber,
      pageNumberLabel,
      isFirstPage,
      pageWidth,
      pageHeight,
      staffMarginLeft,
      staffMarginRight,
      showHeader: isFirstPage && (options?.showHeader ?? score.layoutSettings.showHeader !== false),
      showFooter: options?.showFooter ?? score.layoutSettings.showFooter !== false,
      runningHeaderTitle: title,
      runningHeaderComposer: composer,
      systems: printableSystems,
      textObjects: pageTextObjs,
    };
  });

  return {
    title,
    subtitle,
    composer,
    lyricist,
    initialKeySignature,
    initialTimeSignature,
    indianTaal,
    timeSignatureFormatted,
    tempoBpm,
    tempoFormatted,
    paperSize,
    orientation,
    pageWidth,
    pageHeight,
    margins,
    contentWidth,
    scaling,
    keyboardLayout,
    totalPages,
    pages,
  };
}
