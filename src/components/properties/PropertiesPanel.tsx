import React, { useState, useEffect, useMemo } from 'react';
import {
  Score,
  Measure,
  SelectionState,
  NoteEvent,
  Hand,
  Pitch,
  AccidentalType,
  TimeSignature,
  NavigationJump,
  NavigationTarget,
  VoltaEnding,
  ScoreTextAnnotation,
  Volta,
  SpacingObject,
} from '../../types/score';
import { KEY_SIGNATURES } from '../../utils/musicTheory';
import {
  getEffectiveBeatValue,
  getMeasureTotalBeats,
  isBeatLockedByPickup,
  formatNoteLetter,
  getNormalizedVoltas,
} from '../../utils/pianotasticNotation';
import {
  Sliders,
  Music,
  Layers,
  Type,
  Repeat,
  Settings,
  X,
  Plus,
  Trash2,
  Copy,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Check,
  RotateCcw,
  Maximize2,
  Hash,
  ArrowUp,
  ArrowDown,
  Lock,
  CornerDownLeft,
  Bookmark,
  MoveVertical,
} from 'lucide-react';

interface PropertiesPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  score: Score;
  selection: SelectionState;
  activeHand?: Hand;
  currentBeatValue?: number;
  onChangeBeatValue?: (val: number) => void;
  onUpdateBeatChord?: (measureId: string, beatIndex: number, chord: string) => void;
  onUpdateBeatLyric?: (measureId: string, beatIndex: number, text: string, subBeatIndex?: number) => void;
  onToggleBeatSymbol?: (measureId: string, beatIndex: number, symbol: string) => void;
  onClearCurrentBeat?: () => void;
  onTransposeSelected?: (semitones: number) => void;
  onSelectBeat?: (measureId: string, beatIndex: number, subBeatIndex?: number) => void;
  onSelectVolta?: (voltaId: string) => void;
  onAddVolta?: (startMeasureId: string, endMeasureId: string, endings: number[], text?: string) => void;
  onUpdateVolta?: (voltaId: string, patch: Partial<Volta>) => void;
  onDeleteVolta?: (voltaId: string) => void;
  onUpdateScoreMetadata: (patch: Partial<Score['metadata']>) => void;
  onUpdateLayout: (patch: Partial<Score['layoutSettings']>) => void;
  onUpdateMeasure: (measureId: string, patch: Partial<Measure>) => void;
  onToggleLineBreak?: (measureId?: string) => void;
  onUpdateEvent?: (
    measureId: string,
    staff: 'RH' | 'LH',
    eventId: string,
    patch: Partial<NoteEvent>
  ) => void;
  onAddMeasure: () => void;
  onInsertMeasureBefore: (measureId: string) => void;
  onInsertMeasureAfter: (measureId: string) => void;
  onDuplicateMeasure: (measureId: string) => void;
  onDeleteMeasure: (measureId: string) => void;
  onClearMeasure: (measureId: string) => void;
  onOpenCustomTimeSignature: () => void;
  onOpenChordDialog: () => void;
  onResetLayout: () => void;
  onOpenAddTextModal?: (measureId: string, beatIndex: number, placement?: 'above' | 'below') => void;
  onEditTextAnnotation?: (textAnnotation: ScoreTextAnnotation) => void;
  onDeleteTextAnnotation?: (textId: string) => void;
  onUpdateTextAnnotation?: (textId: string, patch: Partial<ScoreTextAnnotation>) => void;
  onUpdateSpace?: (spaceId: string, patch: Partial<SpacingObject>) => void;
  onDeleteSpace?: (spaceId: string) => void;
  onAddSpace?: (afterMeasureId: string, amount: number, systemIndex: number) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  isOpen = true,
  onClose,
  score,
  selection,
  activeHand = 'RH',
  currentBeatValue = 1,
  onChangeBeatValue,
  onUpdateBeatChord,
  onUpdateBeatLyric,
  onToggleBeatSymbol,
  onClearCurrentBeat,
  onTransposeSelected,
  onSelectBeat,
  onSelectVolta,
  onAddVolta,
  onUpdateVolta,
  onDeleteVolta,
  onUpdateScoreMetadata,
  onUpdateLayout,
  onUpdateMeasure,
  onToggleLineBreak,
  onAddMeasure,
  onInsertMeasureBefore,
  onInsertMeasureAfter,
  onDuplicateMeasure,
  onDeleteMeasure,
  onClearMeasure,
  onOpenCustomTimeSignature,
  onOpenChordDialog,
  onResetLayout,
  onOpenAddTextModal,
  onEditTextAnnotation,
  onDeleteTextAnnotation,
  onUpdateTextAnnotation,
  onUpdateSpace,
  onDeleteSpace,
  onAddSpace,
}) => {
  if (!isOpen) return null;

  // Derive active measure and beat information
  const selectedMeasureId = selection.measureId || score.measures[0]?.id;
  const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === selectedMeasureId));
  const activeMeasure = score.measures[measureIdx] || score.measures[0];
  const beatIndex = selection.beatIndex !== undefined ? selection.beatIndex : 0;
  const subBeatIndex = selection.subBeatIndex || 0;

  // Selected Spacing Object (Vertical system spacing)
  const allSpaces = score.spacingObjects || [];
  const selectedSpacingObject = allSpaces.find(
    (s) =>
      s.id === selection.spacingObjectId ||
      (selection.selectionType === 'space' && s.id === (selection as any).spacingObjectId) ||
      (selection.selectionType === 'space' && s.afterMeasureId === selectedMeasureId)
  );

  // Selected Text Annotation (Page-level independent text object)
  const allText = score.textObjects || score.textAnnotations || [];
  const selectedTextAnnotation = allText.find(
    (t) =>
      t.id === selection.textAnnotationId ||
      (selection.selectionType === 'text' && t.id === selection.eventId)
  );

  // Normalized Voltas and active volta selection
  const voltas = useMemo(() => getNormalizedVoltas(score), [score]);
  const selectedVolta = voltas.find(
    (v) =>
      v.id === selection.voltaId ||
      (selection.selectionType === 'volta' && v.id === (selection as any).voltaId)
  );
  const activeMeasureVolta = activeMeasure
    ? voltas.find((v) => {
        const sIdx = score.measures.findIndex((m) => m.id === v.startMeasureId);
        const eIdx = score.measures.findIndex((m) => m.id === v.endMeasureId);
        const safeEIdx = eIdx === -1 ? sIdx : Math.max(sIdx, eIdx);
        return measureIdx >= sIdx && measureIdx <= safeEIdx;
      })
    : undefined;

  const totalBeats = activeMeasure
    ? getMeasureTotalBeats(
        activeMeasure,
        score.metadata.initialTimeSignature,
        score.metadata.indianTaal
      )
    : 4;

  const effectiveVal = activeMeasure
    ? getEffectiveBeatValue(score, measureIdx, beatIndex)
    : currentBeatValue;

  const activeBeatNotes: Pitch[] = activeMeasure?.beatNotes?.[beatIndex] || [];
  const fallbackChord = activeMeasure?.chordSymbols?.find(
    (c) => Math.floor(c.beatOffset) === beatIndex
  )?.formatted;
  const activeBeatChord = activeMeasure?.beatChords?.[beatIndex] || fallbackChord || '';
  const activeBeatLyric =
    activeMeasure?.beatLyrics?.[`${beatIndex}_${subBeatIndex}`] ||
    activeMeasure?.beatLyrics?.[beatIndex] ||
    '';
  const activeBeatSymbols: string[] = activeMeasure?.beatSymbols?.[beatIndex] || [];

  // Determine which sub-tab to display:
  // Can be automatic based on selection.selectionType, or user can toggle tabs
  type InspectorTab = 'active' | 'measure' | 'score';
  const [activeTab, setActiveTab] = useState<InspectorTab>('active');

  // Input states for chord and lyric
  const [chordInput, setChordInput] = useState(activeBeatChord);
  const [lyricInput, setLyricInput] = useState(activeBeatLyric);

  // Sync inputs when beat or selection changes
  useEffect(() => {
    setChordInput(activeBeatChord);
  }, [activeBeatChord, beatIndex, selectedMeasureId]);

  useEffect(() => {
    setLyricInput(activeBeatLyric);
  }, [activeBeatLyric, beatIndex, subBeatIndex, selectedMeasureId]);

  const quickChords = ['C', 'Am', 'F', 'G7', 'Dm', 'Cmaj7', 'Em', 'A7', 'G', 'D', 'E', 'Bb', 'F#m', 'B7'];

  // Indian Taals
  const indianTaals = [
    { id: 'None', label: 'None (Western Standard)' },
    { id: 'Teental', label: 'Teental (16 Beats • 4+4+4+4)' },
    { id: 'Keherwa', label: 'Keherwa (8 Beats • 4+4)' },
    { id: 'Dadra', label: 'Dadra (6 Beats • 3+3)' },
    { id: 'Rupak', label: 'Rupak (7 Beats • 3+2+2)' },
    { id: 'Ektaal', label: 'Ektaal (12 Beats • 2+2+2+2+2+2)' },
    { id: 'Jhaptaal', label: 'Jhaptaal (10 Beats • 2+3+2+3)' },
  ];

  return (
    <aside
      id="properties-panel"
      className="w-80 bg-white border-l border-stone-200/90 flex flex-col h-full overflow-hidden text-xs text-stone-800 z-10 select-none print:hidden shadow-xs shrink-0"
    >
      {/* Header: Title, Context info & Close button */}
      <div className="p-3 border-b border-stone-200 flex items-center justify-between bg-stone-50/80">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-stone-900 text-white flex items-center justify-center font-bold">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="font-bold text-stone-900 text-sm leading-tight">Inspector</h2>
            <p className="text-[10px] text-stone-500 font-medium">
              Bar {activeMeasure ? activeMeasure.measureNumber : 1} • Beat {beatIndex + 1}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          {onClose && (
            <button
              onClick={onClose}
              title="Close Inspector (Full Score View)"
              className="p-1 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Segmented View Tabs */}
      <div className="flex border-b border-stone-200 bg-stone-100/60 p-1 gap-1">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-1 px-2 rounded-md font-semibold text-[11px] transition-colors flex items-center justify-center space-x-1 ${
            activeTab === 'active'
              ? 'bg-white text-stone-900 shadow-2xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Music className="w-3 h-3" />
          <span>Beat & Tool</span>
        </button>

        <button
          onClick={() => setActiveTab('measure')}
          className={`flex-1 py-1 px-2 rounded-md font-semibold text-[11px] transition-colors flex items-center justify-center space-x-1 ${
            activeTab === 'measure'
              ? 'bg-white text-stone-900 shadow-2xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Repeat className="w-3 h-3" />
          <span>Measure</span>
        </button>

        <button
          onClick={() => setActiveTab('score')}
          className={`flex-1 py-1 px-2 rounded-md font-semibold text-[11px] transition-colors flex items-center justify-center space-x-1 ${
            activeTab === 'score'
              ? 'bg-white text-stone-900 shadow-2xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Settings className="w-3 h-3" />
          <span>Score</span>
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* ================= TAB 1: BEAT & OBJECT CONTROLS ================= */}
        {activeTab === 'active' && (
          <>
            {/* Selected Vertical Spacing Object Controls */}
            {selectedSpacingObject && (
              <div className="bg-sky-50/90 rounded-lg p-2.5 border border-sky-300 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <MoveVertical className="w-3.5 h-3.5 text-sky-700" />
                    <span className="font-bold text-sky-950 text-[11px] uppercase tracking-wide">
                      Vertical System Space
                    </span>
                  </div>
                  <button
                    onClick={() => onDeleteSpace?.(selectedSpacingObject.id)}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    title="Remove Space"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="bg-white rounded border border-sky-200 p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-700">Distance</span>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="number"
                        min="0"
                        max="400"
                        step="5"
                        value={selectedSpacingObject.amount}
                        onChange={(e) =>
                          onUpdateSpace?.(selectedSpacingObject.id, {
                            amount: Math.max(0, Math.min(400, parseInt(e.target.value) || 0)),
                          })
                        }
                        className="w-16 px-1.5 py-0.5 text-right font-mono font-bold text-xs border border-stone-300 rounded focus:border-sky-500 focus:outline-none"
                      />
                      <span className="text-stone-500 text-[11px]">px</span>
                    </div>
                  </div>

                  {/* Preset Steppers */}
                  <div className="grid grid-cols-4 gap-1 pt-1">
                    {[15, 30, 50, 80].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => onUpdateSpace?.(selectedSpacingObject.id, { amount: amt })}
                        className={`py-1 text-[10px] font-bold rounded border transition-colors ${
                          selectedSpacingObject.amount === amt
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                        }`}
                      >
                        {amt}px
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Selected Score Text Annotation Controls */}
            {selectedTextAnnotation && (
              <div className="bg-blue-50/80 rounded-lg p-2.5 border border-blue-200 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Type className="w-3.5 h-3.5 text-blue-700" />
                    <span className="font-bold text-blue-900 text-[11px] uppercase tracking-wide">
                      Page {(selectedTextAnnotation.pageIndex ?? 0) + 1} Text Object
                    </span>
                  </div>
                  <button
                    onClick={() => onDeleteTextAnnotation?.(selectedTextAnnotation.id)}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    title="Delete this text"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Text string preview & Edit button */}
                <div className="bg-white rounded border border-blue-200 p-2 flex items-center justify-between">
                  <span
                    className="font-medium text-stone-900 truncate max-w-[170px]"
                    style={{
                      fontSize: `${Math.min(16, selectedTextAnnotation.fontSize || 14)}px`,
                      fontWeight: selectedTextAnnotation.fontWeight || 'normal',
                      fontStyle: selectedTextAnnotation.fontStyle || 'normal',
                      textDecoration: selectedTextAnnotation.textDecoration || 'none',
                      color: selectedTextAnnotation.color || '#0f172a',
                    }}
                  >
                    "{selectedTextAnnotation.text || selectedTextAnnotation.content}"
                  </span>
                  <button
                    onClick={() => onEditTextAnnotation?.(selectedTextAnnotation)}
                    className="text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-300 transition-colors"
                  >
                    Edit Text
                  </button>
                </div>

                {/* Page Position Coordinates */}
                <div className="bg-white/80 rounded p-2 border border-blue-100 space-y-1.5">
                  <span className="text-[10px] font-bold text-stone-600 uppercase tracking-wide block">
                    Page Coordinates
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className="text-[9px] text-stone-500 font-medium block">Page</label>
                      <select
                        value={selectedTextAnnotation.pageIndex ?? 0}
                        onChange={(e) =>
                          onUpdateTextAnnotation?.(selectedTextAnnotation.id, {
                            pageIndex: Number(e.target.value),
                          })
                        }
                        className="w-full bg-white border border-stone-200 rounded px-1.5 py-1 text-xs font-semibold text-stone-800"
                      >
                        {[0, 1, 2, 3, 4].map((p) => (
                          <option key={p} value={p}>
                            Page {p + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-stone-500 font-medium block">X (px)</label>
                      <input
                        type="number"
                        min="10"
                        max="1200"
                        value={Math.round(selectedTextAnnotation.x ?? 120)}
                        onChange={(e) =>
                          onUpdateTextAnnotation?.(selectedTextAnnotation.id, {
                            x: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-white border border-stone-200 rounded px-1.5 py-1 text-xs font-medium text-stone-800"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-stone-500 font-medium block">Y (px)</label>
                      <input
                        type="number"
                        min="10"
                        max="1600"
                        value={Math.round(selectedTextAnnotation.y ?? 120)}
                        onChange={(e) =>
                          onUpdateTextAnnotation?.(selectedTextAnnotation.id, {
                            y: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-white border border-stone-200 rounded px-1.5 py-1 text-xs font-medium text-stone-800"
                      />
                    </div>
                  </div>

                  {/* Position Nudge Arrows */}
                  <div className="pt-1 flex items-center justify-between text-[10px] text-stone-600">
                    <span className="text-[9px] text-stone-500 font-medium">Nudge ±10px:</span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() =>
                          onUpdateTextAnnotation?.(selectedTextAnnotation.id, {
                            x: Math.max(10, (selectedTextAnnotation.x ?? 120) - 10),
                          })
                        }
                        className="w-6 h-5 bg-white border border-stone-200 rounded hover:bg-stone-50 font-bold flex items-center justify-center text-xs"
                        title="Nudge Left 10px"
                      >
                        ←
                      </button>
                      <button
                        onClick={() =>
                          onUpdateTextAnnotation?.(selectedTextAnnotation.id, {
                            x: (selectedTextAnnotation.x ?? 120) + 10,
                          })
                        }
                        className="w-6 h-5 bg-white border border-stone-200 rounded hover:bg-stone-50 font-bold flex items-center justify-center text-xs"
                        title="Nudge Right 10px"
                      >
                        →
                      </button>
                      <button
                        onClick={() =>
                          onUpdateTextAnnotation?.(selectedTextAnnotation.id, {
                            y: Math.max(10, (selectedTextAnnotation.y ?? 120) - 10),
                          })
                        }
                        className="w-6 h-5 bg-white border border-stone-200 rounded hover:bg-stone-50 font-bold flex items-center justify-center text-xs"
                        title="Nudge Up 10px"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() =>
                          onUpdateTextAnnotation?.(selectedTextAnnotation.id, {
                            y: (selectedTextAnnotation.y ?? 120) + 10,
                          })
                        }
                        className="w-6 h-5 bg-white border border-stone-200 rounded hover:bg-stone-50 font-bold flex items-center justify-center text-xs"
                        title="Nudge Down 10px"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </div>

                {/* Formatting: Font Size */}
                <div>
                  <label className="text-[10px] font-bold text-stone-600 block mb-1">Font Size (px)</label>
                  <div className="flex gap-1 flex-wrap">
                    {[10, 12, 14, 16, 18, 20, 24, 32].map((size) => (
                      <button
                        key={size}
                        onClick={() =>
                          onUpdateTextAnnotation?.(selectedTextAnnotation.id, { fontSize: size })
                        }
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                          (selectedTextAnnotation.fontSize || 14) === size
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Formatting: Bold, Italic, Underline & Alignment */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() =>
                        onUpdateTextAnnotation?.(selectedTextAnnotation.id, {
                          fontWeight: selectedTextAnnotation.fontWeight === 'bold' ? 'normal' : 'bold',
                        })
                      }
                      className={`w-6 h-6 rounded text-xs font-bold border transition-colors ${
                        selectedTextAnnotation.fontWeight === 'bold'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      B
                    </button>
                    <button
                      onClick={() =>
                        onUpdateTextAnnotation?.(selectedTextAnnotation.id, {
                          fontStyle: selectedTextAnnotation.fontStyle === 'italic' ? 'normal' : 'italic',
                        })
                      }
                      className={`w-6 h-6 rounded text-xs italic font-serif border transition-colors ${
                        selectedTextAnnotation.fontStyle === 'italic'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      I
                    </button>
                    <button
                      onClick={() =>
                        onUpdateTextAnnotation?.(selectedTextAnnotation.id, {
                          textDecoration:
                            selectedTextAnnotation.textDecoration === 'underline' ? 'none' : 'underline',
                        })
                      }
                      className={`w-6 h-6 rounded text-xs underline border transition-colors ${
                        selectedTextAnnotation.textDecoration === 'underline'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-stone-700 border-stone-200'
                      }`}
                    >
                      U
                    </button>
                  </div>

                  {/* Alignment Toggle */}
                  <div className="flex items-center space-x-1">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button
                        key={align}
                        onClick={() =>
                          onUpdateTextAnnotation?.(selectedTextAnnotation.id, { textAlign: align })
                        }
                        className={`px-1.5 py-0.5 rounded text-[10px] capitalize font-medium border ${
                          (selectedTextAnnotation.textAlign || 'left') === align
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-stone-700 border-stone-200'
                        }`}
                      >
                        {align}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Selected Volta Ending Bracket Controls */}
            {selectedVolta && (
              <div className="bg-amber-50/90 rounded-lg p-2.5 border border-amber-300 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-amber-700" />
                    <span className="font-bold text-amber-900 text-[11px] uppercase tracking-wide">
                      Selected Volta Ending ({selectedVolta.text || (selectedVolta.endingNumbers.join(', ') + '.')})
                    </span>
                  </div>
                  <button
                    onClick={() => onDeleteVolta?.(selectedVolta.id)}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    title="Delete this Volta ending"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Ending numbers selector */}
                <div>
                  <label className="text-[10px] font-bold text-stone-600 block mb-1">Ending Pass</label>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: '1st', nums: [1], text: '1.' },
                      { label: '2nd', nums: [2], text: '2.' },
                      { label: '3rd', nums: [3], text: '3.' },
                      { label: '1, 2.', nums: [1, 2], text: '1, 2.' },
                    ].map((opt) => {
                      const isActive =
                        selectedVolta.endingNumbers.length === opt.nums.length &&
                        selectedVolta.endingNumbers.every((n, i) => n === opt.nums[i]);
                      return (
                        <button
                          key={opt.label}
                          onClick={() =>
                            onUpdateVolta?.(selectedVolta.id, {
                              endingNumbers: opt.nums,
                              text: opt.text,
                            })
                          }
                          className={`py-1 rounded text-xs font-bold border transition-colors ${
                            isActive
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Spanning: Start & End Bars */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-stone-600 block mb-1">Start Bar</label>
                    <select
                      value={selectedVolta.startMeasureId}
                      onChange={(e) =>
                        onUpdateVolta?.(selectedVolta.id, { startMeasureId: e.target.value })
                      }
                      className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-xs font-medium text-stone-800"
                    >
                      {score.measures.map((m) => (
                        <option key={m.id} value={m.id}>
                          Bar {m.measureNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-600 block mb-1">End Bar</label>
                    <select
                      value={selectedVolta.endMeasureId}
                      onChange={(e) =>
                        onUpdateVolta?.(selectedVolta.id, { endMeasureId: e.target.value })
                      }
                      className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-xs font-medium text-stone-800"
                    >
                      {score.measures.map((m) => (
                        <option key={m.id} value={m.id}>
                          Bar {m.measureNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Closed hook toggle */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedVolta.closedEnd !== false}
                      onChange={(e) =>
                        onUpdateVolta?.(selectedVolta.id, { closedEnd: e.target.checked })
                      }
                      className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-[11px] font-medium text-stone-700">Right Hook (Closed Bracket)</span>
                  </label>
                </div>
              </div>
            )}

            {/* Quick Add Text Annotation Button */}
            {!selectedTextAnnotation && (
              <button
                onClick={() =>
                  onOpenAddTextModal?.(
                    activeMeasure?.id || 'm1',
                    beatIndex,
                    'above'
                  )
                }
                className="w-full py-1.5 px-2.5 rounded-lg border border-dashed border-stone-300 hover:border-blue-500 hover:bg-blue-50/50 text-stone-700 hover:text-blue-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Type className="w-3.5 h-3.5 text-blue-600" />
                <span>+ Add Score Text to Bar {activeMeasure?.measureNumber || 1} • Beat {beatIndex + 1}</span>
              </button>
            )}

            {/* 1. Note Value Section (1 to 4 notes per beat) */}
            <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wide">
                  Beat Value (Notes / Beat)
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-bold">
                  {effectiveVal} note{effectiveVal > 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((v) => (
                  <button
                    key={v}
                    id={`inspector-val-${v}`}
                    onClick={() => onChangeBeatValue && onChangeBeatValue(v)}
                    className={`py-1.5 rounded-md font-bold text-xs flex flex-col items-center justify-center transition-all ${
                      effectiveVal === v
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="text-sm">{v}</span>
                    <span className="text-[9px] font-normal opacity-90">
                      {v === 1 ? '♩' : v === 2 ? '♫' : v === 3 ? '3-let' : '16th'}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-stone-500 mt-2 leading-tight">
                Sets subdivisions for Beat {beatIndex + 1} and subsequent beats.
              </p>
            </div>

            {/* 2. Chord Entry Section */}
            <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wide">
                    Chord (Beat {beatIndex + 1})
                  </span>
                </div>
                {activeBeatChord && (
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {activeBeatChord}
                  </span>
                )}
              </div>

              {/* Quick Popular Chord Chips */}
              <div className="flex flex-wrap gap-1 mb-2">
                {quickChords.map((chordName) => (
                  <button
                    key={chordName}
                    id={`quick-chord-${chordName}`}
                    onClick={() => {
                      if (activeMeasure && onUpdateBeatChord) {
                        onUpdateBeatChord(activeMeasure.id, beatIndex, chordName);
                      }
                    }}
                    className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                      activeBeatChord === chordName
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-white border border-stone-200 text-stone-800 hover:bg-blue-50 hover:border-blue-300'
                    }`}
                  >
                    {chordName}
                  </button>
                ))}
              </div>

              {/* Custom Chord Input Field */}
              <div className="flex items-center space-x-1 mb-2">
                <input
                  type="text"
                  id="custom-chord-input"
                  placeholder="e.g. C, Am, G7, Cmaj7"
                  value={chordInput}
                  onChange={(e) => setChordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (activeMeasure && onUpdateBeatChord) {
                        onUpdateBeatChord(activeMeasure.id, beatIndex, chordInput.trim());
                      }
                    }
                  }}
                  className="flex-1 bg-white border border-stone-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  id="apply-chord-btn"
                  onClick={() => {
                    if (activeMeasure && onUpdateBeatChord) {
                      onUpdateBeatChord(activeMeasure.id, beatIndex, chordInput.trim());
                    }
                  }}
                  className="px-2.5 py-1 bg-blue-600 text-white rounded font-semibold text-xs hover:bg-blue-700 transition-colors"
                >
                  Set
                </button>
              </div>

              {/* Clear / Delete Chord Button & Advanced Dialog Button */}
              <div className="flex items-center justify-between pt-1 border-t border-stone-200/80">
                <button
                  id="delete-chord-btn"
                  onClick={() => {
                    setChordInput('');
                    if (activeMeasure && onUpdateBeatChord) {
                      onUpdateBeatChord(activeMeasure.id, beatIndex, '');
                    }
                  }}
                  disabled={!activeBeatChord}
                  className="text-[11px] text-red-600 hover:text-red-800 font-semibold disabled:opacity-40 flex items-center space-x-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete Chord</span>
                </button>

                <button
                  onClick={onOpenChordDialog}
                  className="text-[11px] text-stone-600 hover:text-stone-900 font-medium underline"
                >
                  Advanced Builder...
                </button>
              </div>
            </div>

            {/* 3. Lyric Entry Section */}
            <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1">
                  <Type className="w-3.5 h-3.5 text-stone-700" />
                  <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wide">
                    Lyric (Beat {beatIndex + 1}
                    {activeBeatNotes.length > 1 ? ` • Note ${subBeatIndex + 1}` : ''})
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-1 mb-2">
                <input
                  type="text"
                  id="lyric-input"
                  placeholder="Enter word or syllable..."
                  value={lyricInput}
                  onChange={(e) => {
                    setLyricInput(e.target.value);
                    if (activeMeasure && onUpdateBeatLyric) {
                      onUpdateBeatLyric(
                        activeMeasure.id,
                        beatIndex,
                        e.target.value,
                        activeBeatNotes.length > 1 ? subBeatIndex : undefined
                      );
                    }
                  }}
                  className="flex-1 bg-white border border-stone-300 rounded px-2 py-1 text-xs font-serif italic focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                {activeBeatLyric && (
                  <button
                    id="clear-lyric-btn"
                    onClick={() => {
                      setLyricInput('');
                      if (activeMeasure && onUpdateBeatLyric) {
                        onUpdateBeatLyric(
                          activeMeasure.id,
                          beatIndex,
                          '',
                          activeBeatNotes.length > 1 ? subBeatIndex : undefined
                        );
                      }
                    }}
                    title="Clear Lyric"
                    className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-stone-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Beat Navigation */}
              <div className="flex items-center justify-between text-[11px] text-stone-600 pt-1 border-t border-stone-200/80">
                <button
                  onClick={() => {
                    if (onSelectBeat && activeMeasure) {
                      if (beatIndex > 0) {
                        onSelectBeat(activeMeasure.id, beatIndex - 1, 0);
                      } else if (measureIdx > 0) {
                        const prevM = score.measures[measureIdx - 1];
                        const prevTotal = getMeasureTotalBeats(
                          prevM,
                          score.metadata.initialTimeSignature,
                          score.metadata.indianTaal
                        );
                        onSelectBeat(prevM.id, prevTotal - 1, 0);
                      }
                    }
                  }}
                  className="hover:text-stone-900 font-semibold flex items-center space-x-0.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev Beat</span>
                </button>

                <button
                  onClick={() => {
                    if (onSelectBeat && activeMeasure) {
                      if (beatIndex < totalBeats - 1) {
                        onSelectBeat(activeMeasure.id, beatIndex + 1, 0);
                      } else if (measureIdx < score.measures.length - 1) {
                        const nextM = score.measures[measureIdx + 1];
                        onSelectBeat(nextM.id, 0, 0);
                      }
                    }
                  }}
                  className="hover:text-stone-900 font-semibold flex items-center space-x-0.5"
                >
                  <span>Next Beat</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 4. Symbol Menu Section (featuring ⌣ prominently) */}
            <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wide">
                    Symbols (Beat {beatIndex + 1})
                  </span>
                </div>
                {activeBeatSymbols.length > 0 && (
                  <span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                    {activeBeatSymbols.join(' ')}
                  </span>
                )}
              </div>

              {/* Exact ⌣ Symbol Button Featured Prominently */}
              <div className="mb-2">
                <button
                  id="symbol-undertie-btn"
                  onClick={() => {
                    if (activeMeasure && onToggleBeatSymbol) {
                      onToggleBeatSymbol(activeMeasure.id, beatIndex, '⌣');
                    }
                  }}
                  className={`w-full py-1.5 px-2 rounded-md font-bold text-xs flex items-center justify-between transition-colors ${
                    activeBeatSymbols.includes('⌣')
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white border border-stone-300 text-stone-800 hover:bg-purple-50 hover:border-purple-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-base font-bold leading-none">⌣</span>
                    <span>Curved Symbol (⌣)</span>
                  </div>
                  <span className="text-[10px] uppercase font-semibold">
                    {activeBeatSymbols.includes('⌣') ? 'Active' : 'Add'}
                  </span>
                </button>
              </div>

              {/* Other musical symbols in grid */}
              <div className="grid grid-cols-5 gap-1 mb-2">
                {[
                  { glyph: '•', name: 'Staccato' },
                  { glyph: '>', name: 'Accent' },
                  { glyph: '—', name: 'Tenuto' },
                  { glyph: '𝄐', name: 'Fermata' },
                  { glyph: 'tr', name: 'Trill' },
                ].map((s) => (
                  <button
                    key={s.glyph}
                    id={`symbol-${s.name.toLowerCase()}`}
                    onClick={() => {
                      if (activeMeasure && onToggleBeatSymbol) {
                        onToggleBeatSymbol(activeMeasure.id, beatIndex, s.glyph);
                      }
                    }}
                    title={s.name}
                    className={`h-7 rounded flex items-center justify-center font-bold text-xs transition-colors ${
                      activeBeatSymbols.includes(s.glyph)
                        ? 'bg-purple-600 text-white'
                        : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {s.glyph}
                  </button>
                ))}
              </div>

              {/* Clear symbols button */}
              {activeBeatSymbols.length > 0 && (
                <button
                  onClick={() => {
                    if (activeMeasure && onToggleBeatSymbol) {
                      activeBeatSymbols.forEach((sym) => {
                        onToggleBeatSymbol(activeMeasure.id, beatIndex, sym);
                      });
                    }
                  }}
                  className="w-full text-center text-[11px] text-red-600 hover:text-red-800 font-semibold pt-1 border-t border-stone-200/80"
                >
                  Clear All Symbols on Beat
                </button>
              )}
            </div>

            {/* 5. Active Pitch & Beat Actions */}
            <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
              <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wide block mb-2">
                Pitch & Beat Actions
              </span>

              <div className="flex items-center justify-between mb-2 bg-white p-2 rounded border border-stone-200">
                <span className="text-stone-600 font-medium">Notes in Beat:</span>
                <span className="font-bold text-stone-900 text-sm">
                  {activeBeatNotes.length > 0
                    ? activeBeatNotes.map((p) => (!p || !p.step ? '.' : formatNoteLetter(p))).join(' • ')
                    : '— (Rest)'}
                </span>
              </div>

              {/* Transposition */}
              {onTransposeSelected && (
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  <button
                    id="transpose-up-btn"
                    onClick={() => onTransposeSelected(1)}
                    className="py-1 px-2 bg-white border border-stone-200 rounded text-stone-700 hover:bg-stone-100 font-semibold flex items-center justify-center space-x-1"
                  >
                    <ArrowUp className="w-3 h-3 text-stone-600" />
                    <span>+1 Semitone</span>
                  </button>
                  <button
                    id="transpose-down-btn"
                    onClick={() => onTransposeSelected(-1)}
                    className="py-1 px-2 bg-white border border-stone-200 rounded text-stone-700 hover:bg-stone-100 font-semibold flex items-center justify-center space-x-1"
                  >
                    <ArrowDown className="w-3 h-3 text-stone-600" />
                    <span>-1 Semitone</span>
                  </button>
                </div>
              )}

              {/* Clear Beat to '—' Dash */}
              {onClearCurrentBeat && (
                <button
                  id="clear-beat-btn"
                  onClick={onClearCurrentBeat}
                  className="w-full py-1.5 bg-stone-200 text-stone-800 rounded font-semibold text-xs hover:bg-stone-300 transition-colors flex items-center justify-center space-x-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Notes to '—' Dash</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* ================= TAB 2: MEASURE & NAVIGATION CONTROLS ================= */}
        {activeTab === 'measure' && (
          <>
            {/* Repeat & Jump Navigation Section */}
            <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
              <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wide block mb-2">
                Repeats & Voltas (Measure {activeMeasure?.measureNumber})
              </span>

              {/* Repeat Start and End */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  id="toggle-repeat-start-btn"
                  onClick={() => {
                    if (activeMeasure) {
                      onUpdateMeasure(activeMeasure.id, {
                        repeatStart: !activeMeasure.repeatStart,
                      });
                    }
                  }}
                  className={`py-1.5 px-2 rounded-md font-bold text-xs flex items-center justify-center space-x-1 transition-colors ${
                    activeMeasure?.repeatStart
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>||:</span>
                  <span>Repeat Start</span>
                </button>

                <button
                  id="toggle-repeat-end-btn"
                  onClick={() => {
                    if (activeMeasure) {
                      onUpdateMeasure(activeMeasure.id, {
                        repeatEnd: !activeMeasure.repeatEnd,
                        repeatCount: activeMeasure.repeatEnd ? undefined : 2,
                      });
                    }
                  }}
                  className={`py-1.5 px-2 rounded-md font-bold text-xs flex items-center justify-center space-x-1 transition-colors ${
                    activeMeasure?.repeatEnd
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>:||</span>
                  <span>Repeat End</span>
                </button>
              </div>

              {/* Repeat Count (if repeatEnd is active) */}
              {activeMeasure?.repeatEnd && (
                <div className="flex items-center justify-between mb-2 bg-white p-2 rounded border border-stone-200">
                  <span className="text-stone-700 font-semibold">Play Count:</span>
                  <div className="flex space-x-1">
                    {[2, 3, 4].map((count) => (
                      <button
                        key={count}
                        onClick={() =>
                          onUpdateMeasure(activeMeasure.id, { repeatCount: count })
                        }
                        className={`w-6 h-6 rounded text-xs font-bold ${
                          (activeMeasure.repeatCount || 2) === count
                            ? 'bg-stone-900 text-white'
                            : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                        }`}
                      >
                        {count}x
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Volta Ending Brackets */}
              <div className="mb-3 bg-stone-50 p-2 rounded-lg border border-stone-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] text-stone-500 uppercase font-bold block">
                    Volta Ending Brackets
                  </label>
                  {activeMeasureVolta && (
                    <button
                      onClick={() => onDeleteVolta?.(activeMeasureVolta.id)}
                      className="text-[10px] text-red-600 hover:text-red-800 font-semibold"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1 mb-2">
                  {[
                    { label: 'None', ending: undefined },
                    { label: '1st', ending: 1 },
                    { label: '2nd', ending: 2 },
                    { label: '3rd', ending: 3 },
                  ].map(({ label, ending }) => {
                    const isSelected = activeMeasureVolta
                      ? activeMeasureVolta.endingNumbers.includes(ending as number)
                      : activeMeasure?.voltaEnding === ending;
                    return (
                      <button
                        key={label}
                        id={`volta-${ending ?? 'none'}`}
                        onClick={() => {
                          if (!activeMeasure) return;
                          if (ending === undefined) {
                            if (activeMeasureVolta) {
                              onDeleteVolta?.(activeMeasureVolta.id);
                            } else {
                              onUpdateMeasure(activeMeasure.id, { voltaEnding: undefined });
                            }
                          } else {
                            if (activeMeasureVolta) {
                              onUpdateVolta?.(activeMeasureVolta.id, {
                                endingNumbers: [ending as number],
                                text: `${ending}.`,
                              });
                            } else if (onAddVolta) {
                              onAddVolta(activeMeasure.id, activeMeasure.id, [ending as number], `${ending}.`);
                            } else {
                              onUpdateMeasure(activeMeasure.id, { voltaEnding: ending as VoltaEnding });
                            }
                          }
                        }}
                        className={`py-1 rounded font-semibold text-xs transition-colors ${
                          isSelected
                            ? 'bg-amber-600 text-white'
                            : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {activeMeasureVolta && (
                  <div className="pt-2 border-t border-stone-200/80 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9.5px] font-bold text-stone-500 block mb-0.5">Start Bar</span>
                        <select
                          value={activeMeasureVolta.startMeasureId}
                          onChange={(e) =>
                            onUpdateVolta?.(activeMeasureVolta.id, { startMeasureId: e.target.value })
                          }
                          className="w-full bg-white border border-stone-300 rounded px-1.5 py-0.5 text-xs text-stone-800"
                        >
                          {score.measures.map((m) => (
                            <option key={m.id} value={m.id}>
                              Bar {m.measureNumber}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="text-[9.5px] font-bold text-stone-500 block mb-0.5">End Bar</span>
                        <select
                          value={activeMeasureVolta.endMeasureId}
                          onChange={(e) =>
                            onUpdateVolta?.(activeMeasureVolta.id, { endMeasureId: e.target.value })
                          }
                          className="w-full bg-white border border-stone-300 rounded px-1.5 py-0.5 text-xs text-stone-800"
                        >
                          {score.measures.map((m) => (
                            <option key={m.id} value={m.id}>
                              Bar {m.measureNumber}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeMeasureVolta.closedEnd !== false}
                        onChange={(e) =>
                          onUpdateVolta?.(activeMeasureVolta.id, { closedEnd: e.target.checked })
                        }
                        className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-[10px] font-medium text-stone-700">Right Downward Hook</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Navigation Target Markers */}
              <div className="mb-3">
                <label className="text-[10px] text-stone-500 uppercase font-bold block mb-1">
                  Target Markers (Segno, Coda, Fine)
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {(['none', 'Segno', 'Coda', 'Fine'] as NavigationTarget[]).map((target) => (
                    <button
                      key={target}
                      id={`nav-target-${target.toLowerCase()}`}
                      onClick={() => {
                        if (activeMeasure) {
                          onUpdateMeasure(activeMeasure.id, {
                            navigationTarget: target === 'none' ? undefined : target,
                          });
                        }
                      }}
                      className={`py-1 rounded font-semibold text-xs transition-colors ${
                        (activeMeasure?.navigationTarget || 'none') === target
                          ? 'bg-amber-600 text-white'
                          : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      {target === 'none'
                        ? 'None'
                        : target === 'Segno'
                        ? '𝄋 Segno'
                        : target === 'Coda'
                        ? '𝄌 Coda'
                        : 'Fine'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Navigation Jumps */}
              <div>
                <label className="text-[10px] text-stone-500 uppercase font-bold block mb-1">
                  Score Jumps & Direction
                </label>
                <select
                  id="nav-jump-select"
                  value={activeMeasure?.navigationJump || 'none'}
                  onChange={(e) => {
                    if (activeMeasure) {
                      onUpdateMeasure(activeMeasure.id, {
                        navigationJump:
                          e.target.value === 'none' ? undefined : (e.target.value as NavigationJump),
                      });
                    }
                  }}
                  className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-stone-500"
                >
                  <option value="none">None</option>
                  <option value="D.C.">D.C. (Da Capo - from beginning)</option>
                  <option value="D.C. al Fine">D.C. al Fine</option>
                  <option value="D.C. al Coda">D.C. al Coda</option>
                  <option value="D.S.">D.S. (Dal Segno - from 𝄋)</option>
                  <option value="D.S. al Fine">D.S. al Fine</option>
                  <option value="D.S. al Coda">D.S. al Coda</option>
                  <option value="To Coda">To Coda (𝄌)</option>
                </select>
              </div>
            </div>

            {/* Right Barline Style */}
            <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200 space-y-2">
              <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wide block">
                Right Barline Style
              </span>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: 'Normal', value: 'single', glyph: '|' },
                  { label: 'Double', value: 'double', glyph: '||' },
                  { label: 'Final', value: 'end', glyph: '|▌' },
                  { label: 'Repeat', value: 'repeat_end', glyph: ':||' },
                ].map(({ label, value, glyph }) => {
                  const isSelected = (activeMeasure?.barlineType || 'single') === value;
                  return (
                    <button
                      key={value}
                      id={`barline-style-${value}`}
                      onClick={() => {
                        if (activeMeasure) {
                          onUpdateMeasure(activeMeasure.id, {
                            barlineType: value as any,
                            repeatEnd: value === 'repeat_end' ? true : activeMeasure.repeatEnd,
                          });
                        }
                      }}
                      className={`py-1.5 px-1 rounded font-semibold text-xs transition-colors flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-stone-900 text-white shadow-xs'
                          : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                      }`}
                      title={`${label} Barline`}
                    >
                      <span className="font-mono text-[13px] font-bold leading-tight">{glyph}</span>
                      <span className="text-[10px] mt-0.5">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Measure Operations (Add, Insert, Duplicate, Delete) */}
            <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200 space-y-2">
              <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wide block">
                Measure Actions
              </span>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  id="insert-measure-before-btn"
                  onClick={() => activeMeasure && onInsertMeasureBefore(activeMeasure.id)}
                  className="py-1 px-2 bg-white border border-stone-200 rounded text-stone-700 hover:bg-stone-100 font-semibold flex items-center justify-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Insert Before</span>
                </button>

                <button
                  id="insert-measure-after-btn"
                  onClick={() => activeMeasure && onInsertMeasureAfter(activeMeasure.id)}
                  className="py-1 px-2 bg-white border border-stone-200 rounded text-stone-700 hover:bg-stone-100 font-semibold flex items-center justify-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Insert After</span>
                </button>

                <button
                  id="duplicate-measure-btn"
                  onClick={() => activeMeasure && onDuplicateMeasure(activeMeasure.id)}
                  className="py-1 px-2 bg-white border border-stone-200 rounded text-stone-700 hover:bg-stone-100 font-semibold flex items-center justify-center space-x-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>Duplicate</span>
                </button>

                <button
                  id="clear-measure-btn"
                  onClick={() => activeMeasure && onClearMeasure(activeMeasure.id)}
                  className="py-1 px-2 bg-white border border-stone-200 rounded text-stone-700 hover:bg-stone-100 font-semibold flex items-center justify-center space-x-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              </div>

              {/* Line Break Toggle Button */}
              <button
                id="toggle-line-break-btn"
                onClick={() => activeMeasure && onToggleLineBreak && onToggleLineBreak(activeMeasure.id)}
                className={`w-full py-1.5 px-2.5 rounded font-semibold text-xs border transition-colors flex items-center justify-between ${
                  activeMeasure?.systemBreak
                    ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs'
                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
                }`}
                title="Force score system to break after this measure"
              >
                <span className="flex items-center space-x-1.5">
                  <CornerDownLeft className="w-3.5 h-3.5 text-stone-500" />
                  <span>Line Break After Measure</span>
                </span>
                <span className="text-[10px] bg-stone-100 text-stone-600 px-1 py-0.5 rounded font-mono border border-stone-200">
                  {activeMeasure?.systemBreak ? 'Active ↵' : 'Enter ↵'}
                </span>
              </button>

              <button
                id="delete-measure-btn"
                onClick={() => activeMeasure && onDeleteMeasure(activeMeasure.id)}
                disabled={score.measures.length <= 1}
                className="w-full py-1.5 bg-red-50 text-red-700 border border-red-200 rounded font-semibold text-xs hover:bg-red-100 disabled:opacity-40 transition-colors flex items-center justify-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Measure</span>
              </button>
            </div>
          </>
        )}

        {/* ================= TAB 3: SCORE & GLOBAL CONTROLS ================= */}
        {activeTab === 'score' && (
          <>
            {/* Metadata (Title, Composer, Lyricist) */}
            <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200 space-y-2">
              <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wide block">
                Score Information
              </span>

              <div>
                <label className="text-[10px] text-stone-500 uppercase font-bold block mb-1">Title</label>
                <input
                  type="text"
                  id="score-title-input"
                  value={score.metadata.title}
                  onChange={(e) => onUpdateScoreMetadata({ title: e.target.value })}
                  className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-stone-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-stone-500 uppercase font-bold block mb-1">Composer</label>
                <input
                  type="text"
                  id="score-composer-input"
                  value={score.metadata.composer}
                  onChange={(e) => onUpdateScoreMetadata({ composer: e.target.value })}
                  className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-stone-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-stone-500 uppercase font-bold block mb-1">Lyricist</label>
                <input
                  type="text"
                  id="score-lyricist-input"
                  value={score.metadata.lyricist || ''}
                  onChange={(e) => onUpdateScoreMetadata({ lyricist: e.target.value })}
                  className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-stone-500"
                />
              </div>
            </div>

            {/* Musical Setup: Key, Time Sig, Bars/Line, Taal, Tempo */}
            <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200 space-y-3">
              <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wide block">
                Musical Settings
              </span>

              {/* Key Signature */}
              <div>
                <label className="text-[10px] text-stone-500 uppercase font-bold block mb-1">
                  Key Signature
                </label>
                <select
                  id="key-signature-select"
                  value={score.metadata.initialKeySignature}
                  onChange={(e) => onUpdateScoreMetadata({ initialKeySignature: e.target.value })}
                  className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-stone-500"
                >
                  {Object.values(KEY_SIGNATURES).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Signature */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-stone-500 uppercase font-bold">
                    Time Signature
                  </label>
                  <button
                    onClick={onOpenCustomTimeSignature}
                    className="text-[10px] text-blue-600 hover:underline font-semibold"
                  >
                    Custom...
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { num: 4, den: 4, label: '4/4' },
                    { num: 3, den: 4, label: '3/4' },
                    { num: 2, den: 4, label: '2/4' },
                    { num: 6, den: 8, label: '6/8' },
                  ].map((ts) => {
                    const isSelected =
                      score.metadata.initialTimeSignature.numerator === ts.num &&
                      score.metadata.initialTimeSignature.denominator === ts.den;
                    return (
                      <button
                        key={ts.label}
                        onClick={() =>
                          onUpdateScoreMetadata({
                            initialTimeSignature: { numerator: ts.num, denominator: ts.den },
                          })
                        }
                        className={`py-1 rounded font-bold text-xs ${
                          isSelected
                            ? 'bg-stone-900 text-white'
                            : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {ts.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Measure Lock Per Line */}
              <div className="bg-amber-50/60 p-2 rounded-lg border border-amber-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-amber-950 uppercase font-bold flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-700" />
                    Measure Lock Per Line
                  </label>
                  <span className="text-[10px] font-mono font-semibold text-amber-900">
                    {score.layoutSettings.measureLockPerLine ? `${score.layoutSettings.measureLockPerLine} / line` : 'Off'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <button
                    id="panel-lock-off-btn"
                    onClick={() => onUpdateLayout({ measureLockPerLine: null })}
                    className={`py-1 rounded font-bold text-xs ${
                      score.layoutSettings.measureLockPerLine == null
                        ? 'bg-stone-900 text-white shadow-xs'
                        : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    Off
                  </button>
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      id={`panel-lock-${num}-btn`}
                      onClick={() => onUpdateLayout({ measureLockPerLine: num })}
                      className={`py-1 rounded font-bold text-xs ${
                        score.layoutSettings.measureLockPerLine === num
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    id="panel-lock-custom-btn"
                    onClick={() => {
                      const current = score.layoutSettings.measureLockPerLine || 4;
                      const val = prompt('Enter measures per line (1 to 24):', String(current));
                      if (val) {
                        const parsed = parseInt(val, 10);
                        if (!isNaN(parsed) && parsed >= 1 && parsed <= 24) {
                          onUpdateLayout({ measureLockPerLine: parsed });
                        }
                      }
                    }}
                    className={`py-1 rounded font-bold text-xs ${
                      score.layoutSettings.measureLockPerLine && score.layoutSettings.measureLockPerLine > 6
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Measures Per Line (Bars Per Line) */}
              <div>
                <label className="text-[10px] text-stone-500 uppercase font-bold block mb-1">
                  Bars Per Line (1 to 6)
                </label>
                <div className="grid grid-cols-6 gap-1">
                  {[1, 2, 3, 4, 5, 6].map((bars) => (
                    <button
                      key={bars}
                      id={`bars-per-line-${bars}`}
                      onClick={() =>
                        onUpdateLayout({
                          barsPerLine: bars,
                          measuresPerSystemAuto: bars,
                          layoutMode: 'auto',
                        })
                      }
                      className={`py-1 rounded font-bold text-xs ${
                        (score.layoutSettings.barsPerLine || score.layoutSettings.measuresPerSystemAuto) === bars
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      {bars}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pickup Beat */}
              <div>
                <label className="text-[10px] text-stone-500 uppercase font-bold block mb-1">
                  Pickup Beat (Measure 1 start beat)
                </label>
                <select
                  id="pickup-beat-select"
                  value={score.metadata.pickupBeat || 1}
                  onChange={(e) => onUpdateScoreMetadata({ pickupBeat: Number(e.target.value) })}
                  className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-stone-500"
                >
                  <option value={1}>Beat 1 (Full Bar - No Pickup)</option>
                  <option value={2}>Beat 2 (Beat 1 Locked)</option>
                  <option value={3}>Beat 3 (Beats 1 & 2 Locked)</option>
                  <option value={4}>Beat 4 (Beats 1, 2 & 3 Locked)</option>
                </select>
              </div>

              {/* Indian Taal */}
              <div>
                <label className="text-[10px] text-stone-500 uppercase font-bold block mb-1">
                  Indian Classical Taal
                </label>
                <select
                  id="indian-taal-select"
                  value={score.metadata.indianTaal || 'None'}
                  onChange={(e) => onUpdateScoreMetadata({ indianTaal: e.target.value })}
                  className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-stone-500"
                >
                  {indianTaals.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tempo BPM */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-stone-500 uppercase font-bold">Tempo (BPM)</label>
                  <span className="font-bold text-stone-900 text-xs">
                    {score.metadata.tempoBpm || 80} BPM
                  </span>
                </div>
                <input
                  type="range"
                  id="tempo-slider"
                  min="40"
                  max="240"
                  value={score.metadata.tempoBpm || 80}
                  onChange={(e) => onUpdateScoreMetadata({ tempoBpm: Number(e.target.value) })}
                  className="w-full accent-amber-600"
                />
              </div>

              {/* Header & Footer Independent Settings */}
              <div className="pt-2 border-t border-stone-200 space-y-2">
                <span className="font-bold text-stone-800 text-[10px] uppercase tracking-wide block">
                  Header & Footer (Independent)
                </span>

                <div className="flex items-center justify-between text-xs py-1">
                  <span className="font-medium text-stone-700">Show Header</span>
                  <input
                    type="checkbox"
                    checked={score.layoutSettings.showHeader !== false}
                    onChange={(e) => onUpdateLayout({ showHeader: e.target.checked })}
                    className="accent-amber-600 rounded"
                  />
                </div>

                <div className="flex items-center justify-between text-xs py-1">
                  <span className="font-medium text-stone-700">Show Footer</span>
                  <input
                    type="checkbox"
                    checked={score.layoutSettings.showFooter ?? true}
                    onChange={(e) => onUpdateLayout({ showFooter: e.target.checked })}
                    className="accent-amber-600 rounded"
                  />
                </div>

                {(score.layoutSettings.showFooter ?? true) && (
                  <div className="space-y-1.5 pt-1">
                    <div>
                      <label className="text-[10px] text-stone-500 block mb-0.5 font-medium">
                        Footer Text
                      </label>
                      <input
                        type="text"
                        value={score.layoutSettings.footerCustomText !== undefined ? score.layoutSettings.footerCustomText : (score.metadata.copyright || '© Pianotastic Academy')}
                        onChange={(e) => onUpdateLayout({ footerCustomText: e.target.value })}
                        className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800"
                        placeholder="© Pianotastic Academy"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-stone-500 block mb-0.5 font-medium">
                        Page Numbers
                      </label>
                      <select
                        value={score.layoutSettings.footerPageNumbering === 'none' ? 'none' : 'simple'}
                        onChange={(e) => onUpdateLayout({ footerPageNumbering: e.target.value as 'simple' | 'none' })}
                        className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-xs text-stone-800"
                      >
                        <option value="simple">Simple (1, 2, 3...)</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Reset Layout */}
              <button
                id="reset-layout-btn"
                onClick={onResetLayout}
                className="w-full py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded font-semibold text-xs transition-colors flex items-center justify-center space-x-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Layout to Defaults</span>
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
