/**
 * Centralized Keyboard Shortcut Manager
 *
 * Provides a single, authoritative keyboard shortcut system for Pianotastic Notation Studio.
 * Eliminates duplicate listeners, stale closures, and race conditions.
 *
 * Key guarantees:
 * - Exactly ONE active global keydown listener on window.
 * - Platform awareness: Windows/Linux (Ctrl) vs macOS (Cmd).
 * - Full Text Input Safety: Never intercepts keystrokes when typing in inputs, textareas,
 *   contenteditable elements, chord popovers, lyric inputs, or modal forms.
 * - Conflict Safety:
 *     Ctrl/Cmd + C -> Copy selected notation
 *     Shift + C    -> Add Chord Symbol
 *     Plain C      -> Insert Note C
 * - Space Tool support:
 *     Shift + Enter             -> Insert Vertical Space
 *     Ctrl/Cmd + Shift + Up     -> Increase Selected Space
 *     Ctrl/Cmd + Shift + Down   -> Decrease Selected Space
 * - Does NOT call preventDefault globally; only intercepts handled shortcuts.
 */

import { NoteStep } from '../types/score';

export const isMac =
  typeof navigator !== 'undefined' &&
  Boolean(
    (navigator as any).userAgentData?.platform
      ? /mac/i.test((navigator as any).userAgentData.platform)
      : /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  );

export const modifierKeyName = isMac ? 'Cmd' : 'Ctrl';
export const redoShortcutLabel = isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y';

/**
 * Robustly checks if an event target or the active element is an editable form control.
 * Covers: input, textarea, select, contenteditable, role="textbox", chord popovers,
 * lyric inputs, header/footer fields, and song property fields.
 */
export function isTextInputActive(target?: EventTarget | null): boolean {
  const targetEl = (target as HTMLElement) || null;
  const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  const candidateElements = [targetEl, activeEl].filter(Boolean) as HTMLElement[];

  for (const el of candidateElements) {
    const tagName = el.tagName?.toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
      return true;
    }
    if (el.isContentEditable || el.getAttribute?.('contenteditable') === 'true') {
      return true;
    }
    const role = el.getAttribute?.('role');
    if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
      return true;
    }
    if (
      typeof el.closest === 'function' &&
      el.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="searchbox"], .chord-input, .lyric-input, [data-text-input], [data-no-shortcuts]'
      )
    ) {
      return true;
    }
  }

  return false;
}

export interface CentralShortcutHandlers {
  // Mode / Context checks
  isEditorActive: () => boolean;
  isModalOpen?: () => boolean;

  // Note Entry: A, B, C, D, E, F, G
  onInsertNote: (step: NoteStep) => void;

  // Chord Symbol: Shift + C
  onAddChordSymbol: () => void;

  // Note Value: 1, 2, 3, 4 (or F1, F2, F3, F4)
  onSetValue: (value: 1 | 2 | 3 | 4) => void;

  // Edit
  onUndo: () => void;
  onRedo: () => void;

  // Clipboard
  onCopy: () => void;
  onPaste: () => void;
  onCut: () => void;

  // Space Tool
  onInsertVerticalSpace: () => void;
  onIncreaseSelectedSpace: () => void;
  onDecreaseSelectedSpace: () => void;

  // Canonical Notation Navigation & Actions
  onDelete?: () => void;
  onAdvanceEmptySubdivision?: () => void; // '.'
  onToggleLineBreak?: () => void; // Enter without Shift
  onNavigateHorizontal?: (direction: 'left' | 'right') => void;
  onTransposeVertical?: (semitones: number) => void;
  onTogglePlayPause?: () => void; // Spacebar
  onSave?: () => void; // Ctrl/Cmd + S
  onSaveAs?: () => void; // Ctrl/Cmd + Shift + S
  onPrint?: () => void; // Ctrl/Cmd + P
  onOpenProject?: () => void; // Ctrl/Cmd + O
  onNewProject?: () => void; // Ctrl/Cmd + N
  onOpenSongProperties?: () => void; // Alt + Enter
  onSetToolMode?: (mode: 'select' | 'note' | 'rest' | 'lyrics' | 'text' | 'space') => void;
}

