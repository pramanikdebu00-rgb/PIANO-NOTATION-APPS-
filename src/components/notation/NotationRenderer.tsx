import React, { useState, useRef, useMemo } from 'react';
import {
  Score,
  Measure,
  Pitch,
  ToolMode,
  NoteDuration,
  AccidentalType,
  SelectionState,
  Hand,
  ChordSymbolEvent,
  ScoreTextAnnotation,
  Volta,
  SpacingObject,
} from '../../types/score';
import {
  formatNoteLetter,
  getAccidentalGlyph,
  getMeasureTotalBeats,
  isBeatLockedByPickup,
  getMeasureBeatPitches,
  getEffectiveBeatValue,
  getNormalizedVoltas,
  getSuperscriptOctave,
  getDisplayOctave,
  formatTimeSignatureWithTaal,
} from '../../utils/pianotasticNotation';
import { audioEngine } from '../../services/audioEngine';
import { Check, Trash2, X } from 'lucide-react';
import { PageTextObjectsLayer } from './PageTextObjectsLayer';
import { PageSpacingLayer } from './PageSpacingLayer';
import { calculateAccidentalLayout, AccidentalVectorGlyph } from '../../utils/accidentalLayout';

interface NotationRendererProps {
  score: Score;
  toolMode: ToolMode;
  selectedDuration?: NoteDuration;
  selectedAccidental?: AccidentalType | null;
  activeHand?: Hand;
  selection: SelectionState;
  playbackPosition: { measureIndex: number; beat: number } | null;
  currentBeatValue?: number;
  onSelectMeasure: (measureId: string, isCtrl?: boolean, isShift?: boolean) => void;
  onSelectBeat: (
    measureId: string,
    beatIndex: number,
    subBeatIndex?: number,
    selectionType?: 'note' | 'beat' | 'chord' | 'lyrics' | 'symbol'
  ) => void;
  onSelectVolta?: (voltaId: string) => void;
  onInsertNote?: (measureId: string, staff: 'RH' | 'LH', pitch: Pitch, beatOffset?: number) => void;
  onDeleteSelected?: () => void;
  onMeasureWidthChange?: (measureId: string, newWidth: number) => void;
  onMeasureContextMenu?: (measure: Measure, x: number, y: number) => void;
  onOpenNavigationPalette?: (measure: Measure) => void;
  onUpdateBeatLyric?: (measureId: string, beatIndex: number, text: string, subBeatIndex?: number) => void;
  onUpdateBeatChord?: (measureId: string, beatIndex: number, chord: string) => void;
  onToggleBeatSymbol?: (measureId: string, beatIndex: number, symbol: string) => void;
  onToggleLineBreak?: (measureId: string) => void;
  onSelectTextAnnotation?: (textId: string) => void;
  onEditTextAnnotation?: (textAnnotation: ScoreTextAnnotation) => void;
  onOpenAddTextModal?: (
    targetOrMeasureId: any,
    beatIndex?: number,
    placement?: 'above' | 'below'
  ) => void;
  onDeleteTextAnnotation?: (textId: string) => void;
  onMoveTextAnnotation?: (textId: string, x: number, y: number) => void;
  onCommitMoveTextAnnotation?: (textId: string, x: number, y: number) => void;
  onUpdateTextAnnotation?: (textId: string, patch: Partial<ScoreTextAnnotation>) => void;
  onSelectSpace?: (spaceId: string) => void;
  onAddSpace?: (afterMeasureId: string, amount: number, systemIndex: number) => void;
  onUpdateSpace?: (spaceId: string, patch: Partial<SpacingObject>) => void;
  onDeleteSpace?: (spaceId: string) => void;
  visiblePageIndices?: number[];
  onPageCountCalculated?: (count: number) => void;
  isPrintView?: boolean;
}

