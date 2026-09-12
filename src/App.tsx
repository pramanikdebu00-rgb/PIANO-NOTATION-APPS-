import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Score,
  Measure,
  NoteEvent,
  Pitch,
  NoteStep,
  ToolMode,
  NoteDuration,
  AccidentalType,
  SelectionState,
  Hand,
  TimeSignature,
  LearningLayerSettings,
  DEFAULT_LEARNING_LAYER,
  SavedProject,
  ScoreTextAnnotation,
  Volta,
  SpacingObject,
  NotationClipboardData,
  BarlineType,
} from './types/score';
import { SAMPLE_SCORES } from './data/sampleScores';
import { audioEngine } from './services/audioEngine';
import { midiService } from './services/midiService';
import { getStaffStepOffset, pitchFromDiatonicStepValue, getDiatonicStepValue } from './utils/musicTheory';
import { ProjectStorageService, NewScoreConfig } from './services/projectStorageService';
import { ExportService } from './services/exportService';
import { cloudProjectService } from './services/cloudProjectService';
import { auth } from './lib/firebase';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { CloudSyncState } from './components/layout/CloudSyncStatusIndicator';
import {
  getMeasureTotalBeats,
  isBeatLockedByPickup,
  getEffectiveBeatValue,
  calculateNextCursorPosition,
  syncMeasureEventsFromBeatData,
  getNormalizedVoltas,
  syncMeasuresVoltaEndings,
} from './utils/pianotasticNotation';

// Components
import { Header } from './components/layout/Header';
import { MainToolbar } from './components/toolbar/MainToolbar';
import { LeftToolPalette } from './components/palette/LeftToolPalette';
import { NotationRenderer } from './components/notation/NotationRenderer';
import { PropertiesPanel } from './components/properties/PropertiesPanel';
import { BottomPlaybackBar } from './components/playback/BottomPlaybackBar';
import { VirtualPiano } from './components/piano/VirtualPiano';
import { HomeScreen } from './components/home/HomeScreen';
import { PrintStudio } from './components/print/PrintStudio';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Modals
import { AddMeasuresModal } from './components/modals/AddMeasuresModal';
import { CustomTimeSignatureModal } from './components/modals/CustomTimeSignatureModal';
import { ChordDialogModal } from './components/modals/ChordDialogModal';
import { KeyboardShortcutsModal } from './components/modals/KeyboardShortcutsModal';
import { MeasureContextMenu } from './components/modals/MeasureContextMenu';
import { NavigationPalette } from './components/navigation/NavigationPalette';
import { MidiDeviceModal } from './components/midi/MidiDeviceModal';
import { NewScoreSetupModal } from './components/modals/NewScoreSetupModal';
import { SaveAsModal } from './components/modals/SaveAsModal';
import { ProjectLibraryModal } from './components/modals/ProjectLibraryModal';
import { TextAnnotationModal } from './components/modals/TextAnnotationModal';
import { UnsavedChangesModal } from './components/modals/UnsavedChangesModal';
import { SaveProjectModal } from './components/modals/SaveProjectModal';
import { AuthModal } from './components/auth/AuthModal';
import { SongPropertiesModal } from './components/modals/SongPropertiesModal';
import { shortcutManager } from './services/shortcutManager';

