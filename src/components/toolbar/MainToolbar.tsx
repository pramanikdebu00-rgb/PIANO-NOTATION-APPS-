import React from 'react';
import { ToolMode, NoteDuration, AccidentalType, Hand } from '../../types/score';
import {
  MousePointer,
  Music,
  Minus,
  Eraser,
  Link,
  Layers,
  Type,
  Repeat,
  Baseline,
  Sliders,
  MoveVertical,
  Scissors,
  Copy,
  ClipboardPaste,
} from 'lucide-react';

interface MainToolbarProps {
  toolMode?: ToolMode;
  onSetToolMode?: (mode: ToolMode) => void;
  selectedDuration?: NoteDuration;
  onSetDuration?: (dur: NoteDuration) => void;
  isDotted?: boolean;
  onToggleDotted?: () => void;
  selectedAccidental: AccidentalType | null;
  onSetAccidental: (acc: AccidentalType | null) => void;
  activeHand: Hand;
  onSetHand: (hand: Hand) => void;
  currentBeatValue?: number;
  onChangeBeatValue?: (val: number) => void;
  activePositionText?: string;
  isInspectorOpen?: boolean;
  onToggleInspector?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  hasClipboardContent?: boolean;
  onToggleDoubleBarline?: () => void;
}

export const MainToolbar: React.FC<MainToolbarProps> = ({
  toolMode = 'select',
  onSetToolMode,
  selectedAccidental,
  onSetAccidental,
  activeHand,
  onSetHand,
  currentBeatValue = 1,
  onChangeBeatValue,
  activePositionText = 'Bar 1 • Beat 1 • 1 note/beat',
  isInspectorOpen = true,
  onToggleInspector,
  onCut,
  onCopy,
  onPaste,
  hasClipboardContent = false,
  onToggleDoubleBarline,
}) => {
  const tools: { id: ToolMode; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'select', label: 'Select', icon: <MousePointer className="w-3.5 h-3.5" />, shortcut: 'V' },
    { id: 'note', label: 'Note', icon: <Music className="w-3.5 h-3.5" />, shortcut: 'N' },
    { id: 'rest', label: 'Rest', icon: <Minus className="w-3.5 h-3.5" />, shortcut: 'R' },
    { id: 'space', label: 'Space', icon: <MoveVertical className="w-3.5 h-3.5" />, shortcut: '↕' },
    { id: 'eraser', label: 'Eraser', icon: <Eraser className="w-3.5 h-3.5" />, shortcut: 'Del' },
    { id: 'tie', label: 'Tie', icon: <Link className="w-3.5 h-3.5" />, shortcut: 'T' },
    { id: 'chord', label: 'Chord', icon: <Layers className="w-3.5 h-3.5" />, shortcut: 'K' },
    { id: 'lyrics', label: 'Lyrics', icon: <Type className="w-3.5 h-3.5" />, shortcut: 'L' },
    {
      id: 'symbol',
      label: 'Symbol ⌣',
      icon: <span className="font-bold text-xs leading-none">⌣</span>,
      shortcut: 'S',
    },
    { id: 'navigation', label: 'Navigation', icon: <Repeat className="w-3.5 h-3.5" />, shortcut: 'G' },
    { id: 'text', label: 'Text', icon: <Baseline className="w-3.5 h-3.5" />, shortcut: 'X' },
  ];

  const accidentals: { id: AccidentalType | null; label: string; glyph: string }[] = [
    { id: null, label: 'Auto / None', glyph: '–' },
    { id: 'natural', label: 'Natural', glyph: '♮' },
    { id: 'sharp', label: 'Sharp', glyph: '♯' },
    { id: 'flat', label: 'Flat', glyph: '♭' },
    { id: 'double_sharp', label: 'Double Sharp', glyph: '𝄪' },
    { id: 'double_flat', label: 'Double Flat', glyph: '𝄫' },
  ];

  return (
    <div
      id="main-toolbar"
      className="w-full bg-stone-50 border-b border-stone-200 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs z-20 select-none print:hidden shadow-2xs"
    >
      {/* Left: Primary Editing Tools including Text */}
      <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
        {onSetToolMode && (
          <div className="flex items-center space-x-1 bg-white p-0.5 rounded-lg border border-stone-200/90 shadow-2xs">
            {tools.map((t) => (
              <button
                key={t.id}
                id={`tool-${t.id}`}
                onClick={() => onSetToolMode(t.id)}
                title={`${t.label} (${t.shortcut})`}
                className={`flex items-center space-x-1 px-2 py-1 rounded-md transition-colors ${
                  toolMode === t.id
                    ? 'bg-stone-900 text-white shadow-xs font-semibold'
                    : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                {t.icon}
                <span className="font-medium text-[11px]">{t.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Note Value Selector & Position Indicator */}
        <div className="flex items-center space-x-2">
          {onChangeBeatValue && (
            <div className="flex items-center space-x-1 bg-white p-0.5 rounded-lg border border-stone-200/90 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-stone-500 px-1.5">Value</span>
              {[1, 2, 3, 4].map((val) => (
                <button
                  key={val}
                  id={`value-selector-${val}`}
                  onClick={() => onChangeBeatValue(val)}
                  title={`${val} note${val > 1 ? 's' : ''} per beat`}
                  className={`w-6 h-6 flex items-center justify-center rounded-md font-bold text-xs transition-colors ${
                    currentBeatValue === val
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          )}

          {/* Compact Active Position Indicator */}
          <div
            id="active-position-indicator"
            className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-stone-100/90 border border-stone-200 text-stone-700 font-medium text-[11px]"
            title="Active position in the score"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span>{activePositionText}</span>
          </div>
        </div>
      </div>

      {/* Right Side: Accidentals, Hand Selector & Inspector Toggle */}
      <div className="flex items-center space-x-2">
        {/* Compact Accidentals */}
        <div className="flex items-center space-x-0.5 bg-white p-0.5 rounded-lg border border-stone-200/90 shadow-2xs">
          {accidentals.map((acc) => (
            <button
              key={acc.id || 'none'}
              id={`accidental-${acc.id || 'none'}`}
              onClick={() => onSetAccidental(acc.id)}
              title={acc.label}
              className={`w-6 h-6 flex items-center justify-center rounded-md font-serif text-sm transition-colors ${
                selectedAccidental === acc.id
                  ? 'bg-stone-900 text-white font-bold'
                  : 'text-stone-800 hover:bg-stone-100'
              }`}
            >
              {acc.glyph}
            </button>
          ))}
        </div>

        {/* Compact Hand Selector */}
        <div className="flex items-center space-x-0.5 bg-white p-0.5 rounded-lg border border-stone-200/90 shadow-2xs">
          {(['RH', 'LH', 'Both'] as Hand[]).map((hand) => (
            <button
              key={hand}
              id={`hand-mode-${hand.toLowerCase()}`}
              onClick={() => onSetHand(hand)}
              title={hand === 'RH' ? 'Right Hand (Treble)' : hand === 'LH' ? 'Left Hand (Bass)' : 'Both Hands'}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                activeHand === hand
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              {hand}
            </button>
          ))}
        </div>

        {/* Quick Clipboard Actions */}
        {(onCut || onCopy || onPaste) && (
          <div className="flex items-center space-x-0.5 bg-white p-0.5 rounded-lg border border-stone-200/90 shadow-2xs">
            {onCut && (
              <button
                id="toolbar-cut-btn"
                onClick={onCut}
                title="Cut Selection (Ctrl+X / ⌘X)"
                className="p-1 rounded text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-colors"
              >
                <Scissors className="w-3.5 h-3.5" />
              </button>
            )}
            {onCopy && (
              <button
                id="toolbar-copy-btn"
                onClick={onCopy}
                title="Copy Selection (Ctrl+C / ⌘C)"
                className="p-1 rounded text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            {onPaste && (
              <button
                id="toolbar-paste-btn"
                onClick={onPaste}
                disabled={!hasClipboardContent}
                title={hasClipboardContent ? "Paste into current bar/beat (Ctrl+V / ⌘V)" : "Nothing copied to clipboard"}
                className="p-1 rounded text-stone-700 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
            )}
            {onToggleDoubleBarline && (
              <button
                id="toolbar-double-barline-btn"
                onClick={onToggleDoubleBarline}
                title="Toggle Double Barline (||) on selected bar(s)"
                className="px-1.5 py-0.5 rounded font-bold text-xs font-mono text-stone-700 hover:bg-stone-100 hover:text-stone-900 border border-stone-200 transition-colors"
              >
                ||
              </button>
            )}
          </div>
        )}

        {/* Inspector Panel Toggle Button */}
        {onToggleInspector && (
          <button
            id="toggle-inspector-btn"
            onClick={onToggleInspector}
            title={isInspectorOpen ? 'Collapse Inspector (Expand Score View)' : 'Open Inspector & Tool Settings'}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors shadow-2xs ${
              isInspectorOpen
                ? 'bg-stone-900 text-white border-stone-900'
                : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Inspector</span>
          </button>
        )}
      </div>
    </div>
  );
};
