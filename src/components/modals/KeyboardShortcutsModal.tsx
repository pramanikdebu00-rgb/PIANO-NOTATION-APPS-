import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { modifierKeyName, redoShortcutLabel } from '../../services/shortcutManager';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const mod = modifierKeyName;

  const shortcuts = [
    {
      category: 'Note Entry (Pianotastic)',
      items: [
        { key: 'C', desc: 'Insert Note C at selected beat/subdivision' },
        { key: 'A, B, D, E, F, G', desc: 'Insert Note with pitch letter' },
      ],
    },
    {
      category: 'Chord Symbol',
      items: [
        { key: 'Shift + C', desc: 'Add Chord Symbol dialog at selected beat' },
      ],
    },
    {
      category: 'Note Values & Subdivisions',
      items: [
        { key: '1 or F1', desc: 'Value 1 (1 note per beat)' },
        { key: '2 or F2', desc: 'Value 2 (2 notes per beat)' },
        { key: '3 or F3', desc: 'Value 3 (3 notes per beat)' },
        { key: '4 or F4', desc: 'Value 4 (4 notes per beat)' },
        { key: '.', desc: 'Insert intentional empty subdivision (.)' },
      ],
    },
    {
      category: 'Edit',
      items: [
        { key: `${mod} + Z`, desc: 'Undo' },
        { key: redoShortcutLabel, desc: 'Redo' },
        { key: 'Del / Backspace', desc: 'Clear selected subdivision or beat (—)' },
      ],
    },
    {
      category: 'Copy / Paste',
      items: [
        { key: `${mod} + C`, desc: 'Copy selected notation (beat or bars)' },
        { key: `${mod} + V`, desc: 'Paste copied notation at selected beat' },
        { key: `${mod} + X`, desc: 'Cut selected notation' },
      ],
    },
    {
      category: 'Space Tool (Vertical Spacing ↕)',
      items: [
        { key: 'Shift + Enter', desc: 'Insert Vertical Space after selected bar' },
        { key: `${mod} + Shift + ↑`, desc: 'Increase Selected Space (+10px)' },
        { key: `${mod} + Shift + ↓`, desc: 'Decrease Selected Space (-10px)' },
      ],
    },
    {
      category: 'Navigation & Playback',
      items: [
        { key: '← / → Arrow', desc: 'Navigate across subdivisions and beats' },
        { key: '↑ / ↓ Arrow', desc: 'Transpose selected note up/down' },
        { key: 'Enter', desc: 'Toggle manual line break on selected bar' },
        { key: 'Space', desc: 'Play / Pause playback' },
        { key: `${mod} + S`, desc: 'Save Project to cloud / local storage' },
        { key: `${mod} + P`, desc: 'Open Print Studio / Vector PDF' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-white rounded-xl shadow-xl border border-stone-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-stone-100 rounded-lg text-stone-800">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 font-serif">
                Keyboard Shortcuts
              </h3>
              <p className="text-xs text-stone-500">
                Pianotastic notation input & editing shortcuts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {shortcuts.map((group) => (
            <div key={group.category} className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                {group.category}
              </h4>
              <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200/80 space-y-1.5">
                {group.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between text-xs">
                    <span className="text-stone-700">{item.desc}</span>
                    <kbd className="px-2 py-0.5 bg-white border border-stone-300 rounded font-mono font-semibold text-stone-800 shadow-2xs text-[11px]">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
