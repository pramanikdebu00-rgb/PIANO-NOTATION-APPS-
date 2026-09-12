export type NoteDuration =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'thirty_second';

export type AccidentalType =
  | 'natural'
  | 'sharp'
  | 'flat'
  | 'double_sharp'
  | 'double_flat';

export type NoteStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export type Hand = 'RH' | 'LH' | 'Both';

export type ToolMode =
  | 'select'
  | 'note'
  | 'rest'
  | 'eraser'
  | 'tie'
  | 'slur'
  | 'chord'
  | 'text'
  | 'lyrics'
  | 'chord_symbol'
  | 'symbol'
  | 'navigation'
  | 'space';

export type BarlineType =
  | 'single'
  | 'double'
  | 'end'
  | 'repeat_start'
  | 'repeat_end'
  | 'repeat_both';

export type NavigationJump =
  | 'none'
  | 'D.C.'
  | 'D.C. al Fine'
  | 'D.C. al Coda'
  | 'D.S.'
  | 'D.S. al Fine'
  | 'D.S. al Coda'
  | 'To Coda';

export type NavigationTarget = 'none' | 'Segno' | 'Coda' | 'Fine';

export type VoltaEnding = 1 | 2 | 3;

export interface Volta {
  id: string;
  type?: 'volta';
  endingNumbers: number[]; // e.g. [1], [2], [1, 2], [3]
  startMeasureId: string;
  endMeasureId: string;
  startBeat?: number;
  endBeat?: number;
  closedEnd?: boolean; // true = downward hook at right end (default true for 1st ending), false = open bracket
  text?: string; // Custom label override (e.g., "1.", "2.", "1, 2.")
}

export type TempoBeatUnit = 'quarter' | 'half' | 'dotted_quarter';

export type PageSize = 'A4' | 'Letter' | 'A3' | 'Legal';
export type Orientation = 'portrait' | 'landscape';

export type ArticulationType = 'none' | 'staccato' | 'accent' | 'tenuto' | 'fermata';

export type LearningLayerPosition = 'above_notes' | 'below_notes' | 'above_staff' | 'below_staff';

export type NotationViewMode = 'professional' | 'practice_sheet';

export interface LearningLayerSettings {
  enabled: boolean;
  viewMode: NotationViewMode;
  showRH_LH: boolean;
  showFingerNumbers: boolean;
  showNoteNames: boolean;
  showSolfege: boolean;
  showBeatNumbers: boolean;
  showPracticeCounts: boolean;
  showTeacherNotes: boolean;
  showPracticeRepetitions: boolean;
  targetRepetitions: number; // e.g. 3, 5, or 10 boxes for students to check off
  position: LearningLayerPosition;
  teacherGeneralNotes?: string;
  studentName?: string;
  lessonDate?: string;
}

export interface PlaybackSettings {
  tempoBpm: number;
  tempoBeatUnit: TempoBeatUnit;
  metronomeOn: boolean;
  metronomeVolume: number;
  accentFirstBeat: boolean;
}

export interface MidiSettings {
  mode: 'playback' | 'entry';
  quantization: string;
  selectedChannel: number;
  velocitySensitive: boolean;
}

export interface BrandingSettings {
  showAcademyBranding: boolean;
  academyFooterText: string;
  academyLogoSubtitle?: string;
}

export interface Pitch {
  step: NoteStep;
  octave: number;
  accidental?: AccidentalType | null;
}

export interface NoteEvent {
  id: string;
  type: 'note' | 'rest';
  pitches: Pitch[]; // Single pitch for melody or multiple pitches for chords
  duration: NoteDuration;
  isDotted?: boolean;
  tieWithNext?: boolean;
  hand?: Hand;
  fingerNumber?: number; // 1 to 5 for piano
  lyricSyllable?: string;
  lyricHyphen?: boolean;
  lyricMelisma?: boolean;
  customXOffset?: number;
  articulation?: ArticulationType;
  solfege?: string;
  teacherNote?: string;
}