export default function App() {
  // Navigation & Startup view state: persist across refreshes
  const [viewMode, setViewMode] = useState<'home' | 'editor' | 'print'>(() => {
    const saved = localStorage.getItem('pianotastic_last_view_mode');
    return saved === 'editor' ? 'editor' : 'home';
  });
  const [isNewScoreModalOpen, setIsNewScoreModalOpen] = useState(false);
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState(false);
  const [isSaveProjectModalOpen, setIsSaveProjectModalOpen] = useState(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [isSongPropertiesModalOpen, setIsSongPropertiesModalOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [unsavedModalConfig, setUnsavedModalConfig] = useState<{
    isOpen: boolean;
    actionType: 'new' | 'open' | 'home';
    pendingTarget?: SavedProject | Score | null;
  }>({
    isOpen: false,
    actionType: 'new',
    pendingTarget: null,
  });

  const [savedProjects, setSavedProjects] = useState<SavedProject[]>(() =>
    ProjectStorageService.getSavedProjects()
  );

  // Score state: restore last active project if available
  const [score, setScore] = useState<Score>(() => {
    const projects = ProjectStorageService.getSavedProjects();
    const lastActiveId = localStorage.getItem('pianotastic_last_active_project_id');
    if (lastActiveId) {
      const found = projects.find((p) => p.id === lastActiveId || p.score?.id === lastActiveId);
      if (found?.score) return found.score;
    }
    return projects[0]?.score || SAMPLE_SCORES.etude;
  });

  // Keep viewMode and active score ID persisted
  useEffect(() => {
    localStorage.setItem('pianotastic_last_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (score?.id) {
      localStorage.setItem('pianotastic_last_active_project_id', score.id);
    }
  }, [score?.id]);

  // Undo / Redo history
  const [history, setHistory] = useState<Score[]>([score]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Tools & Entry state
  const [toolMode, setToolMode] = useState<ToolMode>('note');
  const [selectedDuration, setSelectedDuration] = useState<NoteDuration>('quarter');
  const [isDotted, setIsDotted] = useState(false);
  const [selectedAccidental, setSelectedAccidental] = useState<AccidentalType | null>(null);
  const [activeHand, setActiveHand] = useState<Hand>('RH');

  // Selection state
  const [selection, setSelection] = useState<SelectionState>({
    measureId: 'm1',
    staff: 'RH',
    eventId: null,
    beatIndex: 0,
    subBeatIndex: 0,
  });

  // Playback & Input UI state
  const [playbackPosition, setPlaybackPosition] = useState<{ measureIndex: number; beat: number } | null>(null);
  const [isVirtualPianoOpen, setIsVirtualPianoOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  // Modals state
  const [isAddMeasuresModalOpen, setIsAddMeasuresModalOpen] = useState(false);
  const [isCustomTimeSigOpen, setIsCustomTimeSigOpen] = useState(false);
  const [isChordDialogOpen, setIsChordDialogOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ measure: Measure; x: number; y: number } | null>(null);
  const [navigationModalMeasure, setNavigationModalMeasure] = useState<Measure | null>(null);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState(false);
  const [midiMode, setMidiMode] = useState<'playback' | 'entry'>('entry');
  const [quantization, setQuantization] = useState('quarter');
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [velocitySensitive, setVelocitySensitive] = useState(true);
  const [textModalConfig, setTextModalConfig] = useState<{
    isOpen: boolean;
    initialData?: Partial<ScoreTextAnnotation>;
    measureId?: string;
    measureNumber?: number;
    beatIndex?: number;
    placement?: 'above' | 'below' | 'free';
    pageIndex?: number;
    x?: number;
    y?: number;
  } | null>(null);
  const [appToast, setAppToast] = useState<string | null>(null);

  // Clipboard state
  const [clipboardData, setClipboardData] = useState<NotationClipboardData | null>(() => {
    try {
      const saved = localStorage.getItem('pianotastic_clipboard');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Firebase Auth & Cloud Sync state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);

  // Cloud Sync / Save Status Indicator State
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncState>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(new Date());
  const [cloudErrorMessage, setCloudErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    let unsubscribeProjects: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (unsubscribeProjects) {
        unsubscribeProjects();
        unsubscribeProjects = null;
      }

      if (user && !user.isAnonymous) {
        setIsSyncingCloud(true);
        // Real-time synchronization across Safari, Chrome, and devices
        unsubscribeProjects = cloudProjectService.subscribeToUserProjects(
          user.uid,
          (cloudProjects) => {
            setIsSyncingCloud(false);
            if (cloudProjects.length > 0) {
              setSavedProjects(cloudProjects);
              ProjectStorageService.saveProjects(cloudProjects);
            }
          },
          (err) => {
            console.warn('Cloud projects subscription warning:', err);
            setIsSyncingCloud(false);
          }
        );
      } else {
        // Unauthenticated / local offline mode
        const local = ProjectStorageService.getSavedProjects();
        setSavedProjects(local);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProjects) {
        unsubscribeProjects();
      }
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setAppToast(msg);
    setTimeout(() => setAppToast(null), 3500);
  }, []);

  // Central Cloud Save Execution
  const performCloudSave = useCallback(
    async (scoreToSave: Score, isManual = false) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setCloudSyncStatus('offline');
        ProjectStorageService.saveProject(scoreToSave);
        return;
      }

      setCloudSyncStatus('saving');
      setCloudErrorMessage(null);

      try {
        // 1. Local backup
        const updated = ProjectStorageService.saveProject(scoreToSave);
        setSavedProjects(updated);

        // 2. Cloud Firestore save
        const user = auth.currentUser;
        if (user) {
          await cloudProjectService.saveProject(user.uid, scoreToSave);
        }

        setCloudSyncStatus('saved');
        setLastSavedAt(new Date());
        setCloudErrorMessage(null);
        setIsDirty(false);

        if (isManual) {
          showToast(`Saved "${scoreToSave.metadata.title}" successfully!`);
        }
      } catch (err: any) {
        console.warn('Cloud save error:', err);
        setCloudSyncStatus('error');
        setCloudErrorMessage(err?.message || 'Sync failed. Your latest edits are stored locally.');
      }
    },
    [showToast]
  );

  // Push score to undo stack & mark unsaved
  const pushScoreState = useCallback(
    (newScore: Score) => {
      setHistory((prev) => {
        const upToCurrent = prev.slice(0, historyIndex + 1);
        return [...upToCurrent, newScore];
      });
      setHistoryIndex((prev) => prev + 1);
      setScore(newScore);
      setIsDirty(true);

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setCloudSyncStatus('offline');
      } else {
        setCloudSyncStatus('saving');
      }
    },
    [historyIndex]
  );

  // Debounced Autosave (1.8s)
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isDirty) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      performCloudSave(latestScoreRef.current);
    }, 1800);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [isDirty, score, performCloudSave]);

  // Online / Offline Connectivity Listeners
  useEffect(() => {
    const handleOnline = () => {
      if (isDirty) {
        performCloudSave(latestScoreRef.current);
      } else {
        setCloudSyncStatus('saved');
      }
    };
    const handleOffline = () => {
      setCloudSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isDirty, performCloudSave]);

  // Synchronous references for reliable external MIDI real-time processing
  const latestScoreRef = useRef(score);
  const latestSelectionRef = useRef(selection);
  const latestViewModeRef = useRef(viewMode);
  const latestMidiModeRef = useRef(midiMode);

  useEffect(() => {
    latestScoreRef.current = score;
    latestSelectionRef.current = selection;
    latestViewModeRef.current = viewMode;
    latestMidiModeRef.current = midiMode;
  });

  // Keep accidental preference and key signature in sync with MIDI service
  useEffect(() => {
    midiService.setAccidentalPreference(selectedAccidental);
  }, [selectedAccidental]);

  useEffect(() => {
    midiService.setKeySignature(score.metadata.initialKeySignature);
  }, [score.metadata.initialKeySignature]);

  useEffect(() => {
    midiService.setSelectedChannel(selectedChannel);
  }, [selectedChannel]);

  // Auto-initialize Web MIDI on mount
  useEffect(() => {
    midiService.initialize().catch((err) => {
      console.warn('MIDI initialization note:', err);
    });
    return () => {
      midiService.dispose();
    };
  }, []);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setScore(history[newIndex]);
    }
  }, [historyIndex, history]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setScore(history[newIndex]);
    }
  }, [historyIndex, history]);

  // Project & Home Screen Lifecycle
  const handleOpenNewPageModal = useCallback(() => {
    setIsNewScoreModalOpen(true);
  }, []);

  const handleCloseNewPageModal = useCallback(() => {
    setIsNewScoreModalOpen(false);
  }, []);

  const handleCreateScore = useCallback((config: NewScoreConfig) => {
    const newScore = ProjectStorageService.createNewScore(config);
    const updatedProjects = ProjectStorageService.saveProject(newScore);
    setSavedProjects(updatedProjects);
    setScore(newScore);
    setHistory([newScore]);
    setHistoryIndex(0);
    setIsDirty(false);
    const initialBeatIndex = Math.max(0, (newScore.metadata.pickupBeat || 1) - 1);
    setSelection({
      measureId: newScore.measures[0]?.id || 'm1',
      staff: 'RH',
      eventId: null,
      beatIndex: initialBeatIndex,
      subBeatIndex: 0,
    });
    setIsVirtualPianoOpen(true);
    setIsNewScoreModalOpen(false);
    setViewMode('editor');
  }, []);

  const handleSelectProject = useCallback((projectOrScore: SavedProject | Score) => {
    setCloudSyncStatus('loading');
    const scoreToLoad: Score =
      'metadata' in projectOrScore && 'measures' in projectOrScore
        ? (projectOrScore as Score)
        : (projectOrScore as SavedProject).score;

    setScore(scoreToLoad);
    setHistory([scoreToLoad]);
    setHistoryIndex(0);
    setIsDirty(false);
    setCloudSyncStatus('saved');
    setLastSavedAt(new Date());
    setCloudErrorMessage(null);

    const initialBeatIndex = Math.max(0, (scoreToLoad.metadata?.pickupBeat || 1) - 1);
    setSelection({
      measureId: scoreToLoad.measures[0]?.id || 'm1',
      staff: 'RH',
      eventId: null,
      beatIndex: initialBeatIndex,
      subBeatIndex: 0,
    });
    setIsVirtualPianoOpen(true);
    setViewMode('editor');
  }, []);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const importedScore = await ExportService.importJSON(file);
      const updatedProjects = ProjectStorageService.saveProject(importedScore);
      setSavedProjects(updatedProjects);
      handleSelectProject(importedScore);
    } catch (err) {
      console.error('Failed to import project:', err);
    }
  }, [handleSelectProject]);

  const handleDeleteProject = useCallback((projectId: string) => {
    const targetProj = savedProjects.find((p) => p.id === projectId || p.score?.id === projectId);
    const projectName = targetProj?.name || 'Project';
    const updated = ProjectStorageService.deleteProject(projectId);
    setSavedProjects(updated);
    showToast(`Deleted "${projectName}" successfully`);
    if (currentUser) {
      cloudProjectService.deleteProject(currentUser.uid, projectId).catch((err) => {
        console.warn('Cloud delete error:', err);
      });
    }
  }, [currentUser, savedProjects, showToast]);

  const handleNavigateHome = useCallback(() => {
    // Auto-save current project state internally
    const updated = ProjectStorageService.saveProject(score);
    setSavedProjects(updated);
    if (currentUser) {
      cloudProjectService.saveProject(currentUser.uid, score).catch((err) => {
        console.warn('Cloud auto-save error:', err);
      });
    }
    setIsDirty(false);
    // Stop audio playback if active
    audioEngine.stopPlayback();
    setPlaybackPosition(null);
    setViewMode('home');
  }, [score, currentUser]);

  // Internal Save Project (No download, returns to Home, asks for name if new)
  const handleSaveProject = useCallback(() => {
    const isNew =
      !savedProjects.some((p) => p.id === score.id || p.score.id === score.id) ||
      score.metadata.title === 'Untitled Composition' ||
      !score.metadata.title.trim();

    if (isNew) {
      setIsSaveProjectModalOpen(true);
      return;
    }

    try {
      localStorage.setItem('pianotastic_last_active_project_id', score.id);
      performCloudSave(score, true);
      audioEngine.stopPlayback();
      setPlaybackPosition(null);
      setViewMode('home');
    } catch (err) {
      console.error('Error saving project internally:', err);
    }
  }, [score, savedProjects, performCloudSave]);

  const handleSaveNewProject = useCallback(
    (projectTitle: string) => {
      try {
        const finalScore: Score = {
          ...score,
          id: score.id.startsWith('proj_') ? score.id : `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          metadata: {
            ...score.metadata,
            title: projectTitle,
          },
        };
        setScore(finalScore);
        localStorage.setItem('pianotastic_last_active_project_id', finalScore.id);
        performCloudSave(finalScore, true);
        audioEngine.stopPlayback();
        setPlaybackPosition(null);
        setViewMode('home');
      } catch (err) {
        console.error('Error saving new project:', err);
      }
    },
    [score, performCloudSave]
  );

  // Prompt-guarded New / Open / Home actions for Unsaved Changes
  const requestNewProject = useCallback(() => {
    if (isDirty) {
      setUnsavedModalConfig({
        isOpen: true,
        actionType: 'new',
        pendingTarget: null,
      });
    } else {
      handleOpenNewPageModal();
    }
  }, [isDirty, handleOpenNewPageModal]);

  const requestOpenProject = useCallback((target?: SavedProject | Score) => {
    if (isDirty) {
      setUnsavedModalConfig({
        isOpen: true,
        actionType: 'open',
        pendingTarget: target || null,
      });
    } else {
      if (target) {
        handleSelectProject(target);
      } else {
        setIsLibraryModalOpen(true);
      }
    }
  }, [isDirty, handleSelectProject]);

  const requestNavigateHome = useCallback(() => {
    if (isDirty) {
      setUnsavedModalConfig({
        isOpen: true,
        actionType: 'home',
        pendingTarget: null,
      });
    } else {
      handleNavigateHome();
    }
  }, [isDirty, handleNavigateHome]);

  // Internal Save Copy / Save As (No download, creates new unique ID, returns to Home)
  const handleSaveCopy = useCallback(
    (newTitle: string) => {
      try {
        const newScore: Score = {
          ...score,
          id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          metadata: {
            ...score.metadata,
            title: newTitle,
          },
        };
        const updated = ProjectStorageService.saveProject(newScore);
        setSavedProjects(updated);
        localStorage.setItem('pianotastic_last_active_project_id', newScore.id);
        setIsDirty(false);
        showToast(`Saved new project "${newTitle}" successfully!`);
        audioEngine.stopPlayback();
        setPlaybackPosition(null);
        setViewMode('home');
      } catch (err) {
        console.error('Error saving copy internally:', err);
      }
    },
    [score, showToast]
  );

  // Open Add Measures Dialog (Score -> Add Measure)
  const handleOpenAddMeasuresModal = useCallback(() => {
    setIsAddMeasuresModalOpen(true);
  }, []);

  // Add Exact Number of Measures at End handler
  const handleAddMeasures = useCallback(
    (count: number) => {
      if (!count || count < 1 || !Number.isInteger(count)) return;

      setScore((prev) => {
        const beatsCount = prev.metadata.initialTimeSignature?.numerator || 4;
        const startMeasureNum = prev.measures.length + 1;
        const baseTimestamp = Date.now();

        const newMeasures: Measure[] = Array.from({ length: count }, (_, mIdx) => {
          const mNum = startMeasureNum + mIdx;
          const measureId = `m_${baseTimestamp}_${mIdx}_${Math.random().toString(36).substring(2, 7)}`;

          const rhEvents: NoteEvent[] = Array.from({ length: beatsCount }, (_, bIdx) => ({
            id: `rh_${baseTimestamp}_${mIdx}_${bIdx}_${Math.random().toString(36).substring(2, 7)}`,
            type: 'note',
            pitches: [],
            duration: 'quarter',
          }));

          const lhEvents: NoteEvent[] = Array.from({ length: beatsCount }, (_, bIdx) => ({
            id: `lh_${baseTimestamp}_${mIdx}_${bIdx}_${Math.random().toString(36).substring(2, 7)}`,
            type: 'note',
            pitches: [],
            duration: 'quarter',
          }));

          const newM: Measure = {
            id: measureId,
            measureNumber: mNum,
            barlineType: 'single',
            chordSymbols: [],
            rhEvents,
            lhEvents,
            beatNotes: {},
            beatChords: {},
            beatLyrics: {},
            beatSymbols: {},
            beatValues: {},
          };
          return newM;
        });

        const updatedMeasures = [...prev.measures, ...newMeasures];
        const updated: Score = { ...prev, measures: updatedMeasures };

        // Push single undoable state
        pushScoreState(updated);

        // Select first beat of first newly added measure
        if (newMeasures.length > 0) {
          setSelection({
            measureId: newMeasures[0].id,
            staff: 'RH',
            eventId: null,
            beatIndex: 0,
            subBeatIndex: 0,
          });
        }

        showToast(
          count === 1
            ? `Added Measure ${startMeasureNum} at end`
            : `Added ${count} measures (${startMeasureNum}–${startMeasureNum + count - 1}) at end`
        );

        return updated;
      });
    },
    [pushScoreState, showToast]
  );

  // Change Canonical Time Signature
  const handleChangeTimeSignature = useCallback(
    (newTimeSig: TimeSignature) => {
      setScore((prev) => {
        const oldNumerator = prev.metadata.initialTimeSignature?.numerator || 4;
        const newNumerator = newTimeSig.numerator;

        const updatedMeasures = prev.measures.map((m) => {
          let newRh = [...m.rhEvents];
          let newLh = [...m.lhEvents];

          if (newNumerator > oldNumerator) {
            for (let b = oldNumerator; b < newNumerator; b++) {
              newRh.push({
                id: `rh_${Date.now()}_${b}`,
                type: 'note',
                pitches: [],
                duration: 'quarter',
              });
              newLh.push({
                id: `lh_${Date.now()}_${b}`,
                type: 'note',
                pitches: [],
                duration: 'quarter',
              });
            }
          } else if (newNumerator < oldNumerator) {
            newRh = newRh.slice(0, newNumerator);
            newLh = newLh.slice(0, newNumerator);
          }

          return {
            ...m,
            rhEvents: newRh,
            lhEvents: newLh,
            timeSignature: newTimeSig,
          };
        });

        const updated: Score = {
          ...prev,
          metadata: {
            ...prev.metadata,
            initialTimeSignature: newTimeSig,
          },
          measures: updatedMeasures,
        };
        pushScoreState(updated);
        showToast(`Time signature set to ${newTimeSig.numerator}/${newTimeSig.denominator}`);
        return updated;
      });
    },
    [pushScoreState, showToast]
  );

  // Internal Duplicate Project from library
  const handleDuplicateProject = useCallback(
    (project: SavedProject) => {
      try {
        const copyScore: Score = {
          ...project.score,
          id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          metadata: {
            ...project.score.metadata,
            title: `${project.name} (Copy)`,
          },
        };
        const updated = ProjectStorageService.saveProject(copyScore);
        setSavedProjects(updated);
        showToast(`Duplicated "${project.name}"`);
      } catch (err) {
        console.error('Error duplicating project:', err);
      }
    },
    [showToast]
  );

  // Space Tool Handlers
  const handleUpdateSpace = useCallback(
    (spaceId: string, patch: Partial<SpacingObject>) => {
      setScore((prev) => {
        const existing = prev.spacingObjects || [];
        const updated = existing.map((s) => (s.id === spaceId ? { ...s, ...patch } : s));
        const updatedScore: Score = {
          ...prev,
          spacingObjects: updated,
        };
        pushScoreState(updatedScore);
        return updatedScore;
      });
    },
    [pushScoreState]
  );

  const handleDeleteSpace = useCallback(
    (spaceId: string) => {
      setScore((prev) => {
        const existing = prev.spacingObjects || [];
        const updated = existing.filter((s) => s.id !== spaceId);
        const updatedScore: Score = {
          ...prev,
          spacingObjects: updated,
        };
        pushScoreState(updatedScore);
        return updatedScore;
      });
      setSelection((prev) =>
        prev.spacingObjectId === spaceId
          ? { ...prev, selectionType: 'measure', spacingObjectId: undefined }
          : prev
      );
      showToast('Vertical spacing removed');
    },
    [pushScoreState, showToast]
  );

  const handleAddSpace = useCallback(
    (afterMeasureId: string, amount: number = 30, systemIndex: number = 0) => {
      setScore((prev) => {
        const existing = prev.spacingObjects || [];
        const found = existing.find((s) => s.afterMeasureId === afterMeasureId);
        let updated: SpacingObject[];
        let targetId: string;
        if (found) {
          targetId = found.id;
          updated = existing.map((s) =>
            s.id === found.id ? { ...s, amount: Math.min(300, (s.amount || 0) + amount) } : s
          );
        } else {
          targetId = `space_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const newSpace: SpacingObject = {
            id: targetId,
            afterMeasureId,
            systemIndex,
            amount: Math.min(300, Math.max(10, amount)),
          };
          updated = [...existing, newSpace];
        }
        const updatedScore: Score = {
          ...prev,
          spacingObjects: updated,
        };
        pushScoreState(updatedScore);
        setSelection({
          selectionType: 'space',
          spacingObjectId: targetId,
          measureId: afterMeasureId,
          staff: 'RH',
          eventId: null,
        });
        return updatedScore;
      });
      showToast(`Vertical space adjusted (+${amount}px)`);
    },
    [pushScoreState, showToast]
  );

  // Clipboard Handlers: Copy, Cut, Paste
  const handleCopy = useCallback(() => {
    // Multi-measure copy
    if (selection.selectedMeasureIds && selection.selectedMeasureIds.length > 1) {
      const selectedMeasures = score.measures.filter((m) =>
        selection.selectedMeasureIds!.includes(m.id)
      );
      const clip: NotationClipboardData = {
        type: 'measure',
        measures: JSON.parse(JSON.stringify(selectedMeasures)),
        timestamp: Date.now(),
      };
      setClipboardData(clip);
      try {
        localStorage.setItem('pianotastic_clipboard', JSON.stringify(clip));
      } catch {}
      showToast(`Copied ${selectedMeasures.length} Bars`);
      return;
    }

    const selMeasureId = selection.measureId || score.measures[0]?.id;
    const measure = score.measures.find((m) => m.id === selMeasureId);
    if (!measure) return;

    if (selection.selectionType === 'measure' && (selection.beatIndex === undefined || selection.beatIndex === null)) {
      const clip: NotationClipboardData = {
        type: 'measure',
        measure: JSON.parse(JSON.stringify(measure)),
        timestamp: Date.now(),
      };
      setClipboardData(clip);
      try {
        localStorage.setItem('pianotastic_clipboard', JSON.stringify(clip));
      } catch {}
      showToast(`Copied Bar ${measure.measureNumber}`);
      return;
    }

    const bIdx = selection.beatIndex !== undefined ? selection.beatIndex : 0;
    const subIdx = selection.subBeatIndex !== undefined ? selection.subBeatIndex : 0;

    const beatNotes = measure.beatNotes?.[bIdx] || [];
    const beatChord =
      measure.beatChords?.[bIdx] ||
      measure.chordSymbols?.find((c) => Math.floor(c.beatOffset) === bIdx)?.formatted;
    const beatLyric = measure.beatLyrics?.[`${bIdx}_${subIdx}`] || measure.beatLyrics?.[bIdx];
    const beatSymbols = measure.beatSymbols?.[bIdx] || [];
    const beatValue = measure.beatValues?.[bIdx] || 1;

    const clip: NotationClipboardData = {
      type: 'beat',
      beatIndex: bIdx,
      subBeatIndex: subIdx,
      beatValue,
      notes: JSON.parse(JSON.stringify(beatNotes)),
      chord: beatChord,
      lyric: beatLyric,
      symbols: [...beatSymbols],
      timestamp: Date.now(),
    };

    setClipboardData(clip);
    try {
      localStorage.setItem('pianotastic_clipboard', JSON.stringify(clip));
    } catch {}
    showToast(`Copied Beat ${bIdx + 1} from Bar ${measure.measureNumber}`);
  }, [selection, score, showToast]);

  const handleCut = useCallback(() => {
    // Multi-measure cut
    if (selection.selectedMeasureIds && selection.selectedMeasureIds.length > 1) {
      const selectedMeasures = score.measures.filter((m) =>
        selection.selectedMeasureIds!.includes(m.id)
      );
      const clip: NotationClipboardData = {
        type: 'measure',
        measures: JSON.parse(JSON.stringify(selectedMeasures)),
        timestamp: Date.now(),
      };
      setClipboardData(clip);
      try {
        localStorage.setItem('pianotastic_clipboard', JSON.stringify(clip));
      } catch {}

      let updatedMeasures = score.measures.filter(
        (m) => !selection.selectedMeasureIds!.includes(m.id)
      );
      if (updatedMeasures.length === 0) {
        const fallback = JSON.parse(JSON.stringify(score.measures[0]));
        fallback.id = `m_${Date.now()}`;
        fallback.beatNotes = {};
        fallback.beatChords = {};
        fallback.beatLyrics = {};
        fallback.beatSymbols = {};
        updatedMeasures = [fallback];
      }
      updatedMeasures.forEach((m, i) => {
        m.measureNumber = i + 1;
      });

      pushScoreState({
        ...score,
        measures: updatedMeasures,
      });
      setSelection((prev) => ({
        ...prev,
        measureId: updatedMeasures[0]?.id || null,
        selectedMeasureIds: [updatedMeasures[0]?.id || ''],
        selectionType: 'measure',
        eventId: null,
      }));
      showToast(`Cut ${selectedMeasures.length} Bars`);
      return;
    }

    const selMeasureId = selection.measureId || score.measures[0]?.id;
    const measure = score.measures.find((m) => m.id === selMeasureId);
    if (!measure) return;

    const bIdx = selection.beatIndex !== undefined ? selection.beatIndex : 0;
    const subIdx = selection.subBeatIndex !== undefined ? selection.subBeatIndex : 0;

    // First copy to clipboard
    handleCopy();

    // Then clear from measure
    const nextBeatNotes = { ...(measure.beatNotes || {}) };
    delete nextBeatNotes[bIdx];

    const nextBeatChords = { ...(measure.beatChords || {}) };
    delete nextBeatChords[bIdx];

    const nextBeatLyrics = { ...(measure.beatLyrics || {}) };
    delete nextBeatLyrics[`${bIdx}_${subIdx}`];
    delete nextBeatLyrics[bIdx];

    const nextBeatSymbols = { ...(measure.beatSymbols || {}) };
    delete nextBeatSymbols[bIdx];

    const updatedMeasure: Measure = {
      ...measure,
      beatNotes: nextBeatNotes,
      beatChords: nextBeatChords,
      beatLyrics: nextBeatLyrics,
      beatSymbols: nextBeatSymbols,
    };
    const syncedMeasure = syncMeasureEventsFromBeatData(
      updatedMeasure,
      score.metadata.initialTimeSignature,
      score.metadata.handTemplate || 'Both'
    );

    const updatedMeasures = score.measures.map((m) => (m.id === measure.id ? syncedMeasure : m));
    pushScoreState({
      ...score,
      measures: updatedMeasures,
    });
    showToast(`Cut Beat ${bIdx + 1} from Bar ${measure.measureNumber}`);
  }, [selection, score, handleCopy, pushScoreState, showToast]);

  const handlePaste = useCallback(() => {
    if (!clipboardData) {
      showToast('Clipboard is empty');
      return;
    }

    // Multi-measure paste
    if (clipboardData.measures && clipboardData.measures.length > 0) {
      const targetMeasureId = selection.measureId || score.measures[0]?.id;
      const targetIdx = score.measures.findIndex((m) => m.id === targetMeasureId);
      const insertIdx = targetIdx !== -1 ? targetIdx + 1 : score.measures.length;

      const newMeasures: Measure[] = clipboardData.measures.map((m, idx) => ({
        ...JSON.parse(JSON.stringify(m)),
        id: `measure_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      }));

      const updatedMeasures = [...score.measures];
      updatedMeasures.splice(insertIdx, 0, ...newMeasures);
      updatedMeasures.forEach((m, i) => {
        m.measureNumber = i + 1;
      });

      pushScoreState({ ...score, measures: updatedMeasures });
      setSelection((prev) => ({
        ...prev,
        measureId: newMeasures[0]?.id || null,
        selectedMeasureIds: newMeasures.map((m) => m.id),
        selectionType: newMeasures.length > 1 ? 'measures' : 'measure',
        eventId: null,
      }));
      showToast(`Pasted ${newMeasures.length} Bars`);
      return;
    }

    const selMeasureId = selection.measureId || score.measures[0]?.id;
    const measure = score.measures.find((m) => m.id === selMeasureId);
    if (!measure) return;

    const bIdx = selection.beatIndex !== undefined ? selection.beatIndex : 0;
    const subIdx = selection.subBeatIndex !== undefined ? selection.subBeatIndex : 0;

    const nextBeatNotes = { ...(measure.beatNotes || {}) };
    if (clipboardData.notes && clipboardData.notes.length > 0) {
      nextBeatNotes[bIdx] = JSON.parse(JSON.stringify(clipboardData.notes));
    }

    const nextBeatChords = { ...(measure.beatChords || {}) };
    if (clipboardData.chord) {
      nextBeatChords[bIdx] = clipboardData.chord;
    }

    const nextBeatLyrics = { ...(measure.beatLyrics || {}) };
    if (clipboardData.lyric) {
      nextBeatLyrics[`${bIdx}_${subIdx}`] = clipboardData.lyric;
    }

    const nextBeatSymbols = { ...(measure.beatSymbols || {}) };
    if (clipboardData.symbols && clipboardData.symbols.length > 0) {
      nextBeatSymbols[bIdx] = [...clipboardData.symbols];
    }

    const nextBeatValues = { ...(measure.beatValues || {}) };
    if (clipboardData.beatValue) {
      nextBeatValues[bIdx] = clipboardData.beatValue;
    }

    const updatedMeasure: Measure = {
      ...measure,
      beatNotes: nextBeatNotes,
      beatChords: nextBeatChords,
      beatLyrics: nextBeatLyrics,
      beatSymbols: nextBeatSymbols,
      beatValues: nextBeatValues,
    };
    const syncedMeasure = syncMeasureEventsFromBeatData(
      updatedMeasure,
      score.metadata.initialTimeSignature,
      score.metadata.handTemplate || 'Both'
    );

    const updatedMeasures = score.measures.map((m) => (m.id === measure.id ? syncedMeasure : m));
    pushScoreState({
      ...score,
      measures: updatedMeasures,
    });
    showToast(`Pasted into Bar ${measure.measureNumber}, Beat ${bIdx + 1}`);
  }, [clipboardData, selection, score, pushScoreState, showToast]);

  // Handle Copy Whole Measure
  const handleCopyMeasure = useCallback((measureId: string) => {
    const measure = score.measures.find((m) => m.id === measureId);
    if (!measure) return;

    const clip: NotationClipboardData = {
      type: 'measure',
      measure: JSON.parse(JSON.stringify(measure)),
      timestamp: Date.now(),
    };
    setClipboardData(clip);
    try {
      localStorage.setItem('pianotastic_clipboard', JSON.stringify(clip));
    } catch {}
    showToast(`Copied Bar ${measure.measureNumber}`);
  }, [score, showToast]);

  // Handle Paste into Whole Measure
  const handlePasteIntoMeasure = useCallback((measureId: string) => {
    if (!clipboardData) {
      showToast('Clipboard is empty');
      return;
    }
    const measure = score.measures.find((m) => m.id === measureId);
    if (!measure) return;

    let updatedMeasure: Measure;
    if (clipboardData.type === 'measure' && clipboardData.measure) {
      updatedMeasure = {
        ...JSON.parse(JSON.stringify(clipboardData.measure)),
        id: measure.id,
        measureNumber: measure.measureNumber,
      };
    } else {
      const bIdx = 0;
      const nextBeatNotes = { ...(measure.beatNotes || {}) };
      if (clipboardData.notes) nextBeatNotes[bIdx] = JSON.parse(JSON.stringify(clipboardData.notes));
      const nextBeatChords = { ...(measure.beatChords || {}) };
      if (clipboardData.chord) nextBeatChords[bIdx] = clipboardData.chord;
      const nextBeatLyrics = { ...(measure.beatLyrics || {}) };
      if (clipboardData.lyric) nextBeatLyrics[`0_0`] = clipboardData.lyric;
      updatedMeasure = {
        ...measure,
        beatNotes: nextBeatNotes,
        beatChords: nextBeatChords,
        beatLyrics: nextBeatLyrics,
      };
    }
    const syncedMeasure = syncMeasureEventsFromBeatData(
      updatedMeasure,
      score.metadata.initialTimeSignature,
      score.metadata.handTemplate || 'Both'
    );
    const updatedMeasures = score.measures.map((m) => (m.id === measure.id ? syncedMeasure : m));
    pushScoreState({
      ...score,
      measures: updatedMeasures,
    });
    showToast(`Pasted into Bar ${measure.measureNumber}`);
  }, [clipboardData, score, pushScoreState, showToast]);

  // Update Score Metadata
  const handleUpdateMetadata = useCallback((patch: Partial<Score['metadata']>) => {
    setScore((prev) => {
      const updated: Score = {
        ...prev,
        metadata: { ...prev.metadata, ...patch },
      };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Update Layout Settings
  const handleUpdateLayout = useCallback((patch: Partial<Score['layoutSettings']>) => {
    setScore((prev) => {
      const updated: Score = {
        ...prev,
        layoutSettings: { ...prev.layoutSettings, ...patch },
      };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Update Measure
  const handleUpdateMeasure = useCallback((measureId: string, patch: Partial<Measure>) => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) =>
        m.id === measureId ? { ...m, ...patch } : m
      );
      let updatedVoltas = getNormalizedVoltas(prev);
      if ('voltaEnding' in patch) {
        if (!patch.voltaEnding) {
          updatedVoltas = updatedVoltas.filter((v) => v.startMeasureId !== measureId);
        } else {
          const num = patch.voltaEnding;
          const existing = updatedVoltas.find((v) => v.startMeasureId === measureId);
          if (existing) {
            updatedVoltas = updatedVoltas.map((v) =>
              v.id === existing.id
                ? { ...v, endingNumbers: [num], text: `${num}.` }
                : v
            );
          } else {
            updatedVoltas.push({
              id: `volta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'volta',
              endingNumbers: [num],
              text: `${num}.`,
              startMeasureId: measureId,
              endMeasureId: measureId,
              closedEnd: true,
            });
          }
        }
      }
      const syncedMeasures = syncMeasuresVoltaEndings(updatedMeasures, updatedVoltas);
      const updated: Score = { ...prev, measures: syncedMeasures, voltas: updatedVoltas };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Select Measure (supports single-select, multi-select Ctrl/Cmd, range-select Shift)
  const handleSelectMeasure = useCallback((clickedMeasureId: string, isCtrl?: boolean, isShift?: boolean) => {
    setSelection((prev) => {
      if (isCtrl) {
        const currentSelected = prev.selectedMeasureIds && prev.selectedMeasureIds.length > 0
          ? [...prev.selectedMeasureIds]
          : prev.measureId ? [prev.measureId] : [];
        const exists = currentSelected.includes(clickedMeasureId);
        const updated = exists
          ? currentSelected.filter((id) => id !== clickedMeasureId)
          : [...currentSelected, clickedMeasureId];
        return {
          ...prev,
          measureId: updated[0] || null,
          selectedMeasureIds: updated,
          selectionType: updated.length > 1 ? 'measures' : 'measure',
          eventId: null,
        };
      }

      if (isShift && prev.measureId) {
        const measureIndexA = score.measures.findIndex((m) => m.id === prev.measureId);
        const measureIndexB = score.measures.findIndex((m) => m.id === clickedMeasureId);
        if (measureIndexA !== -1 && measureIndexB !== -1) {
          const start = Math.min(measureIndexA, measureIndexB);
          const end = Math.max(measureIndexA, measureIndexB);
          const rangeIds = score.measures.slice(start, end + 1).map((m) => m.id);
          return {
            ...prev,
            measureId: clickedMeasureId,
            selectedMeasureIds: rangeIds,
            selectionType: 'measures',
            eventId: null,
          };
        }
      }

      // Single click
      return {
        ...prev,
        measureId: clickedMeasureId,
        selectedMeasureIds: [clickedMeasureId],
        selectionType: 'measure',
        eventId: null,
      };
    });
  }, [score.measures]);

  // Select Volta
  const handleSelectVolta = useCallback((voltaId: string) => {
    const currentVoltas = getNormalizedVoltas(score);
    const target = currentVoltas.find((v) => v.id === voltaId);
    if (target) {
      setSelection({
        measureId: target.startMeasureId,
        staff: 'RH',
        eventId: null,
        selectionType: 'volta',
        voltaId: target.id,
      });
    }
  }, [score]);

  // Add Volta
  const handleAddVolta = useCallback((startMeasureId: string, endMeasureId: string, endings: number[], text?: string) => {
    setScore((prev) => {
      const currentVoltas = getNormalizedVoltas(prev);
      const newVolta: Volta = {
        id: `volta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'volta',
        endingNumbers: endings,
        text: text || `${endings.join(', ')}.`,
        startMeasureId,
        endMeasureId: endMeasureId || startMeasureId,
        closedEnd: true,
      };

      const updatedVoltas = [...currentVoltas, newVolta];
      const syncedMeasures = syncMeasuresVoltaEndings(prev.measures, updatedVoltas);
      const updated: Score = {
        ...prev,
        voltas: updatedVoltas,
        measures: syncedMeasures,
      };
      pushScoreState(updated);
      setSelection({
        measureId: startMeasureId,
        staff: 'RH',
        eventId: null,
        selectionType: 'volta',
        voltaId: newVolta.id,
      });
      showToast(`Added ${newVolta.text} Volta ending`);
      return updated;
    });
  }, [pushScoreState, showToast]);

  // Update Volta
  const handleUpdateVolta = useCallback((voltaId: string, patch: Partial<Volta>) => {
    setScore((prev) => {
      const currentVoltas = getNormalizedVoltas(prev);
      const updatedVoltas = currentVoltas.map((v) => (v.id === voltaId ? { ...v, ...patch } : v));
      const syncedMeasures = syncMeasuresVoltaEndings(prev.measures, updatedVoltas);
      const updated: Score = {
        ...prev,
        voltas: updatedVoltas,
        measures: syncedMeasures,
      };
      pushScoreState(updated);
      showToast('Volta ending updated');
      return updated;
    });
  }, [pushScoreState, showToast]);

  // Delete Volta
  const handleDeleteVolta = useCallback((voltaId: string) => {
    setScore((prev) => {
      const currentVoltas = getNormalizedVoltas(prev);
      const updatedVoltas = currentVoltas.filter((v) => v.id !== voltaId);
      const syncedMeasures = syncMeasuresVoltaEndings(prev.measures, updatedVoltas);
      const updated: Score = {
        ...prev,
        voltas: updatedVoltas,
        measures: syncedMeasures,
      };
      pushScoreState(updated);
      setSelection((sel) => ({
        ...sel,
        selectionType: undefined,
        voltaId: undefined,
      }));
      showToast('Volta ending deleted');
      return updated;
    });
  }, [pushScoreState, showToast]);

  // Update Event
  const handleUpdateEvent = useCallback((
    measureId: string,
    staff: 'RH' | 'LH',
    eventId: string,
    patch: Partial<NoteEvent>
  ) => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) => {
        if (m.id !== measureId) return m;
        const list = staff === 'RH' ? m.rhEvents : m.lhEvents;
        const updatedList = list.map((ev) =>
          ev.id === eventId ? { ...ev, ...patch } : ev
        );
        return {
          ...m,
          rhEvents: staff === 'RH' ? updatedList : m.rhEvents,
          lhEvents: staff === 'LH' ? updatedList : m.lhEvents,
        };
      });
      const updated: Score = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Measure Operations
  const handleAddMeasure = useCallback(() => {
    setScore((prev) => {
      const newNum = prev.measures.length + 1;
      const newMeasure: Measure = {
        id: `m_${Date.now()}`,
        measureNumber: newNum,
        barlineType: 'single',
        chordSymbols: [],
        rhEvents: [
          {
            id: `rh_${Date.now()}`,
            type: 'rest',
            pitches: [],
            duration: 'whole',
          },
        ],
        lhEvents: [
          {
            id: `lh_${Date.now()}`,
            type: 'rest',
            pitches: [],
            duration: 'whole',
          },
        ],
      };
      const updated: Score = {
        ...prev,
        measures: [...prev.measures, newMeasure],
      };
      pushScoreState(updated);
      setSelection({ measureId: newMeasure.id, staff: 'RH', eventId: null });
      return updated;
    });
  }, [pushScoreState]);

  const handleInsertMeasureBefore = useCallback((targetMeasureId: string) => {
    setScore((prev) => {
      const idx = prev.measures.findIndex((m) => m.id === targetMeasureId);
      if (idx === -1) return prev;

      const newMeasure: Measure = {
        id: `m_${Date.now()}`,
        measureNumber: idx + 1,
        barlineType: 'single',
        chordSymbols: [],
        rhEvents: [{ id: `rh_${Date.now()}`, type: 'rest', pitches: [], duration: 'whole' }],
        lhEvents: [{ id: `lh_${Date.now()}`, type: 'rest', pitches: [], duration: 'whole' }],
      };

      const newMeasures = [...prev.measures];
      newMeasures.splice(idx, 0, newMeasure);
      // Renumber
      newMeasures.forEach((m, i) => {
        m.measureNumber = i + 1;
      });

      const updatedAnnotations = (prev.textAnnotations || []).map((t) => {
        const mIdx = newMeasures.findIndex((m) => m.id === t.measureId);
        return mIdx >= 0 ? { ...t, measureNumber: mIdx + 1 } : t;
      });

      const updated: Score = { ...prev, measures: newMeasures, textAnnotations: updatedAnnotations };
      pushScoreState(updated);
      setSelection({ measureId: newMeasure.id, staff: 'RH', eventId: null });
      return updated;
    });
  }, [pushScoreState]);

  const handleInsertMeasureAfter = useCallback((targetMeasureId: string) => {
    setScore((prev) => {
      const idx = prev.measures.findIndex((m) => m.id === targetMeasureId);
      if (idx === -1) return prev;

      const newMeasure: Measure = {
        id: `m_${Date.now()}`,
        measureNumber: idx + 2,
        barlineType: 'single',
        chordSymbols: [],
        rhEvents: [{ id: `rh_${Date.now()}`, type: 'rest', pitches: [], duration: 'whole' }],
        lhEvents: [{ id: `lh_${Date.now()}`, type: 'rest', pitches: [], duration: 'whole' }],
      };

      const newMeasures = [...prev.measures];
      newMeasures.splice(idx + 1, 0, newMeasure);
      // Renumber
      newMeasures.forEach((m, i) => {
        m.measureNumber = i + 1;
      });

      const updatedAnnotations = (prev.textAnnotations || []).map((t) => {
        const mIdx = newMeasures.findIndex((m) => m.id === t.measureId);
        return mIdx >= 0 ? { ...t, measureNumber: mIdx + 1 } : t;
      });

      const updated: Score = { ...prev, measures: newMeasures, textAnnotations: updatedAnnotations };
      pushScoreState(updated);
      setSelection({ measureId: newMeasure.id, staff: 'RH', eventId: null });
      return updated;
    });
  }, [pushScoreState]);

  const handleDuplicateMeasure = useCallback((targetMeasureId: string) => {
    setScore((prev) => {
      const isMulti = selection.selectedMeasureIds && selection.selectedMeasureIds.length > 1;
      const idsToDup = isMulti ? selection.selectedMeasureIds! : [targetMeasureId];
      const measuresToDup = prev.measures.filter((m) => idsToDup.includes(m.id));
      if (measuresToDup.length === 0) return prev;

      const lastIdx = Math.max(...idsToDup.map((id) => prev.measures.findIndex((m) => m.id === id)));
      const insertAt = lastIdx !== -1 ? lastIdx + 1 : prev.measures.length;

      const clonedList: Measure[] = measuresToDup.map((target, cIdx) => {
        const cloned: Measure = JSON.parse(JSON.stringify(target));
        cloned.id = `m_${Date.now()}_${cIdx}`;
        cloned.rhEvents.forEach((e) => (e.id = `rh_${Math.random()}`));
        cloned.lhEvents.forEach((e) => (e.id = `lh_${Math.random()}`));
        cloned.chordSymbols.forEach((c) => (c.id = `cs_${Math.random()}`));
        return cloned;
      });

      const newMeasures = [...prev.measures];
      newMeasures.splice(insertAt, 0, ...clonedList);
      newMeasures.forEach((m, i) => {
        m.measureNumber = i + 1;
      });

      const updatedAnnotations = (prev.textAnnotations || []).map((t) => {
        const mIdx = newMeasures.findIndex((m) => m.id === t.measureId);
        return mIdx >= 0 ? { ...t, measureNumber: mIdx + 1 } : t;
      });

      const updated: Score = { ...prev, measures: newMeasures, textAnnotations: updatedAnnotations };
      pushScoreState(updated);
      setSelection({
        measureId: clonedList[0].id,
        selectedMeasureIds: clonedList.map((m) => m.id),
        selectionType: clonedList.length > 1 ? 'measures' : 'measure',
        staff: 'RH',
        eventId: null,
      });
      showToast(`Duplicated ${clonedList.length} Bar${clonedList.length > 1 ? 's' : ''}`);
      return updated;
    });
  }, [selection, pushScoreState, showToast]);

  const handleDeleteMeasure = useCallback((targetMeasureId: string) => {
    setScore((prev) => {
      const isMulti = selection.selectedMeasureIds && selection.selectedMeasureIds.length > 1;
      const idsToDelete = isMulti ? selection.selectedMeasureIds! : [targetMeasureId];
      if (prev.measures.length <= idsToDelete.length && prev.measures.length <= 1) return prev;

      let newMeasures = prev.measures.filter((m) => !idsToDelete.includes(m.id));
      if (newMeasures.length === 0) {
        const fallback = JSON.parse(JSON.stringify(prev.measures[0]));
        fallback.id = `m_${Date.now()}`;
        fallback.beatNotes = {};
        fallback.beatChords = {};
        fallback.beatLyrics = {};
        fallback.beatSymbols = {};
        newMeasures = [fallback];
      }
      newMeasures.forEach((m, i) => {
        m.measureNumber = i + 1;
      });

      const updatedAnnotations = (prev.textAnnotations || [])
        .filter((t) => !idsToDelete.includes(t.measureId))
        .map((t) => {
          const mIdx = newMeasures.findIndex((m) => m.id === t.measureId);
          return mIdx >= 0 ? { ...t, measureNumber: mIdx + 1 } : t;
        });

      const updated: Score = { ...prev, measures: newMeasures, textAnnotations: updatedAnnotations };
      pushScoreState(updated);
      setSelection({
        measureId: newMeasures[0].id,
        selectedMeasureIds: [newMeasures[0].id],
        selectionType: 'measure',
        staff: 'RH',
        eventId: null,
      });
      showToast(`Deleted ${idsToDelete.length} Bar${idsToDelete.length > 1 ? 's' : ''}`);
      return updated;
    });
  }, [selection, pushScoreState, showToast]);

  const handleClearMeasure = useCallback((targetMeasureId: string) => {
    setScore((prev) => {
      const isMulti = selection.selectedMeasureIds && selection.selectedMeasureIds.length > 1;
      const idsToClear = isMulti ? selection.selectedMeasureIds! : [targetMeasureId];
      const updatedMeasures = prev.measures.map((m) => {
        if (!idsToClear.includes(m.id)) return m;
        return {
          ...m,
          beatNotes: {},
          beatChords: {},
          beatLyrics: {},
          beatSymbols: {},
          chordSymbols: [],
          rhEvents: [{ id: `rh_${Date.now()}`, type: 'rest' as const, pitches: [], duration: 'whole' as const }],
          lhEvents: [{ id: `lh_${Date.now()}`, type: 'rest' as const, pitches: [], duration: 'whole' as const }],
        };
      });
      const updated: Score = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      showToast(`Cleared ${idsToClear.length} Bar${idsToClear.length > 1 ? 's' : ''}`);
      return updated;
    });
  }, [selection, pushScoreState, showToast]);

  const handleToggleDoubleBarline = useCallback((measureId: string) => {
    setScore((prev) => {
      const isMulti = selection.selectedMeasureIds && selection.selectedMeasureIds.length > 1;
      const ids = isMulti ? selection.selectedMeasureIds! : [measureId];
      const updatedMeasures: Measure[] = prev.measures.map((m) => {
        if (!ids.includes(m.id)) return m;
        const nextType: BarlineType = m.barlineType === 'double' ? 'single' : 'double';
        return {
          ...m,
          barlineType: nextType,
        };
      });
      const updated = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      showToast(`Double barline toggled for ${ids.length} Bar${ids.length > 1 ? 's' : ''}`);
      return updated;
    });
  }, [selection, pushScoreState, showToast]);

  const handleMeasureWidthChange = useCallback((measureId: string, newWidth: number) => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) =>
        m.id === measureId ? { ...m, customWidth: newWidth } : m
      );
      return {
        ...prev,
        layoutSettings: { ...prev.layoutSettings, layoutMode: 'manual' },
        measures: updatedMeasures,
      };
    });
  }, []);

  const handleResetLayout = useCallback(() => {
    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) => ({
        ...m,
        customWidth: undefined,
        systemBreak: false,
        pageBreak: false,
      }));
      const updated: Score = {
        ...prev,
        layoutSettings: {
          ...prev.layoutSettings,
          layoutMode: 'auto',
        },
        measures: updatedMeasures,
      };
      pushScoreState(updated);
      return updated;
    });
  }, [pushScoreState]);

  // Insert Note Event
  const handleInsertNote = useCallback((
    targetMeasureId: string,
    targetStaff: 'RH' | 'LH',
    pitch: Pitch
  ) => {
    // Play pitch for auditory feedback
    audioEngine.playPitch(pitch, score.metadata.initialKeySignature, 0.5);

    setScore((prev) => {
      const updatedMeasures = prev.measures.map((m) => {
        if (m.id !== targetMeasureId) return m;
        const list = targetStaff === 'RH' ? [...m.rhEvents] : [...m.lhEvents];

        // If the only event is a single placeholder rest, replace it
        if (list.length === 1 && list[0].type === 'rest' && list[0].duration === 'whole') {
          list.length = 0;
        }

        const newEvent: NoteEvent = {
          id: `ev_${Date.now()}_${Math.random()}`,
          type: 'note',
          pitches: [pitch],
          duration: selectedDuration,
          isDotted,
          hand: targetStaff,
        };

        list.push(newEvent);

        return {
          ...m,
          rhEvents: targetStaff === 'RH' ? list : m.rhEvents,
          lhEvents: targetStaff === 'LH' ? list : m.lhEvents,
        };
      });

      const updated: Score = { ...prev, measures: updatedMeasures };
      pushScoreState(updated);
      return updated;
    });
  }, [selectedDuration, isDotted, score.metadata.initialKeySignature, pushScoreState]);

  // Change Beat Value (Notes per beat) from active beat forward
  const handleChangeBeatValue = useCallback((newValue: number) => {
    try {
      const currentMeasureId = selection.measureId || score.measures[0]?.id;
      const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
      const targetMeasure = score.measures[measureIdx];
      if (!targetMeasure) return;
      const currentBeatIndex = selection.beatIndex !== undefined ? selection.beatIndex : 0;

      // Respect Pickup Beat restrictions
      const pickup = score.metadata.pickupBeat || 1;
      if (isBeatLockedByPickup(targetMeasure.measureNumber, currentBeatIndex, pickup)) {
        showToast(`Beat ${currentBeatIndex + 1} is locked by Pickup Beat ${pickup}`);
        return;
      }

      const safeVal = Math.max(1, Math.min(4, newValue));
      const nextBeatValues = {
        ...(targetMeasure.beatValues || {}),
        [currentBeatIndex]: safeVal,
      };

      const curBeatNotes = [...(targetMeasure.beatNotes?.[currentBeatIndex] || [])];
      if (safeVal > 1) {
        while (curBeatNotes.length < safeVal) {
          curBeatNotes.push(null as any);
        }
        if (curBeatNotes.length > safeVal) {
          curBeatNotes.length = safeVal;
        }
      } else {
        if (curBeatNotes.length > 1) {
          curBeatNotes.length = 1;
        }
      }

      const updatedMeasure: Measure = {
        ...targetMeasure,
        beatValues: nextBeatValues,
        beatNotes: {
          ...(targetMeasure.beatNotes || {}),
          [currentBeatIndex]: curBeatNotes,
        },
      };

      const syncedMeasure = syncMeasureEventsFromBeatData(
        updatedMeasure,
        score.metadata.initialTimeSignature,
        score.metadata.handTemplate || 'Both'
      );

      const updatedMeasures = score.measures.map((m, i) => (i === measureIdx ? syncedMeasure : m));
      const updated: Score = { ...score, measures: updatedMeasures };
      pushScoreState(updated);

      // Preserve cursor measure, beat, and safely clamp subdivision
      setSelection((sel) => {
        const currentSub = sel.subBeatIndex || 0;
        const safeSub = Math.min(currentSub, safeVal - 1);
        return {
          ...sel,
          subBeatIndex: Math.max(0, safeSub),
        };
      });

      showToast(`Value ${safeVal}: ${safeVal} note${safeVal > 1 ? 's' : ''} per beat`);
    } catch (err) {
      console.error('Error changing beat value:', err);
    }
  }, [selection, score, pushScoreState, showToast]);

  // Quick Change Bars Per Line (1 to 6)
  const handleChangeBarsPerLine = useCallback((bars: number) => {
    handleUpdateLayout({ barsPerLine: bars, measuresPerSystemAuto: bars, layoutMode: 'auto' });
  }, [handleUpdateLayout]);

  // Insert Note in Pianotastic Custom Notation Format
  const handlePianotasticNoteInput = useCallback((pitch: Pitch) => {
    try {
      const curScore = latestScoreRef.current;
      const curSel = latestSelectionRef.current;
      const currentMeasureId = curSel.measureId || curScore.measures[0]?.id;
      const measureIdx = Math.max(0, curScore.measures.findIndex((m) => m.id === currentMeasureId));
      const currentMeasure = curScore.measures[measureIdx] || curScore.measures[0];
      if (!currentMeasure) return;

      const pickup = curScore.metadata.pickupBeat || 1;
      let curBeat =
        curSel.beatIndex !== undefined
          ? curSel.beatIndex
          : currentMeasure.measureNumber === 1
          ? pickup - 1
          : 0;

      // If locked by pickup beat, advance to first editable beat
      if (isBeatLockedByPickup(currentMeasure.measureNumber, curBeat, pickup)) {
        curBeat = pickup - 1;
      }
      let curSubBeat = curSel.subBeatIndex || 0;

      const effectiveVal = getEffectiveBeatValue(curScore, measureIdx, curBeat);
      if (curSubBeat >= effectiveVal) {
        curSubBeat = 0;
      }

      // Set pitch at subBeatIndex, preserving empty subdivisions (null)
      const curBeatNotes = [...(currentMeasure.beatNotes?.[curBeat] || [])];
      while (curBeatNotes.length < effectiveVal) {
        curBeatNotes.push(null as any);
      }
      if (curBeatNotes.length > effectiveVal) {
        curBeatNotes.length = effectiveVal;
      }
      curBeatNotes[curSubBeat] = pitch;

      const updatedMeasure: Measure = {
        ...currentMeasure,
        beatNotes: {
          ...(currentMeasure.beatNotes || {}),
          [curBeat]: curBeatNotes,
        },
      };

      const syncedMeasure = syncMeasureEventsFromBeatData(
        updatedMeasure,
        curScore.metadata.initialTimeSignature,
        curScore.metadata.handTemplate || 'Both'
      );

      // Calculate automatic cursor advancement
      const nextPos = calculateNextCursorPosition(
        curScore,
        currentMeasureId,
        curBeat,
        curSubBeat,
        effectiveVal
      );

      let newMeasures = curScore.measures.map((m) => (m.id === currentMeasureId ? syncedMeasure : m));
      let nextMeasureId = nextPos.nextMeasureId;
      let nextBeatIdx = nextPos.nextBeatIndex;
      let nextSubBeatIdx = nextPos.nextSubBeatIndex;

      if (nextPos.shouldAppendMeasure) {
        const newM: Measure = {
          id: `m_${Date.now()}`,
          measureNumber: newMeasures.length + 1,
          barlineType: 'single',
          chordSymbols: [],
          rhEvents: [],
          lhEvents: [],
          beatNotes: {},
          beatValues: {},
          beatLyrics: {},
        };
        const syncedNewM = syncMeasureEventsFromBeatData(
          newM,
          curScore.metadata.initialTimeSignature,
          curScore.metadata.handTemplate || 'Both'
        );
        newMeasures.push(syncedNewM);
        nextMeasureId = newM.id;
        nextBeatIdx = 0;
        nextSubBeatIdx = 0;
      }

      const updatedScore: Score = {
        ...curScore,
        measures: newMeasures,
      };

      const newSel = {
        measureId: nextMeasureId,
        staff: (activeHand === 'LH' ? 'LH' : 'RH') as 'LH' | 'RH',
        eventId: null,
        beatIndex: nextBeatIdx,
        subBeatIndex: nextSubBeatIdx,
      };

      // Keep refs fresh immediately so fast sequential MIDI notes don't collide
      latestScoreRef.current = updatedScore;
      latestSelectionRef.current = newSel;

      pushScoreState(updatedScore);
      setSelection(newSel);

      // Sound feedback with audio safety guard
      try {
        audioEngine.playPitch(pitch, curScore.metadata.initialKeySignature, 0.65);
      } catch (audioErr) {
        console.warn('Audio playback error:', audioErr);
      }
    } catch (err) {
      console.error('Note input error:', err);
    }
  }, [activeHand, pushScoreState]);

  const handlePianotasticNoteInputRef = useRef(handlePianotasticNoteInput);
  useEffect(() => {
    handlePianotasticNoteInputRef.current = handlePianotasticNoteInput;
  });

  // Advance subdivision without entering a note (creates intentional empty slot '.')
  const handleAdvanceSubdivisionWithoutNote = useCallback(() => {
    try {
      const currentMeasureId = selection.measureId || score.measures[0]?.id;
      const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
      const currentMeasure = score.measures[measureIdx] || score.measures[0];
      if (!currentMeasure) return;

      const pickup = score.metadata.pickupBeat || 1;
      let curBeat =
        selection.beatIndex !== undefined
          ? selection.beatIndex
          : currentMeasure.measureNumber === 1
          ? pickup - 1
          : 0;

      if (isBeatLockedByPickup(currentMeasure.measureNumber, curBeat, pickup)) {
        curBeat = pickup - 1;
      }
      let curSubBeat = selection.subBeatIndex || 0;
      const effectiveVal = getEffectiveBeatValue(score, measureIdx, curBeat);
      if (curSubBeat >= effectiveVal) {
        curSubBeat = 0;
      }

      // Ensure slot at curSubBeat is explicitly null (empty subdivision '.')
      const curBeatNotes = [...(currentMeasure.beatNotes?.[curBeat] || [])];
      while (curBeatNotes.length < effectiveVal) {
        curBeatNotes.push(null as any);
      }
      if (curBeatNotes.length > effectiveVal) {
        curBeatNotes.length = effectiveVal;
      }
      curBeatNotes[curSubBeat] = null as any;

      const updatedMeasure: Measure = {
        ...currentMeasure,
        beatNotes: {
          ...(currentMeasure.beatNotes || {}),
          [curBeat]: curBeatNotes,
        },
      };

      const syncedMeasure = syncMeasureEventsFromBeatData(
        updatedMeasure,
        score.metadata.initialTimeSignature,
        score.metadata.handTemplate || 'Both'
      );

      const nextPos = calculateNextCursorPosition(
        score,
        currentMeasureId,
        curBeat,
        curSubBeat,
        effectiveVal
      );

      let newMeasures = score.measures.map((m) => (m.id === currentMeasureId ? syncedMeasure : m));
      let nextMeasureId = nextPos.nextMeasureId;
      let nextBeatIdx = nextPos.nextBeatIndex;
      let nextSubBeatIdx = nextPos.nextSubBeatIndex;

      if (nextPos.shouldAppendMeasure) {
        const newM: Measure = {
          id: `m_${Date.now()}`,
          measureNumber: newMeasures.length + 1,
          barlineType: 'single',
          chordSymbols: [],
          rhEvents: [],
          lhEvents: [],
          beatNotes: {},
          beatValues: {},
          beatLyrics: {},
        };
        const syncedNewM = syncMeasureEventsFromBeatData(
          newM,
          score.metadata.initialTimeSignature,
          score.metadata.handTemplate || 'Both'
        );
        newMeasures.push(syncedNewM);
        nextMeasureId = newM.id;
        nextBeatIdx = 0;
        nextSubBeatIdx = 0;
      }

      const updatedScore: Score = {
        ...score,
        measures: newMeasures,
      };

      pushScoreState(updatedScore);
      setSelection({
        measureId: nextMeasureId,
        staff: activeHand === 'LH' ? 'LH' : 'RH',
        eventId: null,
        beatIndex: nextBeatIdx,
        subBeatIndex: nextSubBeatIdx,
      });
    } catch (err) {
      console.error('Error advancing subdivision:', err);
    }
  }, [selection, score, activeHand, pushScoreState]);

  // Clear notes in active beat or subdivision, leaving '.' or '—'
  const handleClearCurrentBeat = useCallback(() => {
    try {
      const currentMeasureId = selection.measureId || score.measures[0]?.id;
      const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
      const currentMeasure = score.measures[measureIdx];
      if (!currentMeasure) return;

      const curBeat = selection.beatIndex !== undefined ? selection.beatIndex : 0;
      const pickup = score.metadata.pickupBeat || 1;
      if (isBeatLockedByPickup(currentMeasure.measureNumber, curBeat, pickup)) return;

      const curSubBeat = selection.subBeatIndex || 0;
      const effectiveVal = getEffectiveBeatValue(score, measureIdx, curBeat);
      const curBeatNotes = currentMeasure.beatNotes?.[curBeat] || [];

      // If subdivision has a note in a multi-note beat, clear just that subdivision to '.'
      if (effectiveVal > 1 && curBeatNotes.length > 0 && curBeatNotes[curSubBeat] && curBeatNotes[curSubBeat]?.step) {
        const nextNotes = { ...(currentMeasure.beatNotes || {}) };
        const updatedSlotNotes = [...(nextNotes[curBeat] || [])];
        while (updatedSlotNotes.length < effectiveVal) {
          updatedSlotNotes.push(null as any);
        }
        if (updatedSlotNotes.length > effectiveVal) {
          updatedSlotNotes.length = effectiveVal;
        }
        updatedSlotNotes[curSubBeat] = null as any;
        nextNotes[curBeat] = updatedSlotNotes;

        const updatedM: Measure = {
          ...currentMeasure,
          beatNotes: nextNotes,
        };
        const syncedM = syncMeasureEventsFromBeatData(
          updatedM,
          score.metadata.initialTimeSignature,
          score.metadata.handTemplate || 'Both'
        );

        const updatedMeasures = score.measures.map((m, i) => (i === measureIdx ? syncedM : m));
        const updated: Score = { ...score, measures: updatedMeasures };
        pushScoreState(updated);
        return;
      }

      if (effectiveVal === 1 && curBeatNotes.length > 0) {
        // Clear notes for this beat -> renders '—'
        const nextNotes = { ...(currentMeasure.beatNotes || {}) };
        delete nextNotes[curBeat];

        const updatedM: Measure = {
          ...currentMeasure,
          beatNotes: nextNotes,
        };
        const syncedM = syncMeasureEventsFromBeatData(
          updatedM,
          score.metadata.initialTimeSignature,
          score.metadata.handTemplate || 'Both'
        );

        const updatedMeasures = score.measures.map((m, i) => (i === measureIdx ? syncedM : m));
        const updated: Score = { ...score, measures: updatedMeasures };
        pushScoreState(updated);
      } else {
        // Slot/beat is already empty; step back to previous editable subdivision / beat
        if (curSubBeat > 0) {
          setSelection((sel) => ({ ...sel, subBeatIndex: curSubBeat - 1 }));
        } else if (curBeat > 0) {
          if (!isBeatLockedByPickup(currentMeasure.measureNumber, curBeat - 1, pickup)) {
            const prevBeatVal = getEffectiveBeatValue(score, measureIdx, curBeat - 1);
            setSelection((sel) => ({
              ...sel,
              beatIndex: curBeat - 1,
              subBeatIndex: Math.max(0, prevBeatVal - 1),
            }));
          }
        } else if (measureIdx > 0) {
          const prevM = score.measures[measureIdx - 1];
          const prevTotal = getMeasureTotalBeats(
            prevM,
            score.metadata.initialTimeSignature,
            score.metadata.indianTaal
          );
          const prevBeatVal = getEffectiveBeatValue(score, measureIdx - 1, prevTotal - 1);
          setSelection({
            measureId: prevM.id,
            staff: activeHand === 'LH' ? 'LH' : 'RH',
            eventId: null,
            beatIndex: prevTotal - 1,
            subBeatIndex: Math.max(0, prevBeatVal - 1),
          });
        }
      }
    } catch (err) {
      console.error('Error clearing beat:', err);
    }
  }, [selection, score, activeHand, pushScoreState]);

  // Update Beat Lyric
  const handleUpdateBeatLyric = useCallback(
    (measureId: string, beatIndex: number, text: string, subBeatIndex?: number) => {
      setScore((prev) => {
        const updatedMeasures = prev.measures.map((m) => {
          if (m.id !== measureId) return m;
          const nextLyrics = { ...(m.beatLyrics || {}) };
          const key =
            subBeatIndex !== undefined && subBeatIndex > 0
              ? `${beatIndex}_${subBeatIndex}`
              : beatIndex;
          if (text && text.trim()) {
            nextLyrics[key] = text.trim();
          } else {
            delete nextLyrics[key];
          }
          const updatedM = { ...m, beatLyrics: nextLyrics };
          return syncMeasureEventsFromBeatData(
            updatedM,
            prev.metadata.initialTimeSignature,
            prev.metadata.handTemplate || 'Both'
          );
        });
        const updated = { ...prev, measures: updatedMeasures };
        pushScoreState(updated);
        return updated;
      });
    },
    [pushScoreState]
  );

  // Update Beat Chord Symbol (attached directly and strictly to this beat)
  const handleUpdateBeatChord = useCallback(
    (measureId: string, beatIndex: number, chord: string) => {
      setScore((prev) => {
        const updatedMeasures = prev.measures.map((m) => {
          if (m.id !== measureId) return m;
          const nextChords = { ...(m.beatChords || {}) };
          let nextChordSymbols = [...(m.chordSymbols || [])];

          if (chord && chord.trim()) {
            nextChords[beatIndex] = chord.trim();
            // Sync with chordSymbols
            nextChordSymbols = nextChordSymbols.filter((c) => Math.floor(c.beatOffset) !== beatIndex);
            nextChordSymbols.push({
              id: `cs_${Date.now()}_${beatIndex}`,
              beatOffset: beatIndex,
              root: chord.trim(),
              quality: '',
              formatted: chord.trim(),
            });
          } else {
            delete nextChords[beatIndex];
            // CRITICAL FIX: Ensure matching chordSymbols entry is completely purged as well
            nextChordSymbols = nextChordSymbols.filter((c) => Math.floor(c.beatOffset) !== beatIndex);
          }

          const updatedM: Measure = {
            ...m,
            beatChords: nextChords,
            chordSymbols: nextChordSymbols,
          };
          return syncMeasureEventsFromBeatData(
            updatedM,
            prev.metadata.initialTimeSignature,
            prev.metadata.handTemplate || 'Both'
          );
        });
        const updated = { ...prev, measures: updatedMeasures };
        pushScoreState(updated);
        return updated;
      });
    },
    [pushScoreState]
  );

  // Toggle Beat Symbol (such as ⌣ curved symbol, staccato, accent, etc.)
  const handleToggleBeatSymbol = useCallback(
    (measureId: string, beatIndex: number, symbol: string) => {
      setScore((prev) => {
        const updatedMeasures = prev.measures.map((m) => {
          if (m.id !== measureId) return m;
          const curSymbols = [...(m.beatSymbols?.[beatIndex] || [])];
          let nextSymbols: string[];
          if (curSymbols.includes(symbol)) {
            nextSymbols = curSymbols.filter((s) => s !== symbol);
          } else {
            nextSymbols = [...curSymbols, symbol];
          }
          const nextBeatSymbols = { ...(m.beatSymbols || {}) };
          if (nextSymbols.length > 0) {
            nextBeatSymbols[beatIndex] = nextSymbols;
          } else {
            delete nextBeatSymbols[beatIndex];
          }
          const updatedM: Measure = { ...m, beatSymbols: nextBeatSymbols };
          return syncMeasureEventsFromBeatData(
            updatedM,
            prev.metadata.initialTimeSignature,
            prev.metadata.handTemplate || 'Both'
          );
        });
        const updated = { ...prev, measures: updatedMeasures };
        pushScoreState(updated);
        return updated;
      });
    },
    [pushScoreState]
  );

  // Toggle Manual Line Break after current or specified measure (does not mutate global barsPerLine)
  const handleToggleLineBreak = useCallback(
    (targetMeasureId?: string) => {
      const mId = targetMeasureId || selection.measureId || score.measures[0]?.id;
      if (!mId) return;
      const mIdx = score.measures.findIndex((m) => m.id === mId);
      if (mIdx < 0) return;

      // If targetMeasureId is passed explicitly from clicking a measure's badge, toggle that measure directly.
      // When pressing Enter while selecting a measure (e.g. Bar 3), break after Bar 2 so Bar 3 wraps to next line.
      const breakTargetIdx = targetMeasureId ? mIdx : (mIdx > 0 ? mIdx - 1 : 0);
      const targetM = score.measures[breakTargetIdx];
      const newBreak = !targetM.systemBreak;

      const updatedMeasures = score.measures.map((m, idx) =>
        idx === breakTargetIdx ? { ...m, systemBreak: newBreak } : m
      );
      const updated: Score = {
        ...score,
        measures: updatedMeasures,
      };
      pushScoreState(updated);

      showToast(
        newBreak
          ? `Line break added after Bar ${breakTargetIdx + 1} ↵ (measures wrapped to next line)`
          : `Line break removed from Bar ${breakTargetIdx + 1}`
      );
    },
    [selection.measureId, score, pushScoreState, showToast]
  );

  // Text Annotation Handlers (Page-level, Unlimited, Independent)
  const handleDeleteTextAnnotation = useCallback(
    (textId: string) => {
      setScore((prev) => {
        const remaining = (prev.textObjects || prev.textAnnotations || []).filter((t) => t.id !== textId);
        const updatedScore: Score = {
          ...prev,
          textObjects: remaining,
          textAnnotations: remaining,
        };
        pushScoreState(updatedScore);
        return updatedScore;
      });
      setSelection((sel) => ({
        ...sel,
        textAnnotationId: undefined,
        selectionType: sel.textAnnotationId === textId || sel.eventId === textId ? 'beat' : sel.selectionType,
        eventId: sel.eventId === textId ? null : sel.eventId,
      }));
      showToast('Text deleted');
    },
    [pushScoreState, showToast]
  );

  const handleSaveTextAnnotation = useCallback(
    (annotationData: Partial<ScoreTextAnnotation>) => {
      let targetId = annotationData.id;
      setScore((prev) => {
        const existing = prev.textObjects || prev.textAnnotations || [];
        targetId = targetId || `text_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const isEditing = existing.some((t) => t.id === targetId);

        const pageIndex = annotationData.pageIndex !== undefined
          ? annotationData.pageIndex
          : (existing.find((t) => t.id === targetId)?.pageIndex ?? 0);
        const x = annotationData.x !== undefined
          ? annotationData.x
          : (existing.find((t) => t.id === targetId)?.x ?? 120);
        const y = annotationData.y !== undefined
          ? annotationData.y
          : (existing.find((t) => t.id === targetId)?.y ?? 120);

        let updated: ScoreTextAnnotation[];
        if (isEditing) {
          updated = existing.map((t) => {
            if (t.id !== targetId) return t;
            return {
              ...t,
              ...annotationData,
              id: targetId,
              type: 'text',
              text: annotationData.text !== undefined ? annotationData.text : t.text,
              content: annotationData.text !== undefined ? annotationData.text : (annotationData.content || t.text),
              pageIndex,
              x,
              y,
            } as ScoreTextAnnotation;
          });
        } else {
          const newAnnotation: ScoreTextAnnotation = {
            id: targetId,
            type: 'text',
            text: annotationData.text || annotationData.content || '',
            content: annotationData.text || annotationData.content || '',
            pageIndex,
            x,
            y,
            fontSize: annotationData.fontSize ?? 14,
            fontWeight: annotationData.fontWeight ?? 'normal',
            fontStyle: annotationData.fontStyle ?? 'normal',
            textDecoration: annotationData.textDecoration ?? 'none',
            textAlign: annotationData.textAlign ?? 'left',
            color: annotationData.color ?? '#0f172a',
            width: annotationData.width,
            height: annotationData.height,
            rotation: annotationData.rotation ?? 0,
          };
          updated = [...existing, newAnnotation];
        }

        const updatedScore: Score = {
          ...prev,
          textObjects: updated,
          textAnnotations: updated,
        };
        pushScoreState(updatedScore);
        return updatedScore;
      });

      if (targetId) {
        setSelection((sel) => ({
          ...sel,
          textAnnotationId: targetId,
          selectionType: 'text',
          eventId: targetId,
        }));
      }

      setTextModalConfig(null);
      showToast(annotationData.id ? 'Text updated' : 'Text added to page');
    },
    [pushScoreState, showToast]
  );

  const handleUpdateTextAnnotation = useCallback(
    (textId: string, patch: Partial<ScoreTextAnnotation>) => {
      setScore((prev) => {
        const existing = prev.textObjects || prev.textAnnotations || [];
        const updated = existing.map((t) =>
          t.id === textId ? { ...t, ...patch } : t
        );
        const updatedScore: Score = {
          ...prev,
          textObjects: updated,
          textAnnotations: updated,
        };
        pushScoreState(updatedScore);
        return updatedScore;
      });
    },
    [pushScoreState]
  );

  const handleMoveTextAnnotation = useCallback((textId: string, x: number, y: number) => {
    setScore((prev) => {
      const existing = prev.textObjects || prev.textAnnotations || [];
      const updated = existing.map((t) =>
        t.id === textId ? { ...t, x, y } : t
      );
      return {
        ...prev,
        textObjects: updated,
        textAnnotations: updated,
      };
    });
  }, []);

  const handleCommitMoveTextAnnotation = useCallback(
    (textId: string, x: number, y: number) => {
      setScore((prev) => {
        const existing = prev.textObjects || prev.textAnnotations || [];
        const updated = existing.map((t) =>
          t.id === textId ? { ...t, x, y } : t
        );
        const updatedScore: Score = {
          ...prev,
          textObjects: updated,
          textAnnotations: updated,
        };
        pushScoreState(updatedScore);
        return updatedScore;
      });
    },
    [pushScoreState]
  );

  const handleSelectTextAnnotation = useCallback(
    (textId: string) => {
      setSelection((prev) => ({
        ...prev,
        textAnnotationId: textId,
        selectionType: 'text',
        eventId: textId,
      }));
    },
    []
  );

  const handleEditTextAnnotation = useCallback(
    (textAnnotation: ScoreTextAnnotation) => {
      setTextModalConfig({
        isOpen: true,
        initialData: textAnnotation,
        pageIndex: textAnnotation.pageIndex ?? 0,
        x: textAnnotation.x ?? 120,
        y: textAnnotation.y ?? 120,
      });
    },
    []
  );

  const handleOpenAddTextModal = useCallback(
    (targetOrMeasureId?: any, beatIndex?: number, placement?: 'above' | 'below') => {
      if (typeof targetOrMeasureId === 'object' && targetOrMeasureId !== null) {
        setTextModalConfig({
          isOpen: true,
          initialData: {
            pageIndex: targetOrMeasureId.pageIndex ?? 0,
            x: targetOrMeasureId.x ?? 120,
            y: targetOrMeasureId.y ?? 120,
          },
          pageIndex: targetOrMeasureId.pageIndex ?? 0,
          x: targetOrMeasureId.x ?? 120,
          y: targetOrMeasureId.y ?? 120,
        });
        return;
      }

      setTextModalConfig({
        isOpen: true,
        initialData: {
          pageIndex: 0,
          x: 120,
          y: 120,
          measureId: typeof targetOrMeasureId === 'string' ? targetOrMeasureId : undefined,
          beatIndex,
          placement: placement || 'above',
        },
        pageIndex: 0,
        x: 120,
        y: 120,
      });
    },
    []
  );

  // Delete Selected Event (volta, chord, lyric, text annotation, or note/beat)
  const handleDeleteSelected = useCallback(() => {
    if (selection.selectionType === 'measures' || (selection.selectedMeasureIds && selection.selectedMeasureIds.length > 1)) {
      if (selection.selectedMeasureIds && selection.selectedMeasureIds.length > 0) {
        handleDeleteMeasure(selection.selectedMeasureIds[0]);
        return;
      }
    }
    if (selection.selectionType === 'volta' && selection.voltaId) {
      handleDeleteVolta(selection.voltaId);
      return;
    }
    if (selection.textAnnotationId || selection.selectionType === 'text') {
      const textId = selection.textAnnotationId || (selection.eventId as string);
      if (textId) {
        handleDeleteTextAnnotation(textId);
        return;
      }
    }
    if (selection.selectionType === 'chord') {
      if (selection.measureId && selection.beatIndex !== undefined) {
        handleUpdateBeatChord(selection.measureId, selection.beatIndex, '');
        showToast(`Chord on Beat ${selection.beatIndex + 1} deleted`);
      }
      return;
    }
    if (selection.selectionType === 'lyrics') {
      if (selection.measureId && selection.beatIndex !== undefined) {
        handleUpdateBeatLyric(selection.measureId, selection.beatIndex, '', selection.subBeatIndex);
        showToast(`Lyric on Beat ${selection.beatIndex + 1} cleared`);
      }
      return;
    }
    handleClearCurrentBeat();
  }, [
    selection,
    handleDeleteMeasure,
    handleDeleteVolta,
    handleDeleteTextAnnotation,
    handleUpdateBeatChord,
    handleUpdateBeatLyric,
    handleClearCurrentBeat,
    showToast,
  ]);

  // Transpose Selected Note Up / Down (supports Pianotastic subdivision notes and standard events)
  const handleTransposeSelected = useCallback((stepDelta: number) => {
    try {
      if (selection.selectedMeasureIds && selection.selectedMeasureIds.length > 1) {
        const updatedMeasures = score.measures.map((m) => {
          if (!selection.selectedMeasureIds!.includes(m.id)) return m;
          const nextBeatNotes = { ...(m.beatNotes || {}) };
          Object.keys(nextBeatNotes).forEach((k) => {
            const notes = nextBeatNotes[Number(k)] || [];
            nextBeatNotes[Number(k)] = notes.map((p) => {
              if (!p || !p.step) return p;
              const curStepVal = getDiatonicStepValue(p);
              const nextStepVal = curStepVal + stepDelta;
              const nextPitch = pitchFromDiatonicStepValue(nextStepVal);
              return {
                step: nextPitch.step,
                octave: nextPitch.octave,
                accidental: p.accidental,
              };
            });
          });
          const updatedM: Measure = { ...m, beatNotes: nextBeatNotes };
          return syncMeasureEventsFromBeatData(
            updatedM,
            score.metadata.initialTimeSignature,
            score.metadata.handTemplate || 'Both'
          );
        });
        const updated: Score = { ...score, measures: updatedMeasures };
        pushScoreState(updated);
        showToast(`Transposed ${selection.selectedMeasureIds.length} Bars by ${stepDelta > 0 ? '+' : ''}${stepDelta}`);
        return;
      }

      const currentMeasureId = selection.measureId || score.measures[0]?.id;
      const measureIdx = Math.max(0, score.measures.findIndex((m) => m.id === currentMeasureId));
      const currentMeasure = score.measures[measureIdx];
      if (!currentMeasure) return;

      const curBeat = selection.beatIndex !== undefined ? selection.beatIndex : 0;
      const curSubBeat = selection.subBeatIndex || 0;
      const curBeatNotes = currentMeasure.beatNotes?.[curBeat] || [];

      if (curBeatNotes[curSubBeat] && curBeatNotes[curSubBeat]?.step) {
        // Transpose the active Pianotastic subdivision note!
        const curPitch = curBeatNotes[curSubBeat];
        const curStepVal = getDiatonicStepValue(curPitch);
        const nextStepVal = curStepVal + stepDelta;
        const nextPitch = pitchFromDiatonicStepValue(nextStepVal);
        const updatedPitch: Pitch = {
          step: nextPitch.step,
          octave: nextPitch.octave,
          accidental: curPitch.accidental,
        };

        const nextNotes = { ...(currentMeasure.beatNotes || {}) };
        const updatedSlotNotes = [...curBeatNotes];
        updatedSlotNotes[curSubBeat] = updatedPitch;
        nextNotes[curBeat] = updatedSlotNotes;

        const updatedM: Measure = {
          ...currentMeasure,
          beatNotes: nextNotes,
        };
        const syncedM = syncMeasureEventsFromBeatData(
          updatedM,
          score.metadata.initialTimeSignature,
          score.metadata.handTemplate || 'Both'
        );

        const updatedMeasures = score.measures.map((m, i) => (i === measureIdx ? syncedM : m));
        const updated: Score = { ...score, measures: updatedMeasures };
        pushScoreState(updated);
        try {
          audioEngine.playPitch(updatedPitch, score.metadata.initialKeySignature, 0.4);
        } catch (audioErr) {
          console.warn('Audio pitch error:', audioErr);
        }
        return;
      }

      // Fallback for grand staff note event
      if (!selection.eventId) return;
      const updatedMeasures = score.measures.map((m) => {
        if (m.id !== currentMeasureId) return m;
        const list = selection.staff === 'RH' ? m.rhEvents : m.lhEvents;
        const updatedList = list.map((ev) => {
          if (ev.id !== selection.eventId || ev.type !== 'note') return ev;
          const updatedPitches = ev.pitches.map((p) => {
            const curStepVal = getDiatonicStepValue(p);
            const nextStepVal = curStepVal + stepDelta;
            const nextPitch = pitchFromDiatonicStepValue(nextStepVal);
            return {
              step: nextPitch.step,
              octave: nextPitch.octave,
              accidental: p.accidental,
            };
          });
          if (updatedPitches[0]) {
            try {
              audioEngine.playPitch(updatedPitches[0], score.metadata.initialKeySignature, 0.4);
            } catch (err) {
              console.warn('Audio pitch error:', err);
            }
          }
          return { ...ev, pitches: updatedPitches };
        });
        return {
          ...m,
          rhEvents: selection.staff === 'RH' ? updatedList : m.rhEvents,
          lhEvents: selection.staff === 'LH' ? updatedList : m.lhEvents,
        };
      });
      const updated: Score = { ...score, measures: updatedMeasures };
      pushScoreState(updated);
    } catch (err) {
      console.error('Error in handleTransposeSelected:', err);
    }
  }, [selection, score, pushScoreState]);

  // Shortcut Handlers: Note Entry, Space Tool, and Navigation
  const handleInsertNoteFromShortcut = useCallback(
    (step: NoteStep) => {
      const octave = activeHand === 'LH' ? 3 : 4;
      const pitch: Pitch = {
        step,
        octave,
        accidental: selectedAccidental,
      };
      handlePianotasticNoteInput(pitch);
    },
    [activeHand, selectedAccidental, handlePianotasticNoteInput]
  );

  const handleAddChordSymbolShortcut = useCallback(() => {
    if (!latestSelectionRef.current.measureId && latestScoreRef.current.measures[0]) {
      setSelection((sel) => ({
        ...sel,
        measureId: latestScoreRef.current.measures[0].id,
        beatIndex: sel.beatIndex !== undefined ? sel.beatIndex : 0,
      }));
    }
    setIsChordDialogOpen(true);
  }, []);

  const handleInsertVerticalSpaceShortcut = useCallback(() => {
    const curScore = latestScoreRef.current;
    const curSel = latestSelectionRef.current;
    const currentMeasureId = curSel.measureId || curScore.measures[0]?.id;
    if (!currentMeasureId) return;
    handleAddSpace(currentMeasureId, 30);
    setToolMode('space');
  }, [handleAddSpace]);

  const handleIncreaseSelectedSpaceShortcut = useCallback(() => {
    const curScore = latestScoreRef.current;
    const curSel = latestSelectionRef.current;
    const existingSpaces = curScore.spacingObjects || [];

    let targetSpace = existingSpaces.find((s) => s.id === curSel.spacingObjectId);
    if (!targetSpace && curSel.measureId) {
      targetSpace = existingSpaces.find((s) => s.afterMeasureId === curSel.measureId);
    }

    if (targetSpace) {
      const newAmount = Math.min(300, (targetSpace.amount || 0) + 10);
      handleUpdateSpace(targetSpace.id, { amount: newAmount });
      showToast(`Increased vertical space (${newAmount}px)`);
    } else {
      const targetMeasureId = curSel.measureId || curScore.measures[0]?.id;
      if (targetMeasureId) {
        handleAddSpace(targetMeasureId, 30);
      }
    }
  }, [handleUpdateSpace, handleAddSpace, showToast]);

  const handleDecreaseSelectedSpaceShortcut = useCallback(() => {
    const curScore = latestScoreRef.current;
    const curSel = latestSelectionRef.current;
    const existingSpaces = curScore.spacingObjects || [];

    let targetSpace = existingSpaces.find((s) => s.id === curSel.spacingObjectId);
    if (!targetSpace && curSel.measureId) {
      targetSpace = existingSpaces.find((s) => s.afterMeasureId === curSel.measureId);
    }

    if (targetSpace) {
      const newAmount = Math.max(5, (targetSpace.amount || 0) - 10);
      handleUpdateSpace(targetSpace.id, { amount: newAmount });
      showToast(`Decreased vertical space (${newAmount}px)`);
    }
  }, [handleUpdateSpace, showToast]);

  const handleNavigateHorizontal = useCallback((direction: 'left' | 'right') => {
    const curScore = latestScoreRef.current;
    const curSel = latestSelectionRef.current;
    const currentMeasureId = curSel.measureId || curScore.measures[0]?.id;
    const measureIdx = Math.max(0, curScore.measures.findIndex((m) => m.id === currentMeasureId));
    const curMeasure = curScore.measures[measureIdx];
    if (!curMeasure) return;

    const curBeat = curSel.beatIndex !== undefined ? curSel.beatIndex : 0;
    const curSub = curSel.subBeatIndex || 0;
    const pickup = curScore.metadata.pickupBeat || 1;

    if (direction === 'left') {
      if (curSub > 0) {
        setSelection((sel) => ({ ...sel, subBeatIndex: curSub - 1 }));
      } else if (curBeat > 0) {
        if (!isBeatLockedByPickup(curMeasure.measureNumber, curBeat - 1, pickup)) {
          const prevBeatVal = getEffectiveBeatValue(curScore, measureIdx, curBeat - 1);
          setSelection((sel) => ({
            ...sel,
            beatIndex: curBeat - 1,
            subBeatIndex: Math.max(0, prevBeatVal - 1),
          }));
        }
      } else if (measureIdx > 0) {
        const prevM = curScore.measures[measureIdx - 1];
        const prevTotal = getMeasureTotalBeats(
          prevM,
          curScore.metadata.initialTimeSignature,
          curScore.metadata.indianTaal
        );
        const prevBeatVal = getEffectiveBeatValue(curScore, measureIdx - 1, prevTotal - 1);
        setSelection({
          measureId: prevM.id,
          staff: activeHand === 'LH' ? 'LH' : 'RH',
          eventId: null,
          beatIndex: prevTotal - 1,
          subBeatIndex: Math.max(0, prevBeatVal - 1),
        });
      }
    } else {
      const totalBeats = getMeasureTotalBeats(
        curMeasure,
        curScore.metadata.initialTimeSignature,
        curScore.metadata.indianTaal
      );
      const effVal = getEffectiveBeatValue(curScore, measureIdx, curBeat);

      if (curSub + 1 < effVal) {
        setSelection((sel) => ({ ...sel, subBeatIndex: curSub + 1 }));
      } else if (curBeat < totalBeats - 1) {
        setSelection((sel) => ({ ...sel, beatIndex: curBeat + 1, subBeatIndex: 0 }));
      } else if (measureIdx < curScore.measures.length - 1) {
        const nextM = curScore.measures[measureIdx + 1];
        setSelection({
          measureId: nextM.id,
          staff: activeHand === 'LH' ? 'LH' : 'RH',
          eventId: null,
          beatIndex: 0,
          subBeatIndex: 0,
        });
      }
    }
  }, [activeHand]);

  const handleTogglePlayPauseShortcut = useCallback(() => {
    if (audioEngine.getIsPlaying()) {
      audioEngine.pausePlayback();
    } else {
      const curScore = latestScoreRef.current;
      const curSel = latestSelectionRef.current;
      let mIdx = 0;
      let bIdx = 0;
      let subIdx = 0;
      if (curSel?.measureId) {
        const found = curScore.measures.findIndex((m) => m.id === curSel.measureId);
        if (found !== -1) {
          mIdx = found;
          bIdx = curSel.beatIndex !== undefined ? curSel.beatIndex : 0;
          subIdx = curSel.subBeatIndex !== undefined ? curSel.subBeatIndex : 0;
        }
      } else if (playbackPosition) {
        mIdx = playbackPosition.measureIndex;
        bIdx = Math.floor(playbackPosition.beat);
      }
      audioEngine.playScore(curScore, mIdx, bIdx, subIdx);
    }
  }, [playbackPosition]);

  const isAnyModalOpen = useCallback(() => {
    return (
      isNewScoreModalOpen ||
      isSaveAsModalOpen ||
      isSaveProjectModalOpen ||
      isLibraryModalOpen ||
      isSongPropertiesModalOpen ||
      isCustomTimeSigOpen ||
      isChordDialogOpen ||
      isShortcutsOpen ||
      isAddMeasuresModalOpen ||
      isMidiModalOpen ||
      isAuthModalOpen ||
      Boolean(textModalConfig?.isOpen) ||
      Boolean(unsavedModalConfig?.isOpen)
    );
  }, [
    isNewScoreModalOpen,
    isSaveAsModalOpen,
    isSaveProjectModalOpen,
    isLibraryModalOpen,
    isSongPropertiesModalOpen,
    isCustomTimeSigOpen,
    isChordDialogOpen,
    isShortcutsOpen,
    isAddMeasuresModalOpen,
    isMidiModalOpen,
    isAuthModalOpen,
    textModalConfig,
    unsavedModalConfig,
  ]);

  const handleSetToolModeFromShortcut = useCallback(
    (mode: 'select' | 'note' | 'rest' | 'lyrics' | 'text' | 'space') => {
      setToolMode(mode);
      if (mode === 'space') {
        showToast('Space tool active (↕) — Drag or click between systems to adjust vertical space');
      }
    },
    [showToast]
  );

  // Register Centralized Keyboard Shortcuts
  useEffect(() => {
    const unregister = shortcutManager.registerHandlers({
      isEditorActive: () => latestViewModeRef.current === 'editor',
      isModalOpen: isAnyModalOpen,

      // Note entry: C, A, B, D, E, F, G
      onInsertNote: handleInsertNoteFromShortcut,

      // Chord symbol: Shift + C
      onAddChordSymbol: handleAddChordSymbolShortcut,

      // Values: 1, 2, 3, 4 and F1, F2, F3, F4
      onSetValue: (val) => handleChangeBeatValue(val),

      // Edit: Undo & Redo
      onUndo: handleUndo,
      onRedo: handleRedo,

      // Clipboard: Copy, Paste, Cut
      onCopy: handleCopy,
      onPaste: handlePaste,
      onCut: handleCut,

      // Space Tool: Shift + Enter, Ctrl/Cmd + Shift + Up, Ctrl/Cmd + Shift + Down
      onInsertVerticalSpace: handleInsertVerticalSpaceShortcut,
      onIncreaseSelectedSpace: handleIncreaseSelectedSpaceShortcut,
      onDecreaseSelectedSpace: handleDecreaseSelectedSpaceShortcut,

      // Canonical Notation Workflows
      onDelete: () => {
        const curSel = latestSelectionRef.current;
        if (curSel.textAnnotationId || curSel.selectionType === 'text') {
          const textId = curSel.textAnnotationId || (curSel.eventId as string);
          if (textId) {
            handleDeleteTextAnnotation(textId);
            return;
          }
        }
        handleClearCurrentBeat();
      },
      onAdvanceEmptySubdivision: handleAdvanceSubdivisionWithoutNote,
      onToggleLineBreak: handleToggleLineBreak,
      onNavigateHorizontal: handleNavigateHorizontal,
      onTransposeVertical: handleTransposeSelected,
      onTogglePlayPause: handleTogglePlayPauseShortcut,

      // File & Tool Workflows
      onSave: handleSaveProject,
      onSaveAs: () => setIsSaveAsModalOpen(true),
      onPrint: () => setViewMode('print'),
      onOpenProject: requestOpenProject,
      onNewProject: requestNewProject,
      onOpenSongProperties: () => setIsSongPropertiesModalOpen(true),
      onSetToolMode: handleSetToolModeFromShortcut,
    });

    return () => {
      unregister();
    };
  }, [
    isAnyModalOpen,
    handleInsertNoteFromShortcut,
    handleAddChordSymbolShortcut,
    handleChangeBeatValue,
    handleUndo,
    handleRedo,
    handleCopy,
    handlePaste,
    handleCut,
    handleInsertVerticalSpaceShortcut,
    handleIncreaseSelectedSpaceShortcut,
    handleDecreaseSelectedSpaceShortcut,
    handleDeleteTextAnnotation,
    handleClearCurrentBeat,
    handleAdvanceSubdivisionWithoutNote,
    handleToggleLineBreak,
    handleNavigateHorizontal,
    handleTransposeSelected,
    handleTogglePlayPauseShortcut,
    handleSaveProject,
    requestOpenProject,
    requestNewProject,
    handleSetToolModeFromShortcut,
  ]);


  // Web MIDI note input listener
  useEffect(() => {
    const unsubscribe = midiService.onNote((pitch) => {
      if (latestViewModeRef.current !== 'editor') return;
      if (latestMidiModeRef.current === 'playback') {
        try {
          audioEngine.playPitch(
            pitch,
            latestScoreRef.current.metadata.initialKeySignature,
            0.65
          );
        } catch {
          // ignore
        }
        return;
      }
      handlePianotasticNoteInputRef.current(pitch);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Audio Engine position callback
  useEffect(() => {
    audioEngine.setPositionCallback((measureIndex, beat) => {
      setPlaybackPosition({ measureIndex, beat });
    });
  }, []);

  // 1. Initial Opening Screen: Clean Home/Project screen
  if (viewMode === 'home') {
    return (
      <div className="flex flex-col h-screen w-screen overflow-y-auto bg-[#faf8f5]">
        <HomeScreen
          savedProjects={savedProjects}
          onOpenProject={handleSelectProject}
          onSelectProject={handleSelectProject}
          onOpenNewPageModal={handleOpenNewPageModal}
          onOpenNewPage={handleOpenNewPageModal}
          onDeleteProject={handleDeleteProject}
          onImportFile={handleImportFile}
          currentUser={currentUser}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onSyncCloud={async () => {
            if (!currentUser) return;
            try {
              setIsSyncingCloud(true);
              const cloudProjects = await cloudProjectService.getUserProjects(currentUser.uid);
              setSavedProjects((local) => {
                const map = new Map<string, SavedProject>();
                local.forEach((p) => map.set(p.id, p));
                cloudProjects.forEach((p) => map.set(p.id, p));
                const merged = Array.from(map.values());
                ProjectStorageService.saveProjects(merged);
                return merged;
              });
              showToast('Library synchronized with cloud');
            } catch (err) {
              console.error('Cloud sync error:', err);
              showToast('Cloud sync failed');
            } finally {
              setIsSyncingCloud(false);
            }
          }}
          isSyncing={isSyncingCloud}
        />

        {/* Template Selection Pop-up Modal */}
        <NewScoreSetupModal
          isOpen={isNewScoreModalOpen}
          onClose={handleCloseNewPageModal}
          onCreateScore={handleCreateScore}
        />

        {/* Firebase Cloud Authentication Modal */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          currentUser={currentUser}
          localProjects={savedProjects}
          onMigrateLocalProjects={async (userId) => {
            try {
              const count = await cloudProjectService.migrateLocalProjects(userId, savedProjects);
              showToast(`Synchronized ${count} project(s) to cloud`);
            } catch (err) {
              console.warn('Migration warning:', err);
            }
          }}
        />
      </div>
    );
  }

  // 2. Print Studio Screen (Dedicated view for paper printing and PDF generation)
  if (viewMode === 'print') {
    return (
      <PrintStudio
        score={score}
        onBackToEditor={() => setViewMode('editor')}
        onUpdateScore={setScore}
      />
    );
  }

  // 3. Notation Studio Editor Screen
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-stone-100 font-sans text-stone-900">
      {/* 1. Top Application Header */}
      <Header
        score={score}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        hasClipboardContent={Boolean(clipboardData)}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        cloudSyncStatus={cloudSyncStatus}
        lastSavedAt={lastSavedAt}
        cloudErrorMessage={cloudErrorMessage}
        onRetryCloudSync={() => performCloudSave(score, true)}
        onUpdateMetadata={handleUpdateMetadata}
        onUpdateLayout={handleUpdateLayout}
        onLoadScore={(newScore) => {
          const normalizedScore: Score = {
            ...newScore,
            textAnnotations: (newScore.textAnnotations || []).map((t, i) => {
              const mIdx = newScore.measures.findIndex((m) => m.id === t.measureId);
              const fallbackM = newScore.measures[Math.min(newScore.measures.length - 1, Math.max(0, (t.measureNumber || 1) - 1))];
              const measureId = mIdx >= 0 ? t.measureId : (fallbackM ? fallbackM.id : newScore.measures[0]?.id || 'm1');
              const finalMIdx = newScore.measures.findIndex((m) => m.id === measureId);
              return {
                ...t,
                id: t.id || `text_${Date.now()}_${i}`,
                type: 'text',
                text: t.text || t.content || '',
                content: t.text || t.content || '',
                measureId,
                measureNumber: finalMIdx >= 0 ? finalMIdx + 1 : (t.measureNumber || 1),
              };
            }),
          };
          setScore(normalizedScore);
          pushScoreState(normalizedScore);
        }}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onResetScore={(templateKey) => {
          const t = SAMPLE_SCORES[templateKey] || SAMPLE_SCORES.blank;
          setScore(t);
          pushScoreState(t);
        }}
        onNavigateHome={requestNavigateHome}
        onOpenNewPageModal={requestNewProject}
        onSaveProject={handleSaveProject}
        onOpenSaveAs={() => setIsSaveAsModalOpen(true)}
        onOpenProjectLibrary={() => requestOpenProject()}
        onOpenPrintStudio={() => setViewMode('print')}
        onOpenSongProperties={() => setIsSongPropertiesModalOpen(true)}
        onAddMeasure={handleOpenAddMeasuresModal}
        onOpenCustomTimeSignature={() => setIsCustomTimeSigOpen(true)}
        onChangeTimeSignature={handleChangeTimeSignature}
        onOpenChordDialog={() => setIsChordDialogOpen(true)}
        onResetLayout={handleResetLayout}
      />

      {/* 2. Main Notation Toolbar */}
      {(() => {
        const activeMeasureIdx = score.measures.findIndex((m) => m.id === selection.measureId);
        const curMeasureNum = activeMeasureIdx >= 0 ? activeMeasureIdx + 1 : 1;
        const curBeatNum = (selection.beatIndex !== undefined ? selection.beatIndex : 0) + 1;
        const curSubBeatNum = (selection.subBeatIndex !== undefined ? selection.subBeatIndex : 0) + 1;
        const curBeatVal = getEffectiveBeatValue(
          score,
          Math.max(0, activeMeasureIdx),
          selection.beatIndex !== undefined ? selection.beatIndex : 0
        );
        const positionText = `Bar ${curMeasureNum} • Beat ${curBeatNum}${
          curBeatVal > 1 ? ` [${curSubBeatNum}/${curBeatVal}]` : ''
        } • Value ${curBeatVal}`;

        return (
          <MainToolbar
            toolMode={toolMode}
            onSetToolMode={setToolMode}
            selectedDuration={selectedDuration}
            onSetDuration={setSelectedDuration}
            isDotted={isDotted}
            onToggleDotted={() => setIsDotted(!isDotted)}
            selectedAccidental={selectedAccidental}
            onSetAccidental={setSelectedAccidental}
            activeHand={activeHand}
            onSetHand={setActiveHand}
            currentBeatValue={curBeatVal}
            onChangeBeatValue={handleChangeBeatValue}
            activePositionText={positionText}
            isInspectorOpen={isInspectorOpen}
            onToggleInspector={() => setIsInspectorOpen((prev) => !prev)}
            onCut={handleCut}
            onCopy={handleCopy}
            onPaste={handlePaste}
            hasClipboardContent={Boolean(clipboardData)}
            onToggleDoubleBarline={() => handleToggleDoubleBarline(selection.measureId || score.measures[0]?.id)}
          />
        );
      })()}

      {/* Central Workspace: Left Palette + Score Canvas + Right Inspector */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 3. Left-side Tool Palette */}
        <LeftToolPalette
          score={score}
          onUpdateLayout={handleUpdateLayout}
        />

        {/* 4. Central Score Canvas (Custom Pianotastic Notation) */}
        <div
          id="score-viewport-container"
          className="flex-1 h-full overflow-y-auto overflow-x-auto flex flex-col bg-stone-200/50 relative scroll-smooth"
        >
          <ErrorBoundary fallbackMessage="The notation canvas encountered a temporary rendering issue. Your edits and project are safe.">
            <NotationRenderer
              score={score}
              toolMode={toolMode}
              selectedDuration={selectedDuration}
              selectedAccidental={selectedAccidental}
              activeHand={activeHand}
              selection={selection}
              playbackPosition={playbackPosition}
              onSelectMeasure={handleSelectMeasure}
              onSelectBeat={(measureId, beatIndex, subBeatIndex, selectionType) =>
                setSelection((sel) => ({
                  ...sel,
                  measureId,
                  beatIndex,
                  subBeatIndex: subBeatIndex ?? 0,
                  selectionType: selectionType || 'beat',
                  eventId: null,
                }))
              }
              onSelectVolta={handleSelectVolta}
              onUpdateBeatLyric={handleUpdateBeatLyric}
              onUpdateBeatChord={handleUpdateBeatChord}
              onToggleBeatSymbol={handleToggleBeatSymbol}
              onInsertNote={handleInsertNote}
              onDeleteSelected={handleDeleteSelected}
              onMeasureWidthChange={handleMeasureWidthChange}
              onMeasureContextMenu={(measure, x, y) =>
                setContextMenu({ measure, x, y })
              }
              onOpenNavigationPalette={(measure) =>
                setNavigationModalMeasure(measure)
              }
              onToggleLineBreak={handleToggleLineBreak}
              onSelectTextAnnotation={handleSelectTextAnnotation}
              onEditTextAnnotation={handleEditTextAnnotation}
              onOpenAddTextModal={handleOpenAddTextModal}
              onMoveTextAnnotation={handleMoveTextAnnotation}
              onCommitMoveTextAnnotation={handleCommitMoveTextAnnotation}
              onUpdateTextAnnotation={handleUpdateTextAnnotation}
              onDeleteTextAnnotation={handleDeleteTextAnnotation}
              onUpdateSpace={handleUpdateSpace}
              onDeleteSpace={handleDeleteSpace}
              onAddSpace={handleAddSpace}
            />
          </ErrorBoundary>
        </div>

        {/* 5. Right-side Collapsible Contextual Properties Inspector */}
        <PropertiesPanel
          isOpen={isInspectorOpen}
          onClose={() => setIsInspectorOpen(false)}
          score={score}
          selection={selection}
          activeHand={activeHand}
          currentBeatValue={getEffectiveBeatValue(
            score,
            Math.max(0, score.measures.findIndex((m) => m.id === (selection.measureId || score.measures[0]?.id))),
            selection.beatIndex !== undefined ? selection.beatIndex : 0
          )}
          onChangeBeatValue={handleChangeBeatValue}
          onUpdateBeatChord={handleUpdateBeatChord}
          onUpdateBeatLyric={handleUpdateBeatLyric}
          onToggleBeatSymbol={handleToggleBeatSymbol}
          onClearCurrentBeat={handleClearCurrentBeat}
          onTransposeSelected={handleTransposeSelected}
          onToggleLineBreak={handleToggleLineBreak}
          onSelectBeat={(mId, bIdx, subIdx) =>
            setSelection((sel) => ({
              ...sel,
              measureId: mId,
              beatIndex: bIdx,
              subBeatIndex: subIdx ?? 0,
            }))
          }
          onSelectVolta={handleSelectVolta}
          onAddVolta={handleAddVolta}
          onUpdateVolta={handleUpdateVolta}
          onDeleteVolta={handleDeleteVolta}
          onUpdateScoreMetadata={handleUpdateMetadata}
          onUpdateLayout={handleUpdateLayout}
          onUpdateMeasure={handleUpdateMeasure}
          onAddMeasure={handleAddMeasure}
          onInsertMeasureBefore={handleInsertMeasureBefore}
          onInsertMeasureAfter={handleInsertMeasureAfter}
          onDuplicateMeasure={handleDuplicateMeasure}
          onDeleteMeasure={handleDeleteMeasure}
          onClearMeasure={handleClearMeasure}
          onOpenCustomTimeSignature={() => setIsCustomTimeSigOpen(true)}
          onOpenChordDialog={() => setIsChordDialogOpen(true)}
          onResetLayout={handleResetLayout}
          onOpenAddTextModal={handleOpenAddTextModal}
          onEditTextAnnotation={handleEditTextAnnotation}
          onDeleteTextAnnotation={handleDeleteTextAnnotation}
          onUpdateTextAnnotation={handleUpdateTextAnnotation}
          onUpdateSpace={handleUpdateSpace}
          onDeleteSpace={handleDeleteSpace}
          onAddSpace={handleAddSpace}
        />
      </div>

      {/* Virtual Piano Expandable Keyboard (Dynamic 61 / 76 / 88 keys) */}
      <VirtualPiano
        isOpen={isVirtualPianoOpen}
        onClose={() => setIsVirtualPianoOpen(false)}
        onKeyPress={handlePianotasticNoteInput}
        selectedAccidental={selectedAccidental}
        keyboardSize={score.layoutSettings.keyboardLayout || score.metadata.keyboardLayout || '61'}
        onKeyboardSizeChange={(sz) => {
          handleUpdateLayout({ keyboardLayout: sz });
          handleUpdateMetadata({ keyboardLayout: sz });
        }}
      />

      {/* 6. Bottom Playback & Control Bar */}
      <BottomPlaybackBar
        score={score}
        onUpdateScoreMetadata={handleUpdateMetadata}
        isVirtualPianoOpen={isVirtualPianoOpen}
        onToggleVirtualPiano={() => setIsVirtualPianoOpen(!isVirtualPianoOpen)}
        playbackPosition={playbackPosition}
        selection={selection}
        onOpenMidiModal={() => setIsMidiModalOpen(true)}
      />

      {/* MODALS */}
      <AddMeasuresModal
        isOpen={isAddMeasuresModalOpen}
        onClose={() => setIsAddMeasuresModalOpen(false)}
        onAdd={handleAddMeasures}
        defaultCount={4}
      />

      <CustomTimeSignatureModal
        isOpen={isCustomTimeSigOpen}
        onClose={() => setIsCustomTimeSigOpen(false)}
        currentTs={score.metadata.initialTimeSignature}
        onApply={(ts: TimeSignature, applyToAll: boolean) => {
          if (applyToAll) {
            handleUpdateMetadata({ initialTimeSignature: ts });
            setScore((prev) => {
              const updatedMeasures = prev.measures.map((m) => ({
                ...m,
                timeSignature: undefined, // inherit new score time signature
              }));
              const updated = { ...prev, measures: updatedMeasures };
              pushScoreState(updated);
              return updated;
            });
          } else if (selection.measureId) {
            handleUpdateMeasure(selection.measureId, { timeSignature: ts });
          }
        }}
      />

      <ChordDialogModal
        isOpen={isChordDialogOpen}
        onClose={() => setIsChordDialogOpen(false)}
        onInsertChord={(chord) => {
          if (!selection.measureId) return;
          const currentBeat = selection.beatIndex !== undefined ? selection.beatIndex : 0;
          handleUpdateBeatChord(selection.measureId, currentBeat, chord.formatted);
          if (chord.formatted) {
            audioEngine.playChord(chord.formatted);
          }
        }}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Navigation Tool Modal / Palette */}
      {navigationModalMeasure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-100">
            <NavigationPalette
              activeMeasure={score.measures.find((m) => m.id === navigationModalMeasure.id) || navigationModalMeasure}
              measures={score.measures}
              onUpdateMeasure={(mId, patch) => handleUpdateMeasure(mId, patch)}
              onClose={() => setNavigationModalMeasure(null)}
            />
          </div>
        </div>
      )}

      {/* MIDI Device Configuration Modal */}
      <MidiDeviceModal
        isOpen={isMidiModalOpen}
        onClose={() => setIsMidiModalOpen(false)}
        midiMode={midiMode}
        onSetMidiMode={setMidiMode}
        quantization={quantization}
        onSetQuantization={setQuantization}
        selectedChannel={selectedChannel}
        onSetSelectedChannel={setSelectedChannel}
        velocitySensitive={velocitySensitive}
        onSetVelocitySensitive={setVelocitySensitive}
      />

      {contextMenu && (
        <MeasureContextMenu
          measure={contextMenu.measure}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAddBefore={handleInsertMeasureBefore}
          onAddAfter={handleInsertMeasureAfter}
          onDuplicate={handleDuplicateMeasure}
          onDelete={handleDeleteMeasure}
          onClear={handleClearMeasure}
          onResetWidth={(mId) => handleMeasureWidthChange(mId, undefined as any)}
          onOpenNavigation={(measure) => setNavigationModalMeasure(measure)}
          onToggleLineBreak={handleToggleLineBreak}
          onToggleDoubleBarline={handleToggleDoubleBarline}
          onAddSpaceBelow={(mId) => handleAddSpace(mId, 30)}
          onCopyMeasure={handleCopyMeasure}
          onPasteIntoMeasure={handlePasteIntoMeasure}
          hasClipboardContent={Boolean(clipboardData)}
        />
      )}

      {/* Floating Layout / Action Toast Notification */}
      {appToast && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 bg-stone-900/95 text-white px-4 py-2 rounded-full shadow-lg border border-stone-700 text-xs font-medium backdrop-blur-xs flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span>{appToast}</span>
        </div>
      )}

      {/* Save Copy As Modal */}
      <SaveAsModal
        isOpen={isSaveAsModalOpen}
        currentTitle={score.metadata.title}
        onClose={() => setIsSaveAsModalOpen(false)}
        onSaveCopy={handleSaveCopy}
      />

      {/* Save Project Modal (For new / untitled projects) */}
      <SaveProjectModal
        isOpen={isSaveProjectModalOpen}
        currentTitle={score.metadata.title}
        onClose={() => setIsSaveProjectModalOpen(false)}
        onSave={handleSaveNewProject}
      />

      {/* Project Library Modal */}
      <ProjectLibraryModal
        isOpen={isLibraryModalOpen}
        projects={savedProjects}
        currentProjectId={score.id}
        onClose={() => setIsLibraryModalOpen(false)}
        onOpenProject={(proj) => {
          setIsLibraryModalOpen(false);
          requestOpenProject(proj);
        }}
        onDeleteProject={handleDeleteProject}
        onDuplicateProject={handleDuplicateProject}
        onNewProject={() => {
          setIsLibraryModalOpen(false);
          requestNewProject();
        }}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSyncCloud={async () => {
          if (!currentUser) return;
          try {
            setIsSyncingCloud(true);
            const cloudProjects = await cloudProjectService.getUserProjects(currentUser.uid);
            setSavedProjects((local) => {
              const map = new Map<string, SavedProject>();
              local.forEach((p) => map.set(p.id, p));
              cloudProjects.forEach((p) => map.set(p.id, p));
              const merged = Array.from(map.values());
              ProjectStorageService.saveProjects(merged);
              return merged;
            });
            showToast('Library synchronized with cloud');
          } catch (e) {
            console.error('Cloud sync error:', e);
            showToast('Cloud sync failed');
          } finally {
            setIsSyncingCloud(false);
          }
        }}
        isSyncing={isSyncingCloud}
      />

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesModal
        isOpen={unsavedModalConfig.isOpen}
        projectTitle={score.metadata.title}
        actionType={unsavedModalConfig.actionType}
        onSaveAndProceed={() => {
          handleSaveProject();
          const act = unsavedModalConfig.actionType;
          const target = unsavedModalConfig.pendingTarget;
          setUnsavedModalConfig({ isOpen: false, actionType: 'new', pendingTarget: null });
          if (act === 'new') {
            handleOpenNewPageModal();
          } else if (act === 'open') {
            if (target) {
              handleSelectProject(target);
            } else {
              setIsLibraryModalOpen(true);
            }
          } else if (act === 'home') {
            audioEngine.stopPlayback();
            setPlaybackPosition(null);
            setViewMode('home');
          }
        }}
        onDiscardAndProceed={() => {
          setIsDirty(false);
          const act = unsavedModalConfig.actionType;
          const target = unsavedModalConfig.pendingTarget;
          setUnsavedModalConfig({ isOpen: false, actionType: 'new', pendingTarget: null });
          if (act === 'new') {
            handleOpenNewPageModal();
          } else if (act === 'open') {
            if (target) {
              handleSelectProject(target);
            } else {
              setIsLibraryModalOpen(true);
            }
          } else if (act === 'home') {
            audioEngine.stopPlayback();
            setPlaybackPosition(null);
            setViewMode('home');
          }
        }}
        onCancel={() => {
          setUnsavedModalConfig({ isOpen: false, actionType: 'new', pendingTarget: null });
        }}
      />

      {/* New Page Template Setup Modal */}
      <NewScoreSetupModal
        isOpen={isNewScoreModalOpen}
        onClose={handleCloseNewPageModal}
        onCreateScore={handleCreateScore}
      />

      {/* Score Text Annotation Tool Modal */}
      {textModalConfig?.isOpen && (
        <TextAnnotationModal
          isOpen={textModalConfig.isOpen}
          onClose={() => setTextModalConfig(null)}
          onSaveText={handleSaveTextAnnotation}
          onDeleteText={handleDeleteTextAnnotation}
          initialData={
            textModalConfig.initialData || {
              pageIndex: textModalConfig.pageIndex ?? 0,
              x: textModalConfig.x ?? 120,
              y: textModalConfig.y ?? 120,
            }
          }
          targetMeasureNumber={textModalConfig.measureNumber}
          targetBeatNumber={textModalConfig.beatIndex !== undefined ? textModalConfig.beatIndex + 1 : undefined}
        />
      )}

      {/* Song Properties Configuration Modal */}
      <SongPropertiesModal
        isOpen={isSongPropertiesModalOpen}
        onClose={() => setIsSongPropertiesModalOpen(false)}
        metadata={score.metadata}
        layoutSettings={score.layoutSettings}
        onUpdateMetadata={handleUpdateMetadata}
        onUpdateLayout={handleUpdateLayout}
      />
    </div>
  );
}
