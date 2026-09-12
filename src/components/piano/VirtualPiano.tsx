import React, { useState, useRef, useEffect } from 'react';
import { Pitch, NoteStep, AccidentalType } from '../../types/score';
import { audioEngine } from '../../services/audioEngine';
import { midiService } from '../../services/midiService';
import { getDisplayOctave, getSuperscriptOctave } from '../../utils/pianotasticNotation';
import { X, Keyboard, Eye, EyeOff, Music, Volume2 } from 'lucide-react';

export type PianoKeyboardSize = '61' | '76' | '88';
export type PianoMode = 'play' | 'input';

interface VirtualPianoProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyPress: (pitch: Pitch) => void;
  selectedAccidental: AccidentalType | null;
  keyboardSize?: PianoKeyboardSize;
  onKeyboardSizeChange?: (size: PianoKeyboardSize) => void;
}

interface KeyDef {
  step: NoteStep;
  octave: number;
  displayOctave: number;
  isBlack: boolean;
  accidental?: AccidentalType;
  label: string;
  displayLabel: string;
  computerKey?: string;
  midiNote: number;
}

export const VirtualPiano: React.FC<VirtualPianoProps> = ({
  isOpen,
  onClose,
  onKeyPress,
  keyboardSize: controlledKeyboardSize,
  onKeyboardSizeChange,
}) => {
  const [activeKeyMidi, setActiveKeyMidi] = useState<number | null>(null);
  const [internalKeyboardSize, setInternalKeyboardSize] = useState<PianoKeyboardSize>('61');
  const keyboardSize = controlledKeyboardSize || internalKeyboardSize;

  const handleSetKeyboardSize = (size: PianoKeyboardSize) => {
    setInternalKeyboardSize(size);
    onKeyboardSizeChange?.(size);
  };
  const [pianoMode, setPianoMode] = useState<PianoMode>('input');
  const [showNoteNames, setShowNoteNames] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Determine starting and ending MIDI note based on keyboard size:
  // 61 keys: C2 (MIDI 36) to C7 (MIDI 96)
  // 76 keys: E1 (MIDI 28) to G7 (MIDI 103)
  // 88 keys: A0 (MIDI 21) to C8 (MIDI 108)
  let startMidi = 36;
  let endMidi = 96;

  if (keyboardSize === '76') {
    startMidi = 28;
    endMidi = 103;
  } else if (keyboardSize === '88') {
    startMidi = 21;
    endMidi = 108;
  }

  // Computer keyboard bindings for octave 4
  const octave4Bindings: Record<string, string> = {
    'C4': 'A',
    'C#4': 'W',
    'D4': 'S',
    'D#4': 'E',
    'E4': 'D',
    'F4': 'F',
    'F#4': 'T',
    'G4': 'G',
    'G#4': 'Y',
    'A4': 'H',
    'A#4': 'U',
    'B4': 'J',
    'C5': 'K',
  };

  const keys: KeyDef[] = [];
  const notePitches: { step: NoteStep; isBlack: boolean; acc?: AccidentalType }[] = [
    { step: 'C', isBlack: false },
    { step: 'C', isBlack: true, acc: 'sharp' },
    { step: 'D', isBlack: false },
    { step: 'D', isBlack: true, acc: 'sharp' },
    { step: 'E', isBlack: false },
    { step: 'F', isBlack: false },
    { step: 'F', isBlack: true, acc: 'sharp' },
    { step: 'G', isBlack: false },
    { step: 'G', isBlack: true, acc: 'sharp' },
    { step: 'A', isBlack: false },
    { step: 'A', isBlack: true, acc: 'sharp' },
    { step: 'B', isBlack: false },
  ];

  for (let midi = startMidi; midi <= endMidi; midi++) {
    const semitoneFromC0 = midi - 12;
    const octave = Math.floor(semitoneFromC0 / 12);
    const pitchClass = ((semitoneFromC0 % 12) + 12) % 12;
    const np = notePitches[pitchClass];
    const label = np.acc ? `${np.step}#${octave}` : `${np.step}${octave}`;
    const displayOctave = getDisplayOctave(octave, keyboardSize);
    const displayLabel = np.acc
      ? `${np.step}♯${getSuperscriptOctave(displayOctave)}`
      : `${np.step}${getSuperscriptOctave(displayOctave)}`;

    keys.push({
      step: np.step,
      octave,
      displayOctave,
      isBlack: np.isBlack,
      accidental: np.acc,
      label,
      displayLabel,
      computerKey: octave4Bindings[label],
      midiNote: midi,
    });
  }

  const handleKeyClick = (k: KeyDef) => {
    setActiveKeyMidi(k.midiNote);
    const pitch: Pitch = {
      step: k.step,
      octave: k.octave,
      accidental: k.accidental ?? null,
    };

    // Audition sound
    audioEngine.playPitch(pitch, 'C_major', 0.65);

    // If in input mode, insert into score
    if (pianoMode === 'input') {
      onKeyPress(pitch);
    }

    setTimeout(() => setActiveKeyMidi(null), 200);
  };

  const whiteKeys = keys.filter((k) => !k.isBlack);
  const whiteKeyWidth = keyboardSize === '88' ? 24 : keyboardSize === '76' ? 28 : 34; // in px
  const blackKeyWidth = Math.round(whiteKeyWidth * 0.66);

  // Auto-scroll to center on Middle C (MIDI 60) on mount or keyboard resize
  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      const middleCIndex = whiteKeys.findIndex((wk) => wk.midiNote === 60);
      if (middleCIndex >= 0) {
        const containerWidth = scrollContainerRef.current.clientWidth;
        const targetX = middleCIndex * whiteKeyWidth - containerWidth / 2 + whiteKeyWidth / 2;
        scrollContainerRef.current.scrollTo({ left: Math.max(0, targetX), behavior: 'smooth' });
      }
    }
  }, [isOpen, keyboardSize, whiteKeyWidth, whiteKeys]);

  // Synchronize external MIDI key presses to highlight virtual keys
  useEffect(() => {
    const unsub = midiService.onActiveKeyChange((midiNote, isActive) => {
      if (isActive) {
        setActiveKeyMidi(midiNote);
      } else {
        setActiveKeyMidi((prev) => (prev === midiNote ? null : prev));
      }
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  return (
    <div
      id="virtual-piano-panel"
      className="w-full bg-stone-900 border-t border-stone-800 text-stone-200 select-none print:hidden shadow-xl z-30 transition-all duration-200"
    >
      {/* Top Controls Bar */}
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 text-xs">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Keyboard className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-stone-100">Virtual Piano Keyboard</span>
          </div>

          {/* Mode Selector: Play vs Input */}
          <div className="flex items-center space-x-1 bg-stone-800 p-0.5 rounded-lg border border-stone-700">
            <button
              onClick={() => setPianoMode('input')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                pianoMode === 'input'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Music className="w-3 h-3" />
              <span>Note Input Mode</span>
            </button>
            <button
              onClick={() => setPianoMode('play')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                pianoMode === 'play'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Volume2 className="w-3 h-3" />
              <span>Audition (Play Only)</span>
            </button>
          </div>
        </div>

        {/* View Size & Note Names */}
        <div className="flex items-center space-x-3">
          {/* Keyboard Size selector: 61, 76, 88 keys */}
          <div className="flex items-center space-x-1 bg-stone-800 p-0.5 rounded-lg border border-stone-700">
            <span className="text-[10px] uppercase font-bold text-stone-400 px-2">Size:</span>
            {(['61', '76', '88'] as PianoKeyboardSize[]).map((sz) => (
              <button
                key={sz}
                onClick={() => handleSetKeyboardSize(sz)}
                className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                  keyboardSize === sz
                    ? 'bg-stone-600 text-white font-bold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {sz} Keys
              </button>
            ))}
          </div>

          {/* Note Names Toggle */}
          <button
            onClick={() => setShowNoteNames(!showNoteNames)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
              showNoteNames
                ? 'bg-stone-800 text-stone-200 border-stone-700'
                : 'bg-stone-900 text-stone-500 border-stone-800'
            }`}
          >
            {showNoteNames ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Note Names</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1 rounded text-stone-400 hover:text-white hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Keyboard Area with Horizontal Scrolling */}
      <div
        ref={scrollContainerRef}
        className="w-full overflow-x-auto bg-stone-950 py-3 px-4 flex justify-center custom-scrollbar"
      >
        <div
          className="relative flex h-32 select-none"
          style={{ width: `${whiteKeys.length * whiteKeyWidth}px` }}
        >
          {/* White Keys */}
          {whiteKeys.map((wk) => {
            const isMiddleC = wk.midiNote === 60;
            const isPressed = activeKeyMidi === wk.midiNote;

            return (
              <button
                key={wk.label + wk.midiNote}
                type="button"
                onClick={() => handleKeyClick(wk)}
                style={{ width: `${whiteKeyWidth}px` }}
                className={`h-32 border border-stone-400 rounded-b-md relative flex flex-col justify-end items-center pb-2 transition-colors active:brightness-90 ${
                  isPressed
                    ? 'bg-amber-300'
                    : isMiddleC
                    ? 'bg-amber-100 hover:bg-amber-200 border-amber-300'
                    : 'bg-white hover:bg-stone-100'
                }`}
              >
                {wk.computerKey && (
                  <span className="text-[8px] font-mono font-bold text-stone-400 mb-0.5">
                    {wk.computerKey}
                  </span>
                )}
                {showNoteNames && (
                  <span
                    className={`text-[9px] font-mono leading-tight ${
                      isMiddleC ? 'text-amber-950 font-bold' : 'text-stone-700 font-semibold'
                    }`}
                  >
                    {wk.displayLabel}
                  </span>
                )}
                {isMiddleC && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-0.5" />
                )}
              </button>
            );
          })}

          {/* Black Keys Positioned Above White Keys */}
          {(() => {
            let whiteCounter = 0;
            return keys.map((key) => {
              if (!key.isBlack) {
                whiteCounter++;
                return null;
              }

              // Position black key right over the line between current white key and previous
              const leftPos = whiteCounter * whiteKeyWidth - Math.round(blackKeyWidth / 2);
              const isPressed = activeKeyMidi === key.midiNote;

              return (
                <button
                  key={key.label + key.midiNote}
                  type="button"
                  onClick={() => handleKeyClick(key)}
                  style={{
                    left: `${leftPos}px`,
                    width: `${blackKeyWidth}px`,
                  }}
                  className={`absolute top-0 h-20 rounded-b-sm z-10 flex flex-col justify-end items-center pb-1 transition-all shadow-md active:brightness-125 ${
                    isPressed
                      ? 'bg-amber-500 text-white'
                      : 'bg-stone-900 hover:bg-stone-800 text-stone-300'
                  }`}
                >
                  {key.computerKey && (
                    <span className="text-[7px] font-mono font-bold text-stone-400">
                      {key.computerKey}
                    </span>
                  )}
                  {showNoteNames && keyboardSize !== '88' && (
                    <span className="text-[7px] font-mono opacity-80">{key.displayLabel}</span>
                  )}
                </button>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
};