class CentralShortcutManager {
  private static instance: CentralShortcutManager | null = null;
  private handlers: CentralShortcutHandlers | null = null;
  private isListenerAttached = false;

  private constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  public static getInstance(): CentralShortcutManager {
    if (!CentralShortcutManager.instance) {
      CentralShortcutManager.instance = new CentralShortcutManager();
    }
    return CentralShortcutManager.instance;
  }

  /**
   * Registers active application handlers. Automatically attaches the single
   * global window listener if not already attached.
   */
  public registerHandlers(handlers: CentralShortcutHandlers): () => void {
    this.handlers = handlers;
    this.attach();
    return () => {
      if (this.handlers === handlers) {
        this.handlers = null;
      }
    };
  }

  public updateHandlers(handlers: CentralShortcutHandlers): void {
    this.handlers = handlers;
    this.attach();
  }

  private attach(): void {
    if (this.isListenerAttached || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown);
    this.isListenerAttached = true;
  }

  public destroy(): void {
    if (this.isListenerAttached && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
      this.isListenerAttached = false;
    }
    this.handlers = null;
  }

  /**
   * Central keydown event handler
   */
  public handleKeyDown(e: KeyboardEvent): void {
    if (!this.handlers) return;

    // 1. Text Input Safety Guard
    // When typing in any input, textarea, chord popover, lyrics input, modal field, etc.,
    // NEVER intercept or prevent default. Allow standard text typing.
    if (isTextInputActive(e.target)) {
      return;
    }

    // 2. Context Safety Guard: Check if editor view is active
    if (!this.handlers.isEditorActive()) {
      return;
    }

    // 3. Modal Safety Guard: If any dialog/modal is open, do not trigger notation editor shortcuts
    if (this.handlers.isModalOpen && this.handlers.isModalOpen()) {
      return;
    }

    const key = e.key;
    const code = e.code;
    const lowerKey = key.toLowerCase();
    const upperKey = key.toUpperCase();

    // Modifier state
    // Check primary modifier (Cmd on macOS, Ctrl on Windows/Linux; accept either for resilience)
    const hasMod = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const isAlt = e.altKey;

    // =========================================================================
    // 1. SPACE TOOL SHORTCUTS (Must evaluate before Enter or generic arrows)
    // =========================================================================

    // Shift + Enter -> Insert Vertical Space
    if (isShift && !hasMod && !isAlt && (key === 'Enter' || code === 'Enter' || code === 'NumpadEnter')) {
      e.preventDefault();
      this.handlers.onInsertVerticalSpace();
      return;
    }

    // Ctrl/Cmd + Shift + Up -> Decrease Selected Space
    if (hasMod && isShift && !isAlt && (key === 'ArrowUp' || code === 'ArrowUp')) {
      e.preventDefault();
      this.handlers.onDecreaseSelectedSpace();
      return;
    }

    // Ctrl/Cmd + Shift + Down -> Increase Selected Space
    if (hasMod && isShift && !isAlt && (key === 'ArrowDown' || code === 'ArrowDown')) {
      e.preventDefault();
      this.handlers.onIncreaseSelectedSpace();
      return;
    }

    // =========================================================================
    // 2. EDIT: UNDO & REDO
    // =========================================================================

    // Redo on Windows/Linux: Ctrl + Y
    if (e.ctrlKey && !isShift && !isAlt && (lowerKey === 'y' || code === 'KeyY')) {
      e.preventDefault();
      this.handlers.onRedo();
      return;
    }

    // Undo / Redo via Z
    if (hasMod && !isAlt && (lowerKey === 'z' || code === 'KeyZ')) {
      e.preventDefault();
      if (isShift) {
        // Ctrl/Cmd + Shift + Z -> Redo (Standard macOS and Windows alternate)
        this.handlers.onRedo();
      } else {
        // Ctrl/Cmd + Z -> Undo
        this.handlers.onUndo();
      }
      return;
    }

    // =========================================================================
    // 3. CLIPBOARD: CUT, COPY, PASTE
    // =========================================================================

    // Cut: Ctrl/Cmd + X
    if (hasMod && !isShift && !isAlt && (lowerKey === 'x' || code === 'KeyX')) {
      e.preventDefault();
      this.handlers.onCut();
      return;
    }

    // Copy: Ctrl/Cmd + C (CRITICAL: Must intercept here, never insert Note C)
    if (hasMod && !isShift && !isAlt && (lowerKey === 'c' || code === 'KeyC')) {
      e.preventDefault();
      this.handlers.onCopy();
      return;
    }

    // Paste: Ctrl/Cmd + V
    if (hasMod && !isShift && !isAlt && (lowerKey === 'v' || code === 'KeyV')) {
      e.preventDefault();
      this.handlers.onPaste();
      return;
    }

    // =========================================================================
    // 4. CHORD: SHIFT + C
    // =========================================================================
    // Shift + C -> Add Chord Symbol
    // CRITICAL: Shift+C must NEVER insert note C.
    if (isShift && !hasMod && !isAlt && (upperKey === 'C' || code === 'KeyC')) {
      e.preventDefault();
      this.handlers.onAddChordSymbol();
      return;
    }

    // =========================================================================
    // 5. NOTE VALUES: 1, 2, 3, 4 and F1, F2, F3, F4
    // =========================================================================
    if (!hasMod && !isShift && !isAlt) {
      if (key === '1' || code === 'Digit1' || code === 'Numpad1') {
        e.preventDefault();
        this.handlers.onSetValue(1);
        return;
      }
      if (key === '2' || code === 'Digit2' || code === 'Numpad2') {
        e.preventDefault();
        this.handlers.onSetValue(2);
        return;
      }
      if (key === '3' || code === 'Digit3' || code === 'Numpad3') {
        e.preventDefault();
        this.handlers.onSetValue(3);
        return;
      }
      if (key === '4' || code === 'Digit4' || code === 'Numpad4') {
        e.preventDefault();
        this.handlers.onSetValue(4);
        return;
      }
    }

    // Function keys F1..F4 for note values
    if (!hasMod && !isAlt) {
      if (key === 'F1' || code === 'F1') {
        e.preventDefault();
        this.handlers.onSetValue(1);
        return;
      }
      if (key === 'F2' || code === 'F2') {
        e.preventDefault();
        this.handlers.onSetValue(2);
        return;
      }
      if (key === 'F3' || code === 'F3') {
        e.preventDefault();
        this.handlers.onSetValue(3);
        return;
      }
      if (key === 'F4' || code === 'F4') {
        e.preventDefault();
        this.handlers.onSetValue(4);
        return;
      }
    }

    // =========================================================================
    // 6. NOTE ENTRY: C, A, B, D, E, F, G
    // =========================================================================
    // Plain letter keys with NO Ctrl, NO Cmd, NO Shift, NO Alt
    // CRITICAL: C alone must ALWAYS insert note C.
    if (!hasMod && !isShift && !isAlt) {
      const pitchSteps: NoteStep[] = ['C', 'A', 'B', 'D', 'E', 'F', 'G'];
      
      // Check uppercase key character or physical Key code
      let matchedStep: NoteStep | null = null;
      if (pitchSteps.includes(upperKey as NoteStep)) {
        matchedStep = upperKey as NoteStep;
      } else if (code.startsWith('Key')) {
        const stepLetter = code.replace('Key', '').toUpperCase();
        if (pitchSteps.includes(stepLetter as NoteStep)) {
          matchedStep = stepLetter as NoteStep;
        }
      }

      if (matchedStep) {
        e.preventDefault();
        this.handlers.onInsertNote(matchedStep);
        return;
      }

      // Tool mode switching: V (select), S (space), N (note), R (rest), L (lyrics), T (text)
      if (lowerKey === 'v' || code === 'KeyV') {
        e.preventDefault();
        this.handlers.onSetToolMode?.('select');
        return;
      }
      if (lowerKey === 's' || code === 'KeyS') {
        e.preventDefault();
        this.handlers.onSetToolMode?.('space');
        return;
      }
      if (lowerKey === 'n' || code === 'KeyN') {
        e.preventDefault();
        this.handlers.onSetToolMode?.('note');
        return;
      }
      if (lowerKey === 'r' || code === 'KeyR') {
        e.preventDefault();
        this.handlers.onSetToolMode?.('rest');
        return;
      }
      if (lowerKey === 'l' || code === 'KeyL') {
        e.preventDefault();
        this.handlers.onSetToolMode?.('lyrics');
        return;
      }
      if (lowerKey === 't' || code === 'KeyT') {
        e.preventDefault();
        this.handlers.onSetToolMode?.('text');
        return;
      }
    }

    // =========================================================================
    // 7. FILE & WORKSPACE SHORTCUTS
    // =========================================================================

    // Save: Ctrl/Cmd + S
    if (hasMod && !isShift && !isAlt && (lowerKey === 's' || code === 'KeyS')) {
      e.preventDefault();
      this.handlers.onSave?.();
      return;
    }

    // Save As: Ctrl/Cmd + Shift + S
    if (hasMod && isShift && !isAlt && (lowerKey === 's' || code === 'KeyS')) {
      e.preventDefault();
      this.handlers.onSaveAs?.();
      return;
    }

    // Print / Export PDF: Ctrl/Cmd + P
    if (hasMod && !isShift && !isAlt && (lowerKey === 'p' || code === 'KeyP')) {
      e.preventDefault();
      this.handlers.onPrint?.();
      return;
    }

    // Open Project: Ctrl/Cmd + O
    if (hasMod && !isShift && !isAlt && (lowerKey === 'o' || code === 'KeyO')) {
      e.preventDefault();
      this.handlers.onOpenProject?.();
      return;
    }

    // New Project: Ctrl/Cmd + N
    if (hasMod && !isShift && !isAlt && (lowerKey === 'n' || code === 'KeyN')) {
      e.preventDefault();
      this.handlers.onNewProject?.();
      return;
    }

    // Song Properties: Alt + Enter
    if (isAlt && !hasMod && (key === 'Enter' || code === 'Enter')) {
      e.preventDefault();
      this.handlers.onOpenSongProperties?.();
      return;
    }

    // =========================================================================
    // 8. CANONICAL NAVIGATION & NOTATION WORKFLOWS
    // =========================================================================

    // Spacebar -> Play / Pause playback
    if (!hasMod && !isShift && !isAlt && (key === ' ' || code === 'Space')) {
      e.preventDefault();
      this.handlers.onTogglePlayPause?.();
      return;
    }

    // Delete / Backspace -> Clear subdivision or beat
    if (!hasMod && (key === 'Delete' || key === 'Backspace' || code === 'Delete' || code === 'Backspace')) {
      e.preventDefault();
      this.handlers.onDelete?.();
      return;
    }

    // Empty intentional subdivision '.'
    if (!hasMod && !isShift && !isAlt && (key === '.' || code === 'Period' || code === 'NumpadDecimal')) {
      e.preventDefault();
      this.handlers.onAdvanceEmptySubdivision?.();
      return;
    }

    // Enter (without Shift) -> Line Break Toggle
    if (!hasMod && !isShift && !isAlt && (key === 'Enter' || code === 'Enter' || code === 'NumpadEnter')) {
      e.preventDefault();
      this.handlers.onToggleLineBreak?.();
      return;
    }

    // ArrowLeft / ArrowRight -> Move across subdivisions and beats
    if (!hasMod && !isShift && !isAlt) {
      if (key === 'ArrowLeft' || code === 'ArrowLeft') {
        e.preventDefault();
        this.handlers.onNavigateHorizontal?.('left');
        return;
      }
      if (key === 'ArrowRight' || code === 'ArrowRight') {
        e.preventDefault();
        this.handlers.onNavigateHorizontal?.('right');
        return;
      }
    }

    // ArrowUp / ArrowDown -> Transpose selected note
    if (!hasMod && !isShift && !isAlt) {
      if (key === 'ArrowUp' || code === 'ArrowUp') {
        e.preventDefault();
        this.handlers.onTransposeVertical?.(1);
        return;
      }
      if (key === 'ArrowDown' || code === 'ArrowDown') {
        e.preventDefault();
        this.handlers.onTransposeVertical?.(-1);
        return;
      }
    }
  }
}

export const shortcutManager = CentralShortcutManager.getInstance();
