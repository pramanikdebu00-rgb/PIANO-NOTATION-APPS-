import React from 'react';
import { Score, SelectionState } from '../../types/score';
import { getEffectiveBeatValue, getMeasureTotalBeats } from '../../utils/pianotasticNotation';
import { Sliders, Columns, Music, Check, ChevronRight } from 'lucide-react';

interface BeatValueBarProps {
  score: Score;
  selection: SelectionState;
  onChangeBeatValue: (value: number) => void;
  onChangeBarsPerLine: (bars: number) => void;
}

export const BeatValueBar: React.FC<BeatValueBarProps> = ({
  score,
  selection,
  onChangeBeatValue,
  onChangeBarsPerLine,
}) => {
  const currentMeasureId = selection.measureId || score.measures[0]?.id;
  const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
  const currentMeasure = score.measures[measureIdx] || score.measures[0];
  const totalBeats = getMeasureTotalBeats(
    currentMeasure,
    score.metadata.initialTimeSignature,
    score.metadata.indianTaal
  );
  const currentBeatIndex = selection.beatIndex !== undefined ? selection.beatIndex : 0;
  const effectiveValue = getEffectiveBeatValue(score, measureIdx, currentBeatIndex);
  const currentBarsPerLine = score.layoutSettings.barsPerLine || score.layoutSettings.measuresPerSystemAuto || 4;

  const valueOptions = [
    { value: 1, label: '1 note per beat', desc: 'Standard single pulse', symbol: '♩' },
    { value: 2, label: '2 notes per beat', desc: 'Duple subdivision', symbol: '♫' },
    { value: 3, label: '3 notes per beat', desc: 'Triplet subdivision', symbol: '3' },
    { value: 4, label: '4 notes per beat', desc: 'Quadruple subdivision', symbol: '𝅘𝅥𝅯' },
  ];

  const barsOptions = [1, 2, 3, 4, 5, 6];

  return (
    <div
      id="beat-value-panel"
      className="bg-white/95 backdrop-blur-xs border-l border-stone-200 shadow-lg w-64 flex flex-col select-none text-xs p-3 space-y-4 shrink-0 h-full overflow-y-auto custom-scrollbar"
    >
      {/* Target Beat Context Card */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider uppercase text-amber-800 flex items-center space-x-1">
            <Music className="w-3 h-3 text-amber-600" />
            <span>Active Position</span>
          </span>
          <span className="text-[10px] font-bold bg-amber-200/60 text-amber-900 px-1.5 py-0.5 rounded">
            Bar {currentMeasure?.measureNumber || 1}
          </span>
        </div>
        <p className="text-xs font-bold text-amber-950">
          Measure {currentMeasure?.measureNumber || 1} → Beat {currentBeatIndex + 1}
        </p>
        <p className="text-[10px] text-amber-800/80 leading-tight">
          Current: <strong>{effectiveValue} note{effectiveValue > 1 ? 's' : ''} per beat</strong>
        </p>
      </div>

      {/* 1. Value Selector (Notes per Beat) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
            <Sliders className="w-3.5 h-3.5 text-stone-600" />
            <span>Note Value</span>
          </label>
          <span className="text-[9px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
            Per Beat
          </span>
        </div>

        <div className="space-y-1.5">
          {valueOptions.map((opt) => {
            const isSelected = effectiveValue === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChangeBeatValue(opt.value)}
                title={`Note Value ${opt.value} per beat (Shortcut: ${opt.value} or F${opt.value})`}
                className={`w-full flex items-center justify-between p-2 rounded-lg border transition-all text-left ${
                  isSelected
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs ring-1 ring-amber-600'
                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs ${
                      isSelected ? 'bg-amber-700/80 text-white' : 'bg-stone-100 text-stone-800'
                    }`}
                  >
                    {opt.value}
                  </div>
                  <div>
                    <div className="font-bold text-xs leading-none flex items-center gap-1.5">
                      <span>{opt.label}</span>
                      <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${isSelected ? 'bg-amber-700/60 text-amber-100' : 'bg-stone-100 text-stone-500'}`}>
                        {opt.value} / F{opt.value}
                      </span>
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 leading-none ${
                        isSelected ? 'text-amber-100' : 'text-stone-400'
                      }`}
                    >
                      {opt.desc}
                    </div>
                  </div>
                </div>

                {isSelected ? (
                  <Check className="w-4 h-4 text-white shrink-0" />
                ) : (
                  <span className="text-xs text-stone-300 font-mono font-bold">{opt.symbol}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-2 bg-stone-50 border border-stone-200/80 rounded-lg text-[10px] text-stone-600 leading-snug">
          <strong>Rule:</strong> Changing Value applies from <strong>Beat {currentBeatIndex + 1}</strong> forward. Earlier beats retain their original values!
        </div>
      </div>

      {/* 2. Bars Per Line Selector */}
      <div className="space-y-2 pt-2 border-t border-stone-200">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
            <Columns className="w-3.5 h-3.5 text-stone-600" />
            <span>Bars Per Line</span>
          </label>
          <span className="text-[10px] font-bold text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded">
            {currentBarsPerLine} Bars
          </span>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {barsOptions.map((bars) => (
            <button
              key={bars}
              type="button"
              onClick={() => onChangeBarsPerLine(bars)}
              className={`py-1.5 text-center font-bold text-xs rounded-md border transition-colors ${
                currentBarsPerLine === bars
                  ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                  : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
              }`}
            >
              {bars}
            </button>
          ))}
        </div>

        <p className="text-[10px] text-stone-500 leading-tight">
          Score dynamically reflows evenly across margins with no empty right gap.
        </p>
      </div>

      {/* Quick Notation Guide */}
      <div className="space-y-1.5 pt-2 border-t border-stone-200 text-[10px] text-stone-500">
        <div className="font-bold text-stone-700 uppercase tracking-wider text-[9px]">
          Key Shortcuts
        </div>
        <div className="flex justify-between py-0.5">
          <span>Note Entry:</span>
          <span className="font-mono font-semibold text-stone-700">C D E F G A B</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Chord Symbol:</span>
          <span className="font-mono font-semibold text-stone-700">Shift + C</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Values (1–4):</span>
          <span className="font-mono font-semibold text-stone-700">1–4 or F1–F4</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Space Tool:</span>
          <span className="font-mono font-semibold text-stone-700">Shift+Enter / ↕</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Clear / Delete:</span>
          <span className="font-mono font-semibold text-stone-700">Backspace / Del</span>
        </div>
      </div>
    </div>
  );
};