export interface ChordSymbolEvent {
  id: string;
  beatOffset: number; // in quarter beats (0 = start of measure)
  root: string;
  quality: string;
  bass?: string;
  formatted: string; // e.g. "Cmaj7/E"
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface Measure {
  id: string;
  measureNumber: number;
  timeSignature?: TimeSignature; // if changed mid-score, otherwise inherits previous/score
  keySignature?: string; // if changed mid-score
  customWidth?: number; // for manual layout
  systemBreak?: boolean; // force system / line break after this measure
  pageBreak?: boolean; // force page break after this measure
  barlineType: BarlineType;
  rhEvents: NoteEvent[]; // Right Hand / Treble staff
  lhEvents: NoteEvent[]; // Left Hand / Bass staff
  chordSymbols: ChordSymbolEvent[];
  // Pianotastic custom notation format fields
  beatNotes?: Record<number, (Pitch | null)[]>; // 0-based beat index -> array of pitches/rests (for Value 1..4, null = empty subdivision)
  beatValues?: Record<number, number>; // 0-based beat index -> notes per beat (1, 2, 3, or 4)
  beatLyrics?: Record<string | number, string>; // 0-based beat index OR "b_subBeat" -> lyric syllable / word
  beatChords?: Record<number, string>; // 0-based beat index -> chord name, e.g. "C", "Am", "G7"
  beatSymbols?: Record<number, string[]>; // 0-based beat index -> musical symbols, e.g. ["⌣"]
  sectionName?: string; // Optional section title (e.g. "INTRO", "STHAYI", "VERSE 1", "CHORUS")
  // Repeat & Navigation structural fields
  repeatStart?: boolean; // Repeat Start (||:) at beginning of measure
  repeatEnd?: boolean; // Repeat End (:||) at end of measure
  repeatCount?: number; // Repeat count (e.g. 2, 3, 4; default 2)
  voltaEnding?: VoltaEnding; // 1 = First Ending, 2 = Second Ending, 3 = Third Ending
  navigationJump?: NavigationJump; // D.C., D.S., To Coda, etc.
  navigationTarget?: NavigationTarget; // Segno, Coda, Fine
  // Mid-score tempo change
  tempoBpm?: number;
  tempoBeatUnit?: TempoBeatUnit;
  // Educational & Practice Fields
  teacherNote?: string;
  practiceInstruction?: string;
}

export type OctaveRange = 'low' | 'middle' | 'high';

export type HandTemplate = 'Both' | 'RH' | 'LH';

export interface ScoreMetadata {
  title: string;
  subtitle: string;
  composer: string;
  lyricist: string;
  arranger?: string;
  transcriber?: string;
  copyright: string;
  year?: string;
  difficulty?: 'Beginner' | 'Elementary' | 'Intermediate' | 'Advanced';
  instrument?: string;
  tempoBpm: number;
  tempoBeatUnit?: TempoBeatUnit;
  initialTimeSignature: TimeSignature;
  initialKeySignature: string;
  handTemplate?: HandTemplate;
  indianTaal?: string;
  keyboardLayout?: '61' | '76' | '88';
  pickupMeasure?: number; // Backwards-compatible
  pickupBeat?: number; // Starting beat in Measure 1 (1-based, default 1)
}

export interface LayoutSettings {
  pageSize: PageSize;
  orientation: Orientation;
  layoutMode: 'auto' | 'manual';
  measuresPerSystemAuto: number;
  barsPerLine?: number; // Configurable bars per line (e.g. 1, 2, 3, 4, 5, 6, or auto)
  measureLockPerLine?: number | null; // Fixed measures per line lock (null = off, or 1..6, custom)
  pageMargins: { top: number; right: number; bottom: number; left: number };
  showMeasureNumbers: boolean;
  showAnnotations: boolean;
  showNoteNames: boolean;
  showFingering: boolean;
  showHandLabels: boolean;
  showLyrics: boolean;
  showChordSymbols: boolean;
  showAcademyBranding: boolean; // Toggle Academy branding
  academyFooterText?: string;
  zoom: number; // 0.7 to 1.8
  keyboardLayout?: '61' | '76' | '88';
  showHeader?: boolean; // Independent toggle: Show header (defaults to true)
  headerCustomText?: string;
  headerAlignment?: 'left' | 'center' | 'right';
  headerFontSize?: number;
  headerSpaceFromTop?: number;
  headerSpaceFromScore?: number;
  headerSpaceBelow?: number;
  showFooter?: boolean; // Independent toggle: Show footer (optional, independent of header)
  footerPageNumbering?: 'none' | 'simple' | 'page_of_total' | 'page' | 'pageOfTotal'; // 'simple' = 1, 2, 3... | 'page_of_total' = Page 1 of N
  footerCustomText?: string;
  footerAlignment?: 'left' | 'center' | 'right';
  footerFontSize?: number;
  footerSpaceFromBottom?: number;
  footerSpaceFromScore?: number;
  footerSpaceAbove?: number;
  showPageNumber?: boolean;
  pageNumberPosition?: 'left' | 'center' | 'right';
  footerShowOnAllPages?: boolean;
  footerIncludeTotalPages?: boolean;
}

export interface ScoreTextAnnotation {
  id: string;
  type?: 'text';
  text: string;
  content?: string; // Canonical alias for text
  pageIndex?: number; // 0-based page index (defaults to 0)
  x?: number; // Page-relative X coordinate in px (0 to pageWidth)
  y?: number; // Page-relative Y coordinate in px (0 to pageHeight)
  width?: number; // Bounding box width in px
  height?: number; // Bounding box height in px
  rotation?: number; // Optional rotation in degrees
  fontSize?: number; // e.g. 10, 12, 14, 16, 18, 20, 24, 32
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  fontFamily?: string;