export const NotationRenderer: React.FC<NotationRendererProps> = ({
  score,
  toolMode,
  selection,
  playbackPosition,
  onSelectMeasure,
  onSelectBeat,
  onSelectVolta,
  onMeasureContextMenu,
  onOpenNavigationPalette,
  onUpdateBeatLyric,
  onUpdateBeatChord,
  onToggleBeatSymbol,
  onToggleLineBreak,
  onSelectTextAnnotation,
  onEditTextAnnotation,
  onOpenAddTextModal,
  onDeleteTextAnnotation,
  onMoveTextAnnotation,
  onCommitMoveTextAnnotation,
  onUpdateTextAnnotation,
  onSelectSpace,
  onAddSpace,
  onUpdateSpace,
  onDeleteSpace,
  visiblePageIndices,
  onPageCountCalculated,
  isPrintView = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPlaying = Boolean(playbackPosition) || audioEngine.getIsPlaying();
  const keyboardLayout = score.layoutSettings.keyboardLayout || score.metadata.keyboardLayout || '61';

  // Inline Editing Popovers State
  const [activeChordPopover, setActiveChordPopover] = useState<{
    measureId: string;
    beatIndex: number;
    initialValue: string;
    x: number;
    y: number;
  } | null>(null);

  const [activeLyricPopover, setActiveLyricPopover] = useState<{
    measureId: string;
    beatIndex: number;
    subBeatIndex: number;
    initialValue: string;
    x: number;
    y: number;
  } | null>(null);

  const [chordInputValue, setChordInputValue] = useState('');
  const [lyricInputValue, setLyricInputValue] = useState('');

  // Paper dimensions at standard 96 DPI:
  // A4: 210mm x 297mm (794px x 1123px)
  // Letter: 8.5in x 11in (816px x 1056px)
  // A3: 297mm x 420mm (1123px x 1587px)
  // Legal: 8.5in x 14in (816px x 1344px)
  const isLandscape = score.layoutSettings.orientation === 'landscape';
  const requestedSize = (score.layoutSettings.pageSize || 'A4').toLowerCase();
  let baseWidth = 794;
  let baseHeight = 1123;
  if (requestedSize === 'letter') {
    baseWidth = 816;
    baseHeight = 1056;
  } else if (requestedSize === 'a3') {
    baseWidth = 1123;
    baseHeight = 1587;
  } else if (requestedSize === 'legal') {
    baseWidth = 816;
    baseHeight = 1344;
  }

  const pageWidth = isLandscape ? baseHeight : baseWidth;
  const pageHeight = isLandscape ? baseWidth : baseHeight;
  const zoom = score.layoutSettings.zoom || 1.0;

  const handTemplate = score.metadata.handTemplate || 'Both';
  const pickupBeat = score.metadata.pickupBeat || 1;

  const staffMarginLeft = score.layoutSettings.pageMargins?.left ?? 44;
  const staffMarginRight = score.layoutSettings.pageMargins?.right ?? 44;
  const staffMarginTop = score.layoutSettings.pageMargins?.top ?? 36;
  const staffMarginBottom = score.layoutSettings.pageMargins?.bottom ?? 36;
  const contentWidth = Math.max(300, pageWidth - staffMarginLeft - staffMarginRight);

  const measureBlockHeight = 136;
  const systemGap = 24;

  // Helper to find chord for beat
  const getChordForBeat = (measure: Measure, beatIndex: number): string | undefined => {
    if (measure.beatChords && measure.beatChords[beatIndex] !== undefined) {
      return measure.beatChords[beatIndex];
    }
    if (measure.chordSymbols && measure.chordSymbols.length > 0) {
      const cs = measure.chordSymbols.find((c) => Math.floor(c.beatOffset) === beatIndex);
      return cs?.formatted || (cs ? `${cs.root}${cs.quality || ''}` : undefined);
    }
    return undefined;
  };

  // Content-Aware Natural Width Calculator for Measure
  const getMeasureNaturalWidth = (measure: Measure): number => {
    const ts = measure.timeSignature || score.metadata.initialTimeSignature;
    const totalBeats = getMeasureTotalBeats(measure, ts, score.metadata.indianTaal);
    const baseBeatWidth = 44; // standard readable single-beat width
    const beatPitchesList = getMeasureBeatPitches(measure, totalBeats, handTemplate);
    let contentRequired = 0;

    for (let b = 0; b < totalBeats; b++) {
      const val = measure.beatValues?.[b] || 1;
      const pitches = beatPitchesList[b] || [];
      const count = Math.max(val, pitches.length, 1);

      // Note spacing: never shrink note size just to fit
      let noteSpacing = baseBeatWidth;
      if (count === 2) noteSpacing = 58;
      else if (count === 3) noteSpacing = 78;
      else if (count >= 4) noteSpacing = 24 * count + 6;

      // Chord text width requirement
      const chord = getChordForBeat(measure, b);
      let chordSpacing = 0;
      if (chord) {
        chordSpacing = chord.length * 8.5 + 14;
      }

      // Lyric text width requirement
      const lyric = measure.beatLyrics?.[b] || '';
      let lyricSpacing = 0;
      if (lyric) {
        lyricSpacing = lyric.length * 8 + 16;
      }
      for (let s = 1; s < count; s++) {
        const subLyric = measure.beatLyrics?.[`${b}_${s}`];
        if (subLyric) {
          lyricSpacing += subLyric.length * 7.5 + 10;
        }
      }

      const beatWidth = Math.max(baseBeatWidth, noteSpacing, chordSpacing, lyricSpacing);
      contentRequired += beatWidth;
    }

    // Left & right barlines, margins
    contentRequired += 20;
    const measureLock = score.layoutSettings.measureLockPerLine;
    const isLocked = measureLock !== null && measureLock !== undefined && measureLock > 0;
    const targetBars = isLocked ? Math.max(1, Math.round(measureLock)) : (score.layoutSettings.barsPerLine || 4);
    const minBlankWidth = targetBars >= 6 ? 108 : targetBars === 5 ? 120 : 140;
    const defaultBlankWidth = Math.max(minBlankWidth, totalBeats * (targetBars >= 6 ? 34 : 40) + 20);

    return Math.max(defaultBlankWidth, contentRequired, measure.customWidth || 0);
  };

  // Dynamic Reflow & Measures per system calculation (Honors manual line breaks and Measure Lock independently)
  const { systems, activeLineWidth } = useMemo(() => {
    const sysList: {
      systemIndex: number;
      measures: { measure: Measure; width: number; measureIdx: number; naturalWidth: number }[];
    }[] = [];
    const measureLock = score.layoutSettings.measureLockPerLine;
    const isLocked = measureLock !== null && measureLock !== undefined && measureLock > 0;
    const lockCount = isLocked ? Math.max(1, Math.round(measureLock)) : null;
    const userBarsPerLine =
      score.layoutSettings.barsPerLine || score.layoutSettings.measuresPerSystemAuto || 4;
    const autoBarsPerLine = Math.max(1, userBarsPerLine);

    let currentSystem: { measure: Measure; width: number; measureIdx: number; naturalWidth: number }[] = [];
    let currentNaturalSum = 0;

    score.measures.forEach((m, idx) => {
      const natWidth = getMeasureNaturalWidth(m);
      const prevMeasure = currentSystem.length > 0 ? currentSystem[currentSystem.length - 1].measure : null;
      const prevHadManualBreak = prevMeasure ? Boolean(prevMeasure.systemBreak) : false;

      let shouldBreak = false;
      if (currentSystem.length > 0) {
        if (prevHadManualBreak) {
          // Manual line break placed on previous measure has local priority
          shouldBreak = true;
        } else if (isLocked && lockCount) {
          // Fixed lock per line: break when reached lockCount
          shouldBreak = currentSystem.length >= lockCount;
        } else {
          // Off: responsive reflow based on width and barsPerLine
          const wouldExceedBars = currentSystem.length >= autoBarsPerLine;
          const wouldOverflowWidth = currentNaturalSum + natWidth > contentWidth;
          shouldBreak = wouldExceedBars || wouldOverflowWidth;
        }
      }

      if (currentSystem.length > 0 && shouldBreak) {
        sysList.push({ systemIndex: sysList.length, measures: currentSystem });
        currentSystem = [];
        currentNaturalSum = 0;
      }

      currentSystem.push({
        measure: m,
        width: 0,
        measureIdx: idx,
        naturalWidth: natWidth,
      });
      currentNaturalSum += natWidth;
    });

    if (currentSystem.length > 0) {
      sysList.push({ systemIndex: sysList.length, measures: currentSystem });
    }

    // Justify systems strictly across contentWidth (fixed A4 printable width)
    sysList.forEach((sys) => {
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

    return { systems: sysList, activeLineWidth: contentWidth };
  }, [
    score.measures,
    score.layoutSettings.barsPerLine,
    score.layoutSettings.measuresPerSystemAuto,
    score.layoutSettings.measureLockPerLine,
    contentWidth,
    score.metadata.initialTimeSignature,
    handTemplate,
  ]);

  // Normalized voltas from score
  const voltas = useMemo(() => getNormalizedVoltas(score), [score]);

  // Dynamic Header & Footer calculations
  const showHeader = score.layoutSettings.showHeader !== false;
  const headerCustomText = score.layoutSettings.headerCustomText;
  const headerAlignment = score.layoutSettings.headerAlignment || 'center';
  const headerFontSize = score.layoutSettings.headerFontSize ?? 26;
  const headerSpaceFromTop = score.layoutSettings.headerSpaceFromTop ?? 40;
  const headerSpaceFromScore = score.layoutSettings.headerSpaceFromScore ?? 25;

  const showFooter = score.layoutSettings.showFooter !== false;
  const footerCustomText = score.layoutSettings.footerCustomText;
  const footerAlignment = score.layoutSettings.footerAlignment || 'left';
  const footerFontSize = score.layoutSettings.footerFontSize ?? 10;
  const footerSpaceFromBottom = score.layoutSettings.footerSpaceFromBottom ?? 25;
  const footerSpaceFromScore = score.layoutSettings.footerSpaceFromScore ?? 16;
  const showPageNumber = score.layoutSettings.showPageNumber !== false && score.layoutSettings.footerPageNumbering !== 'none';
  const pageNumberPosition = score.layoutSettings.pageNumberPosition || 'right';

  const footerReservedHeight = (showFooter || showPageNumber)
    ? (footerSpaceFromBottom + footerFontSize + footerSpaceFromScore)
    : 0;

  // Page margin bottom and footer reservation calculation
  const pageMarginBottom = Math.max(16, score.layoutSettings.pageMargins?.bottom ?? 36);
  const bottomPrintableMargin = pageHeight - Math.max(pageMarginBottom, footerReservedHeight);

  // Dynamic start Y positions
  // Page 1 always reserves space for the canonical Score Header (Title, Subtitle, Tempo, Time Signature, Composer, Lyricist)
  const computedFirstPageStartY = Math.round(
    staffMarginTop * 0.75 +
    (score.metadata.subtitle ? 58 : 42) +
    28 +
    Math.max(16, headerSpaceFromScore)
  );
  const computedSubsequentPageStartY = showHeader
    ? Math.round(Math.max(24, headerSpaceFromTop * 0.7) + 16 + Math.min(24, headerSpaceFromScore))
    : Math.max(24, score.layoutSettings.pageMargins?.top ?? 36);

  // Helper to retrieve extra vertical spacing defined by Space Tool
  const getSystemExtraSpace = (sys: typeof systems[0], globalSysIdx: number) => {
    const lastMeasure = sys.measures[sys.measures.length - 1]?.measure;
    if (!score.spacingObjects || score.spacingObjects.length === 0) return 0;
    const match = score.spacingObjects.filter(
      (s) => (lastMeasure && s.afterMeasureId === lastMeasure.id) || s.systemIndex === globalSysIdx
    );
    return match.reduce((sum, s) => sum + (s.amount || 0), 0);
  };

  // Group systems into exact pages based on vertical height
  const pages = useMemo(() => {
    const pageList: { systems: typeof systems; startY: number }[] = [];
    let curPageSystems: typeof systems = [];
    let currentY = computedFirstPageStartY;

    systems.forEach((sys, sysIdx) => {
      const extraSpace = getSystemExtraSpace(sys, sysIdx);
      const sysSpan = measureBlockHeight + systemGap + extraSpace;
      const prevSystem = curPageSystems.length > 0 ? curPageSystems[curPageSystems.length - 1] : null;
      const prevHadPageBreak = prevSystem
        ? prevSystem.measures.some((m) => m.measure.pageBreak)
        : false;

      // Check if adding this system would overflow the printable height of the page
      const wouldOverflowPage = currentY + sysSpan > bottomPrintableMargin;

      if (curPageSystems.length > 0 && (wouldOverflowPage || prevHadPageBreak)) {
        pageList.push({
          systems: curPageSystems,
          startY: pageList.length === 0 ? computedFirstPageStartY : computedSubsequentPageStartY,
        });
        curPageSystems = [];
        currentY = computedSubsequentPageStartY;
      }

      curPageSystems.push(sys);
      currentY += sysSpan;
    });

    if (curPageSystems.length > 0) {
      pageList.push({
        systems: curPageSystems,
        startY: pageList.length === 0 ? computedFirstPageStartY : computedSubsequentPageStartY,
      });
    }

    return pageList.length > 0
      ? pageList
      : [{ systems: [], startY: computedFirstPageStartY }];
  }, [systems, measureBlockHeight, systemGap, bottomPrintableMargin, computedFirstPageStartY, computedSubsequentPageStartY, score.spacingObjects]);

  const onPageCountRef = useRef(onPageCountCalculated);
  onPageCountRef.current = onPageCountCalculated;

  React.useEffect(() => {
    onPageCountRef.current?.(pages.length);
  }, [pages.length]);

  // Compute canonical page-level text objects, resolving legacy measure-bound annotations to page coordinates
  const canonicalTextObjects = useMemo(() => {
    const rawList = score.textObjects || score.textAnnotations || [];
    return rawList.map((t) => {
      if (t.x !== undefined && t.y !== undefined && t.pageIndex !== undefined) {
        return t;
      }
      let resolvedPage = t.pageIndex ?? 0;
      let resolvedX = t.x ?? 120;
      let resolvedY = t.y ?? 120;

      if (t.x === undefined || t.y === undefined) {
        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          const p = pages[pIdx];
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

      return {
        ...t,
        pageIndex: resolvedPage,
        x: resolvedX,
        y: resolvedY,
      };
    });
  }, [score.textObjects, score.textAnnotations, pages, staffMarginLeft, measureBlockHeight, systemGap]);

  const quickChordPresets = ['C', 'Am', 'F', 'G7', 'Dm', 'Cmaj7', 'Em', 'A7', 'G', 'D'];

  return (
    <div
      ref={containerRef}
      id="notation-canvas-container"
      className="min-w-fit w-full flex flex-col items-center select-none pt-6 px-8 pb-48 space-y-10 relative min-h-full"
      style={{
        transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        transformOrigin: 'top center',
        marginBottom: zoom > 1 ? `${(zoom - 1) * 800}px` : undefined,
      }}
    >
      {pages.map((pageData, pageIndex) => {
        if (visiblePageIndices && !visiblePageIndices.includes(pageIndex)) {
          return null;
        }

        const pageSystems = pageData.systems;
        const startY = pageData.startY;
        let currentSystemY = startY;

        return (
          <div
            key={`page-${pageIndex}`}
            className="flex flex-col items-center group/page"
          >
            {/* Page number badge indicator */}
            <div className="mb-2 px-3 py-0.5 rounded-full bg-stone-300/80 text-stone-700 text-[11px] font-medium tracking-wide flex items-center space-x-1.5 shadow-xs print:hidden print-preview-badge">
              <span>Page {pageIndex + 1}</span>
              <span className="text-stone-400">•</span>
              <span className="uppercase text-[10px] text-stone-500 font-semibold">{isLandscape ? 'A4 Landscape' : 'A4 Portrait'}</span>
            </div>

            {/* Authentic A4 Paper Sheet */}
            <div
              id={`a4-page-${pageIndex + 1}`}
              className="score-page a4-paper-sheet bg-white shadow-[0_4px_24px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)] border border-stone-200/90 rounded-[2px] relative shrink-0 transition-shadow hover:shadow-[0_8px_32px_rgba(0,0,0,0.16)] overflow-hidden"
              style={{
                width: `${pageWidth}px`,
                height: `${pageHeight}px`,
                minWidth: `${pageWidth}px`,
                minHeight: `${pageHeight}px`,
                maxWidth: `${pageWidth}px`,
                maxHeight: `${pageHeight}px`,
              }}
            >
              <svg
                width={pageWidth}
                height={pageHeight}
                viewBox={`0 0 ${pageWidth} ${pageHeight}`}
                className={`w-full h-full block ${toolMode === 'text' ? 'cursor-crosshair' : ''}`}
                onClick={(e) => {
                  if (toolMode === 'text') {
                    const svgEl = e.currentTarget;
                    let clickX = 120;
                    let clickY = 120;
                    if (svgEl) {
                      const pt = svgEl.createSVGPoint();
                      pt.x = e.clientX;
                      pt.y = e.clientY;
                      const ctm = svgEl.getScreenCTM();
                      if (ctm) {
                        const trans = pt.matrixTransform(ctm.inverse());
                        clickX = Math.round(trans.x);
                        clickY = Math.round(trans.y);
                      } else {
                        const rect = svgEl.getBoundingClientRect();
                        clickX = Math.round(((e.clientX - rect.left) / rect.width) * pageWidth);
                        clickY = Math.round(((e.clientY - rect.top) / rect.height) * pageHeight);
                      }
                    }
                    clickX = Math.max(15, Math.min(pageWidth - 25, clickX));
                    clickY = Math.max(15, Math.min(pageHeight - 15, clickY));

                    if (onOpenAddTextModal) {
                      (onOpenAddTextModal as any)({
                        pageIndex,
                        x: clickX,
                        y: clickY,
                      });
                    }
                  }
                }}
              >
                {/* Score Running Header on subsequent pages */}
                {pageIndex > 0 && showHeader && (
                  <g className="score-running-header">
                    <text
                      x={
                        headerAlignment === 'left'
                          ? staffMarginLeft
                          : headerAlignment === 'right'
                          ? pageWidth - staffMarginRight
                          : staffMarginLeft
                      }
                      y={Math.max(16, Math.round(headerSpaceFromTop * 0.65))}
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                      fontSize="10"
                      fill="#64748b"
                      textAnchor={
                        headerAlignment === 'right' ? 'end' : 'start'
                      }
                    >
                      {(headerCustomText && headerCustomText.trim().length > 0)
                        ? headerCustomText.trim()
                        : (score.metadata.title || 'Untitled Composition')}
                    </text>
                    {score.metadata.composer && headerAlignment !== 'right' && (
                      <text
                        x={pageWidth - staffMarginRight}
                        y={Math.max(16, Math.round(headerSpaceFromTop * 0.65))}
                        fontFamily="'Plus Jakarta Sans', sans-serif"
                        fontSize="10"
                        fill="#64748b"
                        textAnchor="end"
                      >
                        {score.metadata.composer}
                      </text>
                    )}
                  </g>
                )}

                {/* Score Header on First Page - Always rendered so Song Title & Info are never lost */}
                {pageIndex === 0 && (
                  <g className="score-header score-header-first-page">
                    {/* Score Title */}
                    <text
                      x={
                        headerAlignment === 'left'
                          ? staffMarginLeft
                          : headerAlignment === 'right'
                          ? pageWidth - staffMarginRight
                          : pageWidth / 2
                      }
                      y={Math.round(staffMarginTop * 0.75 + 18)}
                      fontFamily="'Lora', Georgia, serif"
                      fontSize="24"
                      fontWeight="bold"
                      fill="#0f172a"
                      textAnchor={
                        headerAlignment === 'left'
                          ? 'start'
                          : headerAlignment === 'right'
                          ? 'end'
                          : 'middle'
                      }
                    >
                      {score.metadata.title || 'Untitled Composition'}
                    </text>

                    {/* Subtitle */}
                    {score.metadata.subtitle && (
                      <text
                        x={
                          headerAlignment === 'left'
                            ? staffMarginLeft
                            : headerAlignment === 'right'
                            ? pageWidth - staffMarginRight
                            : pageWidth / 2
                        }
                        y={Math.round(staffMarginTop * 0.75 + 40)}
                        fontFamily="'Lora', Georgia, serif"
                        fontSize="13"
                        fontStyle="italic"
                        fill="#475569"
                        textAnchor={
                          headerAlignment === 'left'
                            ? 'start'
                            : headerAlignment === 'right'
                            ? 'end'
                            : 'middle'
                        }
                      >
                        {score.metadata.subtitle}
                      </text>
                    )}

                    {/* Tempo & Time Signature + Taal Label (Top Left) */}
                    {(() => {
                      const tempoY = Math.round(staffMarginTop * 0.75 + (score.metadata.subtitle ? 58 : 42));
                      return (
                        <g className="score-tempo-and-timesig">
                          {/* Vector Quarter Note (Crotchet) Musical Symbol */}
                          <g className="tempo-marking">
                            {/* Slanted oval notehead */}
                            <ellipse
                              cx={staffMarginLeft + 4.5}
                              cy={tempoY - 3.5}
                              rx="4.2"
                              ry="3.1"
                              transform={`rotate(-20 ${staffMarginLeft + 4.5} ${tempoY - 3.5})`}
                              fill="#0f172a"
                            />
                            {/* Crisp vertical stem pointing up */}
                            <line
                              x1={staffMarginLeft + 7.8}
                              y1={tempoY - 3.5}
                              x2={staffMarginLeft + 7.8}
                              y2={tempoY - 15.5}
                              stroke="#0f172a"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                            />
                            {/* Text: = 80 BPM */}
                            <text
                              x={staffMarginLeft + 13}
                              y={tempoY}
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                              fontSize="12"
                              fontWeight="bold"
                              fill="#0f172a"
                            >
                              = {score.metadata.tempoBpm || 80} BPM
                            </text>
                          </g>

                          {/* Time Signature & Taal */}
                          <text
                            x={staffMarginLeft}
                            y={tempoY + 18}
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                            fontSize="11"
                            fontWeight="600"
                            fill="#475569"
                          >
                            {formatTimeSignatureWithTaal(
                              score.metadata.initialTimeSignature,
                              score.metadata.indianTaal
                            )}
                          </text>
                        </g>
                      );
                    })()}

                    {/* Composer & Lyricist (Top Right) */}
                    {(() => {
                      const tempoY = Math.round(staffMarginTop * 0.75 + (score.metadata.subtitle ? 58 : 42));
                      return (
                        <g textAnchor="end">
                          {score.metadata.composer && (
                            <text
                              x={pageWidth - staffMarginRight}
                              y={tempoY}
                              fontFamily="'Lora', Georgia, serif"
                              fontSize="12"
                              fontWeight="600"
                              fill="#1e293b"
                            >
                              {score.metadata.composer}
                            </text>
                          )}
                          {score.metadata.lyricist && (
                            <text
                              x={pageWidth - staffMarginRight}
                              y={tempoY + (score.metadata.composer ? 16 : 0)}
                              fontFamily="'Lora', Georgia, serif"
                              fontSize="10"
                              fontStyle="italic"
                              fill="#64748b"
                            >
                              Lyrics: {score.metadata.lyricist}
                            </text>
                          )}
                        </g>
                      );
                    })()}
                  </g>
                )}

              {/* Render Systems / Lines */}
              {(() => {
                const systemPositions: Array<{
                  globalSysIdx: number;
                  systemY: number;
                  measureBlockHeight: number;
                  extraSpace: number;
                  lastMeasure: Measure;
                }> = [];

                return (
                  <>
                    {pageSystems.map((system, sysIdx) => {
                      const globalSysIdx = system.systemIndex !== undefined ? system.systemIndex : systems.indexOf(system);
                      const extraSpace = getSystemExtraSpace(system, globalSysIdx);
                      const systemY = currentSystemY;
                      currentSystemY += measureBlockHeight + systemGap + extraSpace;

                      const lastM = system.measures[system.measures.length - 1]?.measure;
                      if (lastM) {
                        systemPositions.push({
                          globalSysIdx,
                          systemY,
                          measureBlockHeight,
                          extraSpace,
                          lastMeasure: lastM,
                        });
                      }

                // Precompute layout positions for measures in this system
                let accX = staffMarginLeft;
                const systemMeasures = system.measures.map((mItem) => {
                  const mX = accX;
                  accX += mItem.width;
                  return { ...mItem, measureX: mX };
                });

                // Compute Volta ending segments across this system
                const systemVoltas = voltas.map((v) => {
                  const vStartIdx = score.measures.findIndex((m) => m.id === v.startMeasureId);
                  const vEndIdx = score.measures.findIndex((m) => m.id === v.endMeasureId);
                  if (vStartIdx === -1) return null;
                  const safeEndIdx = vEndIdx === -1 ? vStartIdx : Math.max(vStartIdx, vEndIdx);

                  const matchingInSys = systemMeasures.filter(
                    (item) => item.measureIdx >= vStartIdx && item.measureIdx <= safeEndIdx
                  );
                  if (matchingInSys.length === 0) return null;

                  const firstM = matchingInSys[0];
                  const lastM = matchingInSys[matchingInSys.length - 1];

                  const startX = firstM.measureX;
                  const endX = lastM.measureX + lastM.width;

                  const isVoltaStart = firstM.measureIdx === vStartIdx;
                  const isVoltaEnd = lastM.measureIdx === safeEndIdx;
                  const isVoltaSelected = selection.selectionType === 'volta' && selection.voltaId === v.id;

                  const label = v.text || (v.endingNumbers && v.endingNumbers.length > 0 ? `${v.endingNumbers.join(', ')}.` : '1.');

                  return {
                    volta: v,
                    startX,
                    endX,
                    isVoltaStart,
                    isVoltaEnd,
                    isVoltaSelected,
                    label,
                  };
                }).filter(Boolean);

                return (
                  <g key={`sys-${sysIdx}`} className="score-system">
                    {/* Render System-level Structured Voltas */}
                    {systemVoltas.map((seg) => {
                      if (!seg) return null;
                      const { volta: v, startX, endX, isVoltaStart, isVoltaEnd, isVoltaSelected, label } = seg;
                      const bracketY = systemY - 18;
                      const hookLen = 14;
                      const strokeColor = isVoltaSelected ? '#d97706' : '#1e293b';
                      const strokeW = isVoltaSelected ? 2.5 : 1.6;

                      return (
                        <g
                          key={`volta-${v.id}-${sysIdx}`}
                          className="volta-bracket-group cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectVolta?.(v.id);
                          }}
                        >
                          {/* Clickable hit area */}
                          <rect
                            x={startX - 2}
                            y={bracketY - 8}
                            width={Math.max(24, endX - startX + 4)}
                            height={hookLen + 12}
                            fill={isVoltaSelected ? 'rgba(217, 119, 6, 0.08)' : 'transparent'}
                            stroke={isVoltaSelected ? '#f59e0b' : 'transparent'}
                            strokeDasharray={isVoltaSelected ? '3 3' : 'none'}
                            strokeWidth="1"
                            rx="3"
                            className="hover:fill-amber-500/10 transition-colors"
                          />

                          {/* Start downward hook */}
                          {isVoltaStart && (
                            <line
                              x1={startX}
                              y1={bracketY}
                              x2={startX}
                              y2={bracketY + hookLen}
                              stroke={strokeColor}
                              strokeWidth={strokeW}
                              strokeLinecap="square"
                            />
                          )}

                          {/* Horizontal spanning bar */}
                          <line
                            x1={startX}
                            y1={bracketY}
                            x2={endX}
                            y2={bracketY}
                            stroke={strokeColor}
                            strokeWidth={strokeW}
                            strokeLinecap="square"
                          />

                          {/* End downward hook (if closedEnd) */}
                          {isVoltaEnd && v.closedEnd !== false && (
                            <line
                              x1={endX}
                              y1={bracketY}
                              x2={endX}
                              y2={bracketY + hookLen}
                              stroke={strokeColor}
                              strokeWidth={strokeW}
                              strokeLinecap="square"
                            />
                          )}

                          {/* Ending label text */}
                          {isVoltaStart && (
                            <text
                              x={startX + 6}
                              y={bracketY + 11}
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                              fontSize="11"
                              fontWeight="bold"
                              fill={isVoltaSelected ? '#d97706' : '#1e293b'}
                              className="select-none pointer-events-none"
                            >
                              {label}
                            </text>
                          )}

                          {/* Selected pill badge */}
                          {isVoltaSelected && isVoltaStart && (
                            <g transform={`translate(${startX + 34}, ${bracketY - 14})`}>
                              <rect
                                x="0"
                                y="0"
                                width="56"
                                height="15"
                                rx="3"
                                fill="#d97706"
                              />
                              <text
                                x="28"
                                y="11"
                                fontFamily="'Plus Jakarta Sans', sans-serif"
                                fontSize="8.5"
                                fontWeight="bold"
                                fill="#ffffff"
                                textAnchor="middle"
                              >
                                VOLTA
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}

                    {systemMeasures.map(({ measure, width, measureIdx, measureX }, mIdxInSys) => {
                      const isSelectedMeasure =
                        !isPrintView && (
                          selection.measureId === measure.id ||
                          Boolean(selection.selectedMeasureIds?.includes(measure.id))
                        );
                      const totalBeats = getMeasureTotalBeats(
                        measure,
                        score.metadata.initialTimeSignature,
                        score.metadata.indianTaal
                      );
                      const colWidth = width / totalBeats;
                      const beatPitches = getMeasureBeatPitches(measure, totalBeats, handTemplate);

                      return (
                        <g
                          key={measure.id}
                          className="pianotastic-measure-block"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (onMeasureContextMenu) {
                              onMeasureContextMenu(measure, e.clientX, e.clientY);
                            }
                          }}
                        >

                          {/* Navigation Target badge (Segno, Coda, Fine) */}
                          {measure.navigationTarget && (
                            <text
                              x={measureX + width - 6}
                              y={systemY - 6}
                              fontFamily="'Lora', Georgia, serif"
                              fontSize="11"
                              fontWeight="bold"
                              fill="#b45309"
                              textAnchor="end"
                            >
                              {measure.navigationTarget === 'Segno'
                                ? '𝄋 Segno'
                                : measure.navigationTarget === 'Coda'
                                ? '𝄌 Coda'
                                : 'Fine'}
                            </text>
                          )}

                          {/* Pure Sheet Music Measure Surface (No boxes/borders, transparent click target) */}
                          <rect
                            x={measureX}
                            y={systemY - 20}
                            width={width}
                            height={measureBlockHeight + 40}
                            fill={isSelectedMeasure && !isPrintView ? '#eff6ff' : 'transparent'}
                            fillOpacity={isSelectedMeasure && !isPrintView ? '0.75' : '0'}
                            stroke={isSelectedMeasure && !isPrintView ? '#3b82f6' : 'transparent'}
                            strokeWidth={isSelectedMeasure && !isPrintView ? '1.5' : '0'}
                            rx={4}
                            className={toolMode === 'text' ? 'cursor-text' : 'cursor-pointer'}
                            onClick={(e) => {
                              if (toolMode === 'text') {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                const relX = (e.clientX - rect.left) / zoom;
                                const b = Math.min(totalBeats - 1, Math.max(0, Math.floor(relX / colWidth)));
                                const relY = (e.clientY - rect.top) / zoom;
                                const isAbove = relY < (measureBlockHeight + 40) / 2;
                                onOpenAddTextModal?.(measure.id, b, isAbove ? 'above' : 'below');
                                return;
                              }
                              onSelectMeasure(measure.id, e.ctrlKey || e.metaKey, e.shiftKey);
                            }}
                          />

                          {/* Left Barline (Start of System) */}
                          {mIdxInSys === 0 && !measure.repeatStart && (
                            <line
                              x1={measureX}
                              y1={systemY + 16}
                              x2={measureX}
                              y2={systemY + measureBlockHeight - 12}
                              stroke="#000000"
                              strokeWidth="1.75"
                              strokeLinecap="square"
                            />
                          )}

                          {/* Measure Number (Clean sheet music label, no box header) */}
                          <text
                            x={measureX + 6}
                            y={systemY + 14}
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                            fontSize="11"
                            fontWeight="bold"
                            fill={isSelectedMeasure ? '#000000' : '#64748b'}
                          >
                            {measure.measureNumber}
                            {measure.measureNumber === 1 && pickupBeat > 1 && (
                              <tspan fill="#b45309" fontSize="9" fontWeight="bold">
                                {' '}
                                (Pickup @ Beat {pickupBeat})
                              </tspan>
                            )}
                            {isSelectedMeasure && !isPlaying && !isPrintView && (
                              <tspan
                                fill="#10b981"
                                fontSize="9"
                                fontWeight="bold"
                                className="print:hidden opacity-90"
                              >
                                {' '}▶ Start
                              </tspan>
                            )}
                          </text>

                          {/* Section Title (Center) */}
                          {measure.sectionName && (
                            <text
                              x={measureX + width / 2}
                              y={systemY + 14}
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                              fontSize="10"
                              fontWeight="bold"
                              letterSpacing="1"
                              fill="#0f172a"
                              textAnchor="middle"
                            >
                              {measure.sectionName.toUpperCase()}
                            </text>
                          )}

                          {/* Navigation Jump Indicator (Right) - Never display 'Both' or hand template text */}
                          {measure.navigationJump && (
                            <g
                              className="cursor-pointer opacity-80 hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenNavigationPalette) {
                                  onOpenNavigationPalette(measure);
                                }
                              }}
                            >
                              <text
                                x={measureX + width - 8}
                                y={systemY + 14}
                                fontFamily="'Plus Jakarta Sans', sans-serif"
                                fontSize="9"
                                fontWeight="600"
                                fill="#64748b"
                                textAnchor="end"
                              >
                                {measure.navigationJump}
                              </text>
                            </g>
                          )}

                          {/* Manual Line Break Indicator (Enter) */}
                          {measure.systemBreak && !isPrintView && (
                            <g
                              className="cursor-pointer group"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onToggleLineBreak) {
                                  onToggleLineBreak(measure.id);
                                }
                              }}
                            >
                              <rect
                                x={measureX + width - (measure.navigationJump ? 52 : 36)}
                                y={systemY + 2}
                                width={18}
                                height={14}
                                rx={3}
                                fill="#f1f5f9"
                                stroke="#94a3b8"
                                strokeWidth={1}
                              />
                              <text
                                x={measureX + width - (measure.navigationJump ? 43 : 27)}
                                y={systemY + 12}
                                fontFamily="'Plus Jakarta Sans', sans-serif"
                                fontSize="10"
                                fontWeight="bold"
                                fill="#475569"
                                textAnchor="middle"
                              >
                                ↵
                              </text>
                            </g>
                          )}

                          {/* Beat Columns (Pure Sheet Music: No horizontal or beat divider grid lines) */}
                          {Array.from({ length: totalBeats }, (_, b) => {
                            const colX = measureX + b * colWidth;
                            const colCenterX = colX + colWidth / 2;
                            const isLocked = isBeatLockedByPickup(measure.measureNumber, b, pickupBeat);
                            const isSelectedBeat =
                              !isPrintView && selection.measureId === measure.id && selection.beatIndex === b;
                            const isPlayhead =
                              !isPrintView &&
                              playbackPosition?.measureIndex === measureIdx &&
                              Math.floor(playbackPosition.beat) === b;

                            const rawChord = getChordForBeat(measure, b);
                            const isPlaceholderChord = (c?: string | null) => {
                              if (!c) return true;
                              const s = c.trim();
                              return !s || s === '##' || s === '#' || s.toLowerCase() === 'chord' || s.toLowerCase() === '+ chord';
                            };
                            const chord = !isPlaceholderChord(rawChord) ? rawChord?.trim() : undefined;

                            const effVal =
                              measure.beatValues?.[b] ||
                              getEffectiveBeatValue(score, measureIdx, b);
                            const rawPitches = beatPitches[b] || [];
                            const pitches: (Pitch | null)[] =
                              effVal > 1
                                ? Array.from({ length: effVal }, (_, i) => rawPitches[i] ?? null)
                                : rawPitches;
                            const rawLyric = measure.beatLyrics?.[b] || '';
                            const isPlaceholderLyric = (l?: string | null) => {
                              if (!l) return true;
                              const s = l.trim();
                              return !s || s.toLowerCase() === 'lyric' || s.toLowerCase() === '+ lyric' || s === '##';
                            };
                            const lyric = !isPlaceholderLyric(rawLyric) ? rawLyric.trim() : '';
                            const symbols = measure.beatSymbols?.[b] || [];

                            return (
                              <g
                                key={`m-${measure.id}-b-${b}`}
                                className="beat-column-group"
                              >
                                {/* Playhead Active Illumination */}
                                {isPlayhead && (
                                  <rect
                                    x={colX + 1}
                                    y={systemY + 22}
                                    width={colWidth - 2}
                                    height={measureBlockHeight - 34}
                                    rx={4}
                                    fill="#3b82f6"
                                    fillOpacity="0.18"
                                  />
                                )}

                                {/* Selected Beat / Subdivision Highlight */}
                                {isSelectedBeat && effVal === 1 && (
                                  <rect
                                    x={colX + 2}
                                    y={systemY + 22}
                                    width={colWidth - 4}
                                    height={measureBlockHeight - 34}
                                    rx={4}
                                    fill="#fef3c7"
                                    fillOpacity="0.6"
                                  />
                                )}
                                {isSelectedBeat && effVal > 1 && (
                                  <rect
                                    x={colX + Math.min(effVal - 1, Math.max(0, selection.subBeatIndex || 0)) * (colWidth / effVal) + 1}
                                    y={systemY + 22}
                                    width={colWidth / effVal - 2}
                                    height={measureBlockHeight - 34}
                                    rx={4}
                                    fill="#fef3c7"
                                    fillOpacity="0.7"
                                  />
                                )}

                                {/* Locked Pickup Beat Background */}
                                {isLocked && (
                                  <rect
                                    x={colX + 1}
                                    y={systemY + 22}
                                    width={colWidth - 2}
                                    height={measureBlockHeight - 34}
                                    fill="#f8fafc"
                                    fillOpacity="0.6"
                                  />
                                )}

                                {/* ================= ROW 1: CHORD ROW (Clickable for Chord Entry) ================= */}
                                <g
                                  className="cursor-pointer group/chord"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (toolMode === 'text') {
                                      onOpenAddTextModal?.(measure.id, b, 'above');
                                      return;
                                    }
                                    if (!isLocked) {
                                      onSelectBeat(measure.id, b, 0, 'chord');
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setActiveChordPopover({
                                        measureId: measure.id,
                                        beatIndex: b,
                                        initialValue: chord || '',
                                        x: rect.left,
                                        y: rect.top,
                                      });
                                      setChordInputValue(chord || '');
                                    }
                                  }}
                                >
                                  <rect
                                    x={colX + 2}
                                    y={systemY + 24}
                                    width={colWidth - 4}
                                    height={18}
                                    fill="transparent"
                                    className="hover:fill-blue-500/10"
                                  />
                                  {chord ? (
                                    <text
                                      x={colCenterX}
                                      y={systemY + 38}
                                      fontFamily="'Plus Jakarta Sans', sans-serif"
                                      fontSize="13"
                                      fontWeight="bold"
                                      fill="#2563eb"
                                      textAnchor="middle"
                                    >
                                      {chord}
                                    </text>
                                  ) : (
                                    !isPrintView && !isLocked && (
                                      <text
                                        x={colCenterX}
                                        y={systemY + 37}
                                        fontFamily="'Plus Jakarta Sans', sans-serif"
                                        fontSize="9"
                                        fill="#93c5fd"
                                        textAnchor="middle"
                                        className="opacity-0 group-hover/chord:opacity-100 transition-opacity"
                                      >
                                        + chord
                                      </text>
                                    )
                                  )}
                                </g>

                                {/* ================= ROW 2: BEAT NUMBER ROW ================= */}
                                <g
                                  className="cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (toolMode === 'text') {
                                      onOpenAddTextModal?.(measure.id, b, 'above');
                                      return;
                                    }
                                    if (!isLocked) {
                                      onSelectBeat(measure.id, b, 0, 'beat');
                                    }
                                  }}
                                >
                                  <text
                                    x={colCenterX}
                                    y={systemY + 56}
                                    fontFamily="'Plus Jakarta Sans', sans-serif"
                                    fontSize="11"
                                    fontWeight="600"
                                    fill={isLocked ? '#94a3b8' : isSelectedBeat ? '#d97706' : '#64748b'}
                                    textAnchor="middle"
                                  >
                                    {b + 1}
                                    {isLocked && ' 🔒'}
                                  </text>
                                </g>

                                {/* ================= ROW 3: NOTE LETTER ROW ================= */}
                                <g
                                  className="cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (toolMode === 'text') {
                                      onOpenAddTextModal?.(measure.id, b, 'above');
                                      return;
                                    }
                                    if (!isLocked && effVal === 1) {
                                      onSelectBeat(measure.id, b, 0, 'note');
                                    }
                                  }}
                                >
                                  {isLocked ? (
                                    <text
                                      x={colCenterX}
                                      y={systemY + 84}
                                      fontFamily="'Plus Jakarta Sans', sans-serif"
                                      fontSize="18"
                                      fontWeight="bold"
                                      fill="#cbd5e1"
                                      textAnchor="middle"
                                    >
                                      —
                                    </text>
                                  ) : pitches.length === 0 ? (
                                    <g>
                                      <text
                                        x={colCenterX}
                                        y={systemY + 84}
                                        fontFamily="'Plus Jakarta Sans', sans-serif"
                                        fontSize="18"
                                        fontWeight="bold"
                                        fill="#94a3b8"
                                        textAnchor="middle"
                                      >
                                        —
                                      </text>
                                      {isSelectedBeat && (selection.subBeatIndex === undefined || selection.subBeatIndex === 0) && (
                                        <circle
                                          cx={colCenterX}
                                          cy={systemY + 92}
                                          r={2.8}
                                          fill="#f59e0b"
                                        />
                                      )}
                                    </g>
                                  ) : (
                                    // Multiple or single notes within this beat
                                    <g>
                                      {pitches.map((p, pIdx) => {
                                        const count = pitches.length;
                                        const subWidth = colWidth / count;
                                        const subX = colX + pIdx * subWidth;
                                        const noteX = subX + subWidth / 2;

                                        const isSubBeatActive =
                                          isSelectedBeat && (selection.subBeatIndex || 0) === pIdx;
                                        const isEmptySub = !p || !p.step;
                                        const isRestDot = Boolean(p && (p as any).isRest);
                                        const hasAnyNoteInBeat = rawPitches.some((x) => x && x.step);
                                        const firstRealNoteIdx = rawPitches.findIndex((x) => x && x.step);

                                        return (
                                          <g
                                            key={`p-${pIdx}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (toolMode === 'text') {
                                                onOpenAddTextModal?.(measure.id, b, 'above');
                                                return;
                                              }
                                              if (!isLocked) {
                                                onSelectBeat(measure.id, b, pIdx, 'note');
                                              }
                                            }}
                                            className="cursor-pointer"
                                          >
                                            {/* Full seamless hit-box for this subdivision */}
                                            <rect
                                              x={subX}
                                              y={systemY + 54}
                                              width={subWidth}
                                              height={46}
                                              fill="transparent"
                                              className="hover:fill-amber-500/10"
                                            />

                                            {/* Sub-beat cursor indicator */}
                                            {isSubBeatActive && (
                                              <circle
                                                cx={noteX}
                                                cy={systemY + 92}
                                                r={2.8}
                                                fill="#f59e0b"
                                              />
                                            )}

                                            {/* Note letter with exact octave directly beside it, or subdivision dot/dash */}
                                            {isEmptySub ? (
                                              <text
                                                x={noteX}
                                                y={systemY + 84}
                                                fontFamily="'Plus Jakarta Sans', sans-serif"
                                                fontSize={count > 2 ? '14' : count === 2 ? '17' : '18'}
                                                fontWeight="bold"
                                                fill={isSubBeatActive ? '#b45309' : '#94a3b8'}
                                                textAnchor="middle"
                                              >
                                                {isRestDot ? '.' : (count > 1 ? '.' : '—')}
                                              </text>
                                            ) : (() => {
                                              const dispOct = p ? String(getDisplayOctave(p.octave ?? (handTemplate === 'LH' ? 3 : 4), keyboardLayout)) : '';
                                              const letterSize = count > 2 ? 14 : count === 2 ? 17 : 18;
                                              const layout = calculateAccidentalLayout(
                                                {
                                                  noteX,
                                                  letterY: systemY + 84,
                                                  letterSize,
                                                  subBeatCount: count,
                                                },
                                                p?.accidental
                                              );
                                              const mainColor = isSubBeatActive ? '#b45309' : '#0f172a';

                                              return (
                                                  <g className="note-cluster-vector">
                                                    {/* Vector Accidental — upper-right mathematical superscript positioning */}
                                                    {layout.hasAccidental && layout.type && (
                                                      <AccidentalVectorGlyph
                                                        type={layout.type}
                                                        x={layout.accidentalX}
                                                        y={layout.accidentalY}
                                                        scale={layout.accidentalScale}
                                                        color={mainColor}
                                                      />
                                                    )}

                                                    {/* Note Letter — authoritative position untouched */}
                                                    <text
                                                      x={layout.letterX}
                                                      y={layout.letterY}
                                                      fontFamily="'Plus Jakarta Sans', sans-serif"
                                                      fontSize={layout.letterSize}
                                                      fontWeight="bold"
                                                      fill={mainColor}
                                                      textAnchor="middle"
                                                    >
                                                      {p?.step}
                                                    </text>

                                                    {/* Superscript Octave ASCII Digit — authoritative position untouched */}
                                                    <text
                                                      x={layout.octaveX}
                                                      y={layout.octaveY}
                                                      fontFamily="'Plus Jakarta Sans', sans-serif"
                                                      fontSize={layout.octaveSize}
                                                      fontWeight="bold"
                                                      fill={isSubBeatActive ? '#92400e' : '#1e293b'}
                                                      textAnchor="middle"
                                                    >
                                                      {dispOct}
                                                    </text>
                                                  </g>
                                              );
                                            })()}
                                          </g>
                                        );
                                      })}
                                    </g>
                                  )}
                                </g>

                                {/* ================= ROW 4: SYMBOLS ROW (Features ⌣ prominently) ================= */}
                                <g
                                  className="cursor-pointer group/symbol"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (toolMode === 'text') {
                                      onOpenAddTextModal?.(measure.id, b, 'below');
                                      return;
                                    }
                                    if (!isLocked) {
                                      onSelectBeat(measure.id, b, 0, 'symbol');
                                      if (toolMode === 'symbol' || !symbols.includes('⌣')) {
                                        // Quick toggle ⌣ symbol on beat
                                        if (onToggleBeatSymbol) {
                                          onToggleBeatSymbol(measure.id, b, '⌣');
                                        }
                                      }
                                    }
                                  }}
                                >
                                  <rect
                                    x={colX + 2}
                                    y={systemY + 100}
                                    width={colWidth - 4}
                                    height={16}
                                    fill="transparent"
                                    className="hover:fill-purple-500/10"
                                  />
                                  {symbols.length > 0 ? (
                                    <g>
                                      {symbols.map((sym, sIdx) => {
                                        if (sym === '⌣') {
                                          return (
                                            <path
                                              key={`sym-${sIdx}`}
                                              d={`M ${colCenterX - 7} ${systemY + 107} Q ${colCenterX} ${systemY + 115} ${colCenterX + 7} ${systemY + 107}`}
                                              stroke="#6b21a8"
                                              strokeWidth="1.8"
                                              fill="none"
                                              strokeLinecap="round"
                                            />
                                          );
                                        }
                                        return (
                                          <text
                                            key={`sym-${sIdx}`}
                                            x={colCenterX}
                                            y={systemY + 114}
                                            fontFamily="'Plus Jakarta Sans', sans-serif"
                                            fontSize="17"
                                            fontWeight="bold"
                                            fill="#6b21a8"
                                            textAnchor="middle"
                                          >
                                            {sym}
                                          </text>
                                        );
                                      })}
                                    </g>
                                  ) : (
                                    !isPrintView && !isLocked && (
                                      <path
                                        d={`M ${colCenterX - 6} ${systemY + 108} Q ${colCenterX} ${systemY + 114} ${colCenterX + 6} ${systemY + 108}`}
                                        stroke="#d8b4fe"
                                        strokeWidth="1.4"
                                        fill="none"
                                        strokeLinecap="round"
                                        className="opacity-0 group-hover/symbol:opacity-100 transition-opacity"
                                      />
                                    )
                                  )}
                                </g>

                                {/* ================= ROW 5: LYRICS ROW ================= */}
                                <g
                                  className="cursor-pointer group/lyric"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (toolMode === 'text') {
                                      onOpenAddTextModal?.(measure.id, b, 'below');
                                      return;
                                    }
                                    if (!isLocked) {
                                      onSelectBeat(measure.id, b, 0, 'lyrics');
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setActiveLyricPopover({
                                        measureId: measure.id,
                                        beatIndex: b,
                                        subBeatIndex: 0,
                                        initialValue: lyric,
                                        x: rect.left,
                                        y: rect.top,
                                      });
                                      setLyricInputValue(lyric);
                                    }
                                  }}
                                >
                                  <rect
                                    x={colX + 2}
                                    y={systemY + 120}
                                    width={colWidth - 4}
                                    height={18}
                                    fill="transparent"
                                    className="hover:fill-amber-500/10"
                                  />
                                  {lyric ? (
                                    <text
                                      x={colCenterX}
                                      y={systemY + 133}
                                      fontFamily="'Lora', Georgia, serif"
                                      fontSize="11"
                                      fontWeight="500"
                                      fontStyle="italic"
                                      fill="#334155"
                                      textAnchor="middle"
                                    >
                                      {lyric}
                                    </text>
                                  ) : (
                                    !isPrintView && !isLocked && (
                                      <text
                                        x={colCenterX}
                                        y={systemY + 133}
                                        fontFamily="'Lora', Georgia, serif"
                                        fontSize="9"
                                        fill="#cbd5e1"
                                        textAnchor="middle"
                                        className="opacity-0 group-hover/lyric:opacity-100 transition-opacity"
                                      >
                                        + lyric
                                      </text>
                                    )
                                  )}
                                </g>
                              </g>
                            );
                          })}

                          {/* Barlines & Measure Boundaries (Pure Sheet Music: Simple Vertical Black Lines) */}
                          {/* Standard Measure Boundary (Vertical Black Barline) */}
                          {!measure.repeatEnd && measure.barlineType !== 'end' && measure.barlineType !== 'double' && (
                            <line
                              x1={measureX + width}
                              y1={systemY + 16}
                              x2={measureX + width}
                              y2={systemY + measureBlockHeight - 12}
                              stroke="#000000"
                              strokeWidth="1.5"
                              strokeLinecap="square"
                            />
                          )}

                          {/* Repeat Start (||:) on left edge */}
                          {measure.repeatStart && (
                            <g>
                              <line
                                x1={measureX + 4}
                                y1={systemY + 16}
                                x2={measureX + 4}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="3"
                              />
                              <line
                                x1={measureX + 9}
                                y1={systemY + 16}
                                x2={measureX + 9}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="1"
                              />
                              <circle cx={measureX + 14} cy={systemY + 54} r={2} fill="#000000" />
                              <circle cx={measureX + 14} cy={systemY + 80} r={2} fill="#000000" />
                            </g>
                          )}

                          {/* Repeat End (:||) on right edge */}
                          {measure.repeatEnd && (
                            <g>
                              {measure.repeatCount && measure.repeatCount > 2 && (
                                <text
                                  x={measureX + width - 14}
                                  y={systemY - 4}
                                  fontSize="9"
                                  fontWeight="bold"
                                  fill="#000000"
                                  textAnchor="end"
                                >
                                  {measure.repeatCount}x
                                </text>
                              )}
                              <circle
                                cx={measureX + width - 14}
                                cy={systemY + 54}
                                r={2}
                                fill="#000000"
                              />
                              <circle
                                cx={measureX + width - 14}
                                cy={systemY + 80}
                                r={2}
                                fill="#000000"
                              />
                              <line
                                x1={measureX + width - 9}
                                y1={systemY + 16}
                                x2={measureX + width - 9}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="1"
                              />
                              <line
                                x1={measureX + width - 4}
                                y1={systemY + 16}
                                x2={measureX + width - 4}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="3"
                              />
                            </g>
                          )}

                          {/* Final Barline */}
                          {measure.barlineType === 'end' && !measure.repeatEnd && (
                            <g>
                              <line
                                x1={measureX + width - 5}
                                y1={systemY + 16}
                                x2={measureX + width - 5}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="1"
                              />
                              <line
                                x1={measureX + width - 2}
                                y1={systemY + 16}
                                x2={measureX + width - 2}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="3"
                              />
                            </g>
                          )}

                          {/* Double Barline */}
                          {measure.barlineType === 'double' && !measure.repeatEnd && (
                            <g>
                              <line
                                x1={measureX + width - 4}
                                y1={systemY + 16}
                                x2={measureX + width - 4}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="1"
                              />
                              <line
                                x1={measureX + width - 1}
                                y1={systemY + 16}
                                x2={measureX + width - 1}
                                y2={systemY + measureBlockHeight - 12}
                                stroke="#000000"
                                strokeWidth="1"
                              />
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

                    {/* Interactive Vertical Space Tool Layer */}
                    <PageSpacingLayer
                      pageIndex={pageIndex}
                      pageWidth={pageWidth}
                      staffMarginLeft={staffMarginLeft}
                      staffMarginRight={staffMarginRight}
                      systems={pageSystems}
                      systemPositions={systemPositions}
                      spacingObjects={score.spacingObjects || []}
                      selection={selection}
                      toolMode={toolMode}
                      onSelectSpace={onSelectSpace}
                      onAddSpace={onAddSpace}
                      onUpdateSpace={onUpdateSpace}
                      onDeleteSpace={onDeleteSpace}
                      isPrintView={isPrintView}
                    />
                  </>
                );
              })()}

              {/* Canonical Score Page Footer (Separate and independent from Header) */}
              {((showFooter && (score.layoutSettings.footerShowOnAllPages !== false || pageIndex > 0)) || showPageNumber) && (
                <g className="score-footer score-page-footer">
                  {showFooter && (footerCustomText !== undefined ? footerCustomText : score.metadata.copyright) && (
                    <text
                      x={
                        footerAlignment === 'left'
                          ? staffMarginLeft
                          : footerAlignment === 'right'
                          ? pageWidth - staffMarginRight
                          : pageWidth / 2
                      }
                      y={pageHeight - footerSpaceFromBottom}
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                      fontSize={footerFontSize}
                      fontWeight="500"
                      fill="#64748b"
                      textAnchor={
                        footerAlignment === 'left'
                          ? 'start'
                          : footerAlignment === 'right'
                          ? 'end'
                          : 'middle'
                      }
                    >
                      {footerCustomText !== undefined ? footerCustomText : score.metadata.copyright}
                    </text>
                  )}
                  {showPageNumber && (
                    <text
                      x={
                        pageNumberPosition === 'left'
                          ? staffMarginLeft
                          : pageNumberPosition === 'center'
                          ? pageWidth / 2
                          : pageWidth - staffMarginRight
                      }
                      y={pageHeight - footerSpaceFromBottom}
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                      fontSize={footerFontSize}
                      fontWeight="600"
                      fill="#475569"
                      textAnchor={
                        pageNumberPosition === 'left'
                          ? 'start'
                          : pageNumberPosition === 'center'
                          ? 'middle'
                          : 'end'
                      }
                    >
                      {score.layoutSettings.footerIncludeTotalPages || score.layoutSettings.footerPageNumbering === 'pageOfTotal'
                        ? `${pageIndex + 1} / ${pages.length}`
                        : `${pageIndex + 1}`}
                    </text>
                  )}
                </g>
              )}

              {/* Independent Page-Level Text Objects Layer */}
              <PageTextObjectsLayer
                pageIndex={pageIndex}
                pageWidth={pageWidth}
                pageHeight={pageHeight}
                zoom={zoom}
                isPrintView={isPrintView}
                textObjects={canonicalTextObjects}
                selectedTextAnnotationId={
                  selection.textAnnotationId ||
                  (selection.selectionType === 'text' ? selection.eventId : null)
                }
                toolMode={toolMode}
                onSelectTextAnnotation={onSelectTextAnnotation}
                onEditTextAnnotation={onEditTextAnnotation}
                onMoveTextAnnotation={onMoveTextAnnotation}
                onCommitMoveTextAnnotation={onCommitMoveTextAnnotation}
                onUpdateTextAnnotation={onUpdateTextAnnotation}
                onDeleteTextAnnotation={onDeleteTextAnnotation}
              />
            </svg>
          </div>
        </div>
      );
    })}

      {/* ================= INLINE CHORD ENTRY POPOVER ================= */}
      {activeChordPopover && (
        <div
          className="fixed z-50 bg-white border border-stone-300 rounded-lg shadow-xl p-2.5 w-64 animate-in fade-in zoom-in-95 duration-75 text-xs text-stone-800"
          style={{
            top: Math.max(10, Math.min(window.innerHeight - 180, activeChordPopover.y - 120)),
            left: Math.max(10, Math.min(window.innerWidth - 270, activeChordPopover.x - 60)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-stone-200">
            <span className="font-bold text-stone-900 text-[11px] uppercase tracking-wider">
              Beat {activeChordPopover.beatIndex + 1} Chord
            </span>
            <button
              onClick={() => setActiveChordPopover(null)}
              className="p-0.5 rounded text-stone-400 hover:text-stone-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap gap-1 mb-2">
            {quickChordPresets.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setChordInputValue(c);
                  if (onUpdateBeatChord) {
                    onUpdateBeatChord(activeChordPopover.measureId, activeChordPopover.beatIndex, c);
                  }
                  audioEngine.playChord(c);
                  setActiveChordPopover(null);
                }}
                className={`px-1.5 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                  chordInputValue === c
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-stone-50 border-stone-200 text-stone-800 hover:bg-blue-50 hover:border-blue-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Direct typing input */}
          <div className="flex items-center space-x-1 mb-2">
            <input
              type="text"
              autoFocus
              placeholder="e.g. C, Am, G7, Cmaj7"
              value={chordInputValue}
              onChange={(e) => setChordInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const chord = chordInputValue.trim();
                  if (onUpdateBeatChord) {
                    onUpdateBeatChord(
                      activeChordPopover.measureId,
                      activeChordPopover.beatIndex,
                      chord
                    );
                  }
                  if (chord) {
                    audioEngine.playChord(chord);
                  }
                  setActiveChordPopover(null);
                } else if (e.key === 'Escape') {
                  setActiveChordPopover(null);
                }
              }}
              className="flex-1 bg-white border border-stone-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                const chord = chordInputValue.trim();
                if (onUpdateBeatChord) {
                  onUpdateBeatChord(
                    activeChordPopover.measureId,
                    activeChordPopover.beatIndex,
                    chord
                  );
                }
                if (chord) {
                  audioEngine.playChord(chord);
                }
                setActiveChordPopover(null);
              }}
              className="px-2 py-1 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 text-xs"
            >
              Apply
            </button>
          </div>

          {/* Clear / Delete Chord Button */}
          <div className="flex items-center justify-between pt-1 border-t border-stone-100">
            <button
              onClick={() => {
                if (onUpdateBeatChord) {
                  onUpdateBeatChord(activeChordPopover.measureId, activeChordPopover.beatIndex, '');
                }
                setActiveChordPopover(null);
              }}
              className="text-[10px] text-red-600 hover:text-red-800 font-semibold flex items-center space-x-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete Chord</span>
            </button>
            <span className="text-[10px] text-stone-400">Press Enter ↵</span>
          </div>
        </div>
      )}

      {/* ================= INLINE LYRIC ENTRY POPOVER ================= */}
      {activeLyricPopover && (
        <div
          className="fixed z-50 bg-white border border-stone-300 rounded-lg shadow-xl p-2.5 w-64 animate-in fade-in zoom-in-95 duration-75 text-xs text-stone-800"
          style={{
            top: Math.max(10, Math.min(window.innerHeight - 150, activeLyricPopover.y - 100)),
            left: Math.max(10, Math.min(window.innerWidth - 270, activeLyricPopover.x - 60)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-stone-200">
            <span className="font-bold text-stone-900 text-[11px] uppercase tracking-wider">
              Beat {activeLyricPopover.beatIndex + 1} Lyric
            </span>
            <button
              onClick={() => setActiveLyricPopover(null)}
              className="p-0.5 rounded text-stone-400 hover:text-stone-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center space-x-1 mb-2">
            <input
              type="text"
              autoFocus
              placeholder="Enter word or syllable..."
              value={lyricInputValue}
              onChange={(e) => setLyricInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  if (onUpdateBeatLyric) {
                    onUpdateBeatLyric(
                      activeLyricPopover.measureId,
                      activeLyricPopover.beatIndex,
                      lyricInputValue.trim()
                    );
                  }
                  setActiveLyricPopover(null);
                } else if (e.key === 'Escape') {
                  setActiveLyricPopover(null);
                }
              }}
              className="flex-1 bg-white border border-stone-300 rounded px-2 py-1 text-xs font-serif italic focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              onClick={() => {
                if (onUpdateBeatLyric) {
                  onUpdateBeatLyric(
                    activeLyricPopover.measureId,
                    activeLyricPopover.beatIndex,
                    lyricInputValue.trim()
                  );
                }
                setActiveLyricPopover(null);
              }}
              className="px-2 py-1 bg-amber-600 text-white rounded font-bold hover:bg-amber-700 text-xs"
            >
              Set
            </button>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-stone-100">
            <button
              onClick={() => {
                if (onUpdateBeatLyric) {
                  onUpdateBeatLyric(activeLyricPopover.measureId, activeLyricPopover.beatIndex, '');
                }
                setActiveLyricPopover(null);
              }}
              className="text-[10px] text-red-600 hover:text-red-800 font-semibold flex items-center space-x-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Lyric</span>
            </button>
            <span className="text-[10px] text-stone-400">Press Enter ↵</span>
          </div>
        </div>
      )}
    </div>
  );
};