  // Optional anchor references (informative only; visual position is governed by pageIndex, x, y)
  anchorMeasureId?: string | null;
  anchorMeasureNumber?: number | null;
  anchorBeat?: number | null;

  // Legacy compatibility fields
  measureId?: string;
  measureNumber?: number;
  beatIndex?: number;
  subBeatIndex?: number;
  placement?: 'above' | 'below' | 'free';
  offsetX?: number;
  offsetY?: number;
}

export interface SpacingObject {
  id: string;
  afterMeasureId?: string; // ID of the measure after which this space appears
  afterMeasureNumber?: number; // 1-based measure number
  systemIndex?: number; // 0-based system index
  pageIndex?: number; // 0-based page index
  amount: number; // vertical spacing in pixels/points (e.g. 30)
}

export interface Score {
  id: string;
  version: string;
  metadata: ScoreMetadata;
  layoutSettings: LayoutSettings;
  measures: Measure[];
  learningLayer?: LearningLayerSettings;
  textAnnotations?: ScoreTextAnnotation[];
  textObjects?: ScoreTextAnnotation[];
  voltas?: Volta[];
  spacingObjects?: SpacingObject[];
}

/**
 * Canonical accessor for all text objects in a score
 */
export const getScoreTextObjects = (score: Score): ScoreTextAnnotation[] => {
  return score.textObjects || score.textAnnotations || [];
};

export interface SavedProject {
  id: string;
  name: string;
  lastModified: string;
  score: Score;
  thumbnail?: string;
  handTemplate: HandTemplate;
  measuresCount: number;
  keySignature: string;
  tempo: number;
  taal?: string;
}

export interface SelectionState {
  measureId: string | null;
  staff: 'RH' | 'LH' | null;
  eventId: string | null;
  beatIndex?: number; // 0-based beat index within measure
  subBeatIndex?: number; // 0-based note index within beat (for Value 1..4)
  pitchIndex?: number;
  chordSymbolId?: string | null;
  textAnnotationId?: string | null;
  voltaId?: string | null;
  spacingObjectId?: string | null;
  selectedMeasureIds?: string[]; // Multiple selected measures
  selectionType?:
    | 'score'
    | 'measure'
    | 'measures'
    | 'note'
    | 'subdivision'
    | 'beat'
    | 'chord_symbol'
    | 'chord'
    | 'lyrics'
    | 'symbol'
    | 'text'
    | 'volta'
    | 'space';
}

export type ClipboardContentType =
  | 'note'
  | 'subdivision'
  | 'beat'
  | 'measure'
  | 'measures'
  | 'chord'
  | 'lyrics'
  | 'symbol'
  | 'text';

export interface NotationClipboardData {
  type: ClipboardContentType;
  // If note or subdivision:
  notePitch?: Pitch | null;
  noteValue?: number;
  // If beat:
  beatIndex?: number;
  subBeatIndex?: number;
  beatValue?: number;
  beatNotes?: (Pitch | null)[];
  notes?: (Pitch | null)[];
  beatChord?: string;
  beatLyrics?: string;
  lyrics?: string;
  lyric?: string;
  beatSymbols?: string[];
  symbols?: string[];
  symbol?: string;
  // If chord only:
  chord?: string;
  // If complete measure:
  measure?: Measure;
  // If multiple measures:
  measures?: Measure[];
  // If text annotation:
  textAnnotation?: ScoreTextAnnotation;
  timestamp?: number;
}

export interface PianotasticProject {
  format: 'pianotastic';
  version: '2.0.0';
  lastSavedAt: string;
  score: Score;
  learningLayer: LearningLayerSettings;
  playbackSettings: PlaybackSettings;
  midiSettings: MidiSettings;
  brandingSettings: BrandingSettings;
}

export const DEFAULT_LEARNING_LAYER: LearningLayerSettings = {
  enabled: true,
  viewMode: 'professional',
  showRH_LH: true,
  showFingerNumbers: true,
  showNoteNames: false,
  showSolfege: false,
  showBeatNumbers: false,
  showPracticeCounts: false,
  showTeacherNotes: true,
  showPracticeRepetitions: true,
  targetRepetitions: 5,
  position: 'above_notes',
  teacherGeneralNotes: 'Practice hands separately at 60 BPM first, then hands together.',
  studentName: '',
  lessonDate: new Date().toISOString().split('T')[0],
};

