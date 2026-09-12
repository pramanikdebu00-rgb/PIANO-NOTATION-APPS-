import React, { useState } from 'react';
import { Score, ToolMode, LearningLayerSettings, TimeSignature } from '../../types/score';
import {
  Undo2,
  Redo2,
  Printer,
  Download,
  Upload,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Music2,
  FileText,
  FileMusic,
  HelpCircle,
  Sparkles,
  Save,
  Check,
  GraduationCap,
  PlusCircle,
  RotateCcw,
  Piano,
  Clock,
  Home,
  Plus,
  Lock,
  Unlock,
  Columns,
  AlignJustify,
  Scissors,
  Copy,
  ClipboardPaste,
  Cloud,
  User as UserIcon,
  Settings2,
} from 'lucide-react';
import { ExportService } from '../../services/exportService';
import { CloudSyncStatusIndicator, CloudSyncState } from './CloudSyncStatusIndicator';
import { modifierKeyName, redoShortcutLabel } from '../../services/shortcutManager';

interface HeaderProps {
  score: Score;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  hasClipboardContent?: boolean;
  currentUser?: { email?: string | null; uid: string; photoURL?: string | null; displayName?: string | null } | null;
  onOpenAuthModal?: () => void;
  cloudSyncStatus?: CloudSyncState;
  lastSavedAt?: Date | null;
  cloudErrorMessage?: string | null;
  onRetryCloudSync?: () => void;
  onUpdateMetadata: (patch: Partial<Score['metadata']>) => void;
  onUpdateLayout: (patch: Partial<Score['layoutSettings']>) => void;
  onUpdateLearningLayer?: (patch: Partial<LearningLayerSettings>) => void;
  onLoadScore: (score: Score) => void;
  onOpenShortcuts: () => void;
  onResetScore: (templateKey: string) => void;
  onOpenCustomTimeSignature?: () => void;
  onOpenChordDialog?: () => void;
  onAddMeasure?: () => void;
  onResetLayout?: () => void;
  onToggleVirtualPiano?: () => void;
  isVirtualPianoOpen?: boolean;
  onNavigateHome?: () => void;
  onOpenNewPageModal?: () => void;
  onSaveProject?: () => void;
  onOpenSaveAs?: () => void;
  onOpenProjectLibrary?: () => void;
  onOpenPrintStudio?: () => void;
  onOpenSongProperties?: () => void;
  onChangeTimeSignature?: (ts: TimeSignature) => void;
}

export const Header: React.FC<HeaderProps> = ({
  score,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  hasClipboardContent = false,
  currentUser,
  onOpenAuthModal,
  cloudSyncStatus,
  lastSavedAt,
  cloudErrorMessage,
  onRetryCloudSync,
  onUpdateMetadata,
  onUpdateLayout,
  onUpdateLearningLayer,
  onLoadScore,
  onOpenShortcuts,
  onResetScore,
  onOpenCustomTimeSignature,
  onChangeTimeSignature,
  onOpenChordDialog,
  onAddMeasure,
  onResetLayout,
  onToggleVirtualPiano,
  isVirtualPianoOpen,
  onNavigateHome,
  onOpenNewPageModal,
  onSaveProject,
  onOpenSaveAs,
  onOpenProjectLibrary,
  onOpenPrintStudio,
  onOpenSongProperties,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(score.metadata.title);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCustomLockModalOpen, setIsCustomLockModalOpen] = useState(false);
  const [customLockInput, setCustomLockInput] = useState<string>('4');

  const menuBarRef = React.useRef<HTMLDivElement>(null);

  // Close open menu on outside click or Escape
  React.useEffect(() => {
    if (!activeMenu) return;

    const handleOutsidePointer = (e: MouseEvent | TouchEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenu(null);
      }
    };

    document.addEventListener('mousedown', handleOutsidePointer);
    document.addEventListener('touchstart', handleOutsidePointer);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('touchstart', handleOutsidePointer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenu]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const project = await ExportService.importProject(file);
        onLoadScore({
          ...project.score,
          learningLayer: project.learningLayer,
        });
        showToast(`Loaded "${project.score.metadata.title}"`);
      } catch (err) {
        alert('Failed to load project: ' + (err as Error).message);
      }
      e.target.value = '';
    }
  };

  const handleSaveProject = () => {
    ExportService.exportJSON(score);
    showToast(`Saved "${score.metadata.title}.pianotastic"`);
  };

  const handleSaveAs = () => {
    const newTitle = window.prompt('Save project as:', score.metadata.title);
    if (newTitle && newTitle.trim()) {
      onUpdateMetadata({ title: newTitle.trim() });
      ExportService.exportJSON({
        ...score,
        metadata: { ...score.metadata, title: newTitle.trim() },
      }, newTitle.trim());
      showToast(`Saved "${newTitle.trim()}.pianotastic"`);
    }
  };

  const handleRevertAutosave = () => {
    const saved = localStorage.getItem('pianotastic_autosave_project');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.measures) {
          onLoadScore(parsed);
          showToast('Restored latest autosaved score');
          return;
        }
      } catch {
        // ignore
      }
    }
    showToast('No autosaved project found');
  };

  return (
    <header
      id="app-header"
      className="relative z-40 w-full bg-white border-b border-stone-200/90 text-stone-800 px-4 py-2 flex items-center justify-between select-none print:hidden"
    >
      {/* Brand & Document Menu */}
      <div className="flex items-center space-x-4">
        {/* Pianotastic Academy Logo & Title */}
        <div
          onClick={onNavigateHome}
          className="flex items-center space-x-2.5 pr-3 border-r border-stone-200 cursor-pointer group"
          title="Return to Projects Home Screen"
        >
          <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold shadow-xs group-hover:bg-amber-800 transition-colors">
            <Music2 className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-900 block -mb-0.5 font-sans">
              Pianotastic Academy
            </span>
            <span className="text-sm font-bold tracking-tight text-stone-900 font-serif group-hover:text-amber-900 transition-colors">
              Notation Studio
            </span>
          </div>
        </div>

        {/* Home & New Page Buttons */}
        <div className="flex items-center space-x-1.5 mr-2">
          {onNavigateHome && (
            <button
              id="header-home-btn"
              onClick={onNavigateHome}
              title="Return to Projects Home Screen"
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
            >
              <Home className="w-3.5 h-3.5 text-stone-600" />
              <span>Projects</span>
            </button>
          )}

          {onOpenNewPageModal && (
            <button
              id="header-new-page-btn"
              onClick={onOpenNewPageModal}
              title="Create New Page with Template Setup"
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Page</span>
            </button>
          )}
        </div>

        {/* Application Menus */}
        <div ref={menuBarRef} className="relative flex items-center space-x-1 text-sm font-medium text-stone-700">
          {/* File Menu */}
          <div className="relative">
            <button
              type="button"
              id="menu-file-btn"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenu((prev) => (prev === 'file' ? null : 'file'));
              }}
              onMouseEnter={() => {
                if (activeMenu && activeMenu !== 'file') {
                  setActiveMenu('file');
                }
              }}
              className={`px-3 py-1 rounded-md text-xs tracking-wide transition-all cursor-pointer select-none flex items-center space-x-1 ${
                activeMenu === 'file'
                  ? 'bg-amber-100 text-amber-950 font-bold shadow-2xs ring-1 ring-amber-400/60'
                  : 'text-stone-700 hover:bg-stone-100 hover:text-stone-950 font-medium'
              }`}
            >
              <span>File</span>
            </button>
            {activeMenu === 'file' && (
              <div
                className="absolute left-0 top-full mt-1 w-64 bg-white border border-stone-200 rounded-xl shadow-xl py-1.5 z-50 text-xs text-stone-800 font-sans max-h-[calc(100vh-65px)] overflow-y-auto"
              >
                <button
                  id="header-new-project-btn"
                  onClick={() => {
                    if (onOpenNewPageModal) {
                      onOpenNewPageModal();
                    } else {
                      onResetScore('blank');
                    }
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-amber-50 hover:text-amber-950 flex items-center justify-between text-stone-900 font-medium transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Plus className="w-3.5 h-3.5 text-stone-600" />
                    <span>New Project</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">{modifierKeyName}+N</span>
                </button>
                <button
                  id="header-open-project-btn"
                  onClick={() => {
                    if (onOpenProjectLibrary) {
                      onOpenProjectLibrary();
                    } else {
                      fileInputRef.current?.click();
                    }
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-amber-50 hover:text-amber-950 flex items-center justify-between text-stone-900 font-medium transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Upload className="w-3.5 h-3.5 text-stone-600" />
                    <span>Open Project...</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">{modifierKeyName}+O</span>
                </button>
                <button
                  id="header-save-project-btn"
                  onClick={() => {
                    onSaveProject?.();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-amber-50 hover:text-amber-950 flex items-center justify-between text-stone-900 font-medium transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Save className="w-3.5 h-3.5 text-stone-600" />
                    <span>Save Project</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">{modifierKeyName}+S</span>
                </button>
                <button
                  id="header-save-as-btn"
                  onClick={() => {
                    onOpenSaveAs?.();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-amber-50 hover:text-amber-950 flex items-center justify-between text-stone-900 font-medium transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Download className="w-3.5 h-3.5 text-stone-600" />
                    <span>Save As...</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">{modifierKeyName}+Shift+S</span>
                </button>
                <button
                  id="header-print-studio-btn"
                  onClick={() => {
                    if (onOpenPrintStudio) {
                      onOpenPrintStudio();
                    }
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-amber-50 hover:text-amber-950 flex items-center justify-between text-stone-900 font-medium transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Printer className="w-3.5 h-3.5 text-stone-600" />
                    <span>Print</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">{modifierKeyName}+P</span>
                </button>
                <button
                  id="header-song-properties-btn"
                  onClick={() => {
                    onOpenSongProperties?.();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-amber-50 hover:text-amber-950 flex items-center justify-between text-stone-900 font-medium transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Settings2 className="w-3.5 h-3.5 text-stone-600" />
                    <span>Song Properties...</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">Alt+Enter</span>
                </button>

                <div className="my-1 border-t border-stone-100" />
                <div className="px-3 py-1 text-[10px] uppercase font-semibold text-stone-500">
                  Samples & Revert
                </div>
                <button
                  onClick={() => {
                    onResetScore('blank');
                    setActiveMenu(null);
                    showToast('Created Blank Piano Score');
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between text-stone-700"
                >
                  <span>Blank Piano Score</span>
                  <span className="text-[10px] text-stone-400">Grand Staff</span>
                </button>
                <button
                  onClick={() => {
                    onResetScore('etude');
                    setActiveMenu(null);
                    showToast('Loaded Pianotastic Étude in C');
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between text-stone-700"
                >
                  <span>Pianotastic Étude in C</span>
                  <span className="text-[10px] text-stone-400">Sample</span>
                </button>
                <button
                  onClick={() => {
                    onResetScore('twinkle');
                    setActiveMenu(null);
                    showToast('Loaded Twinkle Little Star');
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between text-stone-700"
                >
                  <span>Twinkle Little Star</span>
                  <span className="text-[10px] text-stone-400">Sample</span>
                </button>
                <button
                  onClick={() => {
                    handleRevertAutosave();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center space-x-2 text-stone-600"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
                  <span>Revert to Autosave</span>
                </button>
                <div className="my-1 border-t border-stone-100" />
                <div className="px-3 py-1 text-[10px] uppercase font-semibold text-stone-600">
                  External File Export
                </div>
                <button
                  onClick={() => {
                    ExportService.exportProfessionalScorePDF(score);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center space-x-2"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Export Professional PDF</span>
                </button>
                <button
                  onClick={() => {
                    ExportService.exportPracticeSheetPDF(score);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center space-x-2"
                >
                  <GraduationCap className="w-3.5 h-3.5 text-amber-600" />
                  <span>Export Practice Sheet PDF</span>
                </button>
                <button
                  onClick={() => {
                    ExportService.exportMusicXML(score);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center space-x-2"
                >
                  <FileMusic className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Export MusicXML (.musicxml)</span>
                </button>
                <button
                  onClick={() => {
                    ExportService.exportMIDI(score);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center space-x-2"
                >
                  <Music2 className="w-3.5 h-3.5 text-purple-600" />
                  <span>Export Standard MIDI (.mid)</span>
                </button>
                <button
                  onClick={() => {
                    ExportService.printScore();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center space-x-2"
                >
                  <Printer className="w-3.5 h-3.5 text-stone-600" />
                  <span>Print Score (Browser Print)</span>
                </button>
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div className="relative">
            <button
              type="button"
              id="menu-edit-btn"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenu((prev) => (prev === 'edit' ? null : 'edit'));
              }}
              onMouseEnter={() => {
                if (activeMenu && activeMenu !== 'edit') {
                  setActiveMenu('edit');
                }
              }}
              className={`px-2.5 py-1 rounded-md text-xs tracking-wide transition-colors cursor-pointer select-none ${
                activeMenu === 'edit' ? 'bg-amber-100 text-amber-950 font-bold shadow-2xs ring-1 ring-amber-400/60' : 'hover:bg-stone-100 text-stone-700'
              }`}
            >
              Edit
            </button>
            {activeMenu === 'edit' && (
              <div
                className="absolute left-0 top-full mt-1 w-48 bg-white border border-stone-200 rounded-lg shadow-lg py-1.5 z-50 text-xs font-sans text-stone-800"
              >
                <button
                  onClick={() => {
                    onUndo();
                    setActiveMenu(null);
                  }}
                  disabled={!canUndo}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between disabled:opacity-40"
                >
                  <span>Undo</span>
                  <span className="text-[10px] text-stone-600">{modifierKeyName}+Z</span>
                </button>
                <button
                  onClick={() => {
                    onRedo();
                    setActiveMenu(null);
                  }}
                  disabled={!canRedo}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between disabled:opacity-40"
                >
                  <span>Redo</span>
                  <span className="text-[10px] text-stone-600">{redoShortcutLabel}</span>
                </button>
                <div className="my-1 border-t border-stone-100" />
                <button
                  onClick={() => {
                    onCut?.();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between text-stone-800"
                >
                  <div className="flex items-center space-x-2">
                    <Scissors className="w-3.5 h-3.5 text-stone-500" />
                    <span>Cut</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">{modifierKeyName}+X</span>
                </button>
                <button
                  onClick={() => {
                    onCopy?.();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between text-stone-800"
                >
                  <div className="flex items-center space-x-2">
                    <Copy className="w-3.5 h-3.5 text-stone-500" />
                    <span>Copy</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">{modifierKeyName}+C</span>
                </button>
                <button
                  onClick={() => {
                    onPaste?.();
                    setActiveMenu(null);
                  }}
                  disabled={!hasClipboardContent}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between text-stone-800 disabled:opacity-35"
                >
                  <div className="flex items-center space-x-2">
                    <ClipboardPaste className="w-3.5 h-3.5 text-stone-500" />
                    <span>Paste</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">{modifierKeyName}+V</span>
                </button>
                <div className="my-1 border-t border-stone-100" />
                <button
                  onClick={() => {
                    onResetLayout?.();
                    setActiveMenu(null);
                    showToast('Reset measures to automatic spacing');
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center space-x-2"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
                  <span>Reset Measure Spacing</span>
                </button>
              </div>
            )}
          </div>

          {/* View Menu */}
          <div className="relative">
            <button
              type="button"
              id="menu-view-btn"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenu((prev) => (prev === 'view' ? null : 'view'));
              }}
              onMouseEnter={() => {
                if (activeMenu && activeMenu !== 'view') {
                  setActiveMenu('view');
                }
              }}
              className={`px-2.5 py-1 rounded-md text-xs tracking-wide transition-colors cursor-pointer select-none ${
                activeMenu === 'view' ? 'bg-amber-100 text-amber-950 font-bold shadow-2xs ring-1 ring-amber-400/60' : 'hover:bg-stone-100 text-stone-700'
              }`}
            >
              View
            </button>
            {activeMenu === 'view' && (
              <div
                className="absolute left-0 top-full mt-1 w-56 bg-white border border-stone-200 rounded-lg shadow-lg py-1.5 z-50 text-xs font-sans text-stone-800"
              >
                <div className="px-3 py-1 text-[10px] uppercase font-semibold text-stone-600">
                  Document View Mode
                </div>
                <button
                  onClick={() => {
                    onUpdateLearningLayer?.({ viewMode: 'professional', enabled: false });
                    setActiveMenu(null);
                    showToast('Professional Engraving View');
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between"
                >
                  <span>Professional Engraving</span>
                  {score.learningLayer?.viewMode !== 'practice_sheet' && <span>✓</span>}
                </button>
                <button
                  onClick={() => {
                    onUpdateLearningLayer?.({ viewMode: 'practice_sheet', enabled: true });
                    setActiveMenu(null);
                    showToast('Pianotastic Practice Sheet View');
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between"
                >
                  <span className="text-amber-900 font-medium">Pianotastic Practice Sheet</span>
                  {score.learningLayer?.viewMode === 'practice_sheet' && <span>✓</span>}
                </button>
                <div className="my-1 border-t border-stone-100" />
                <div className="px-3 py-1 text-[10px] uppercase font-semibold text-stone-600">
                  Orientation & Layout
                </div>
                <button
                  onClick={() => {
                    onUpdateLayout({ orientation: 'portrait' });
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between"
                >
                  <span>Portrait Orientation</span>
                  {score.layoutSettings.orientation === 'portrait' && <span>✓</span>}
                </button>
                <button
                  onClick={() => {
                    onUpdateLayout({ orientation: 'landscape' });
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between"
                >
                  <span>Landscape Orientation</span>
                  {score.layoutSettings.orientation === 'landscape' && <span>✓</span>}
                </button>
                <button
                  onClick={() => {
                    onUpdateLayout({ layoutMode: 'auto' });
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between"
                >
                  <span>Automatic Measure Flow</span>
                  {score.layoutSettings.layoutMode === 'auto' && <span>✓</span>}
                </button>
                <div className="my-1 border-t border-stone-100" />
                <div className="px-3 py-1 text-[10px] uppercase font-semibold text-stone-600">
                  Zoom Presets
                </div>
                <div className="grid grid-cols-4 gap-1 px-3 py-1">
                  {[0.75, 1.0, 1.25, 1.5].map((z) => (
                    <button
                      key={z}
                      onClick={() => {
                        onUpdateLayout({ zoom: z });
                        setActiveMenu(null);
                      }}
                      className={`px-1 py-1 rounded text-center text-[11px] font-mono border ${
                        Math.abs(score.layoutSettings.zoom - z) < 0.05
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                      }`}
                    >
                      {Math.round(z * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Format Menu */}
          <div className="relative">
            <button
              type="button"
              id="menu-format-btn"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenu((prev) => (prev === 'format' ? null : 'format'));
              }}
              onMouseEnter={() => {
                if (activeMenu && activeMenu !== 'format') {
                  setActiveMenu('format');
                }
              }}
              className={`px-2.5 py-1 rounded-md text-xs tracking-wide transition-colors cursor-pointer select-none ${
                activeMenu === 'format' ? 'bg-amber-100 text-amber-950 font-bold shadow-2xs ring-1 ring-amber-400/60' : 'hover:bg-stone-100 text-stone-700'
              }`}
            >
              Format
            </button>
            {activeMenu === 'format' && (
              <div
                className="absolute left-0 top-full mt-1 w-60 bg-white border border-stone-200 rounded-lg shadow-lg py-1.5 z-50 text-xs font-sans text-stone-800"
              >
                <div className="px-3 py-1 text-[10px] uppercase font-semibold text-stone-500 tracking-wider flex items-center justify-between">
                  <span>Measure Lock Per Line</span>
                  <span className="font-mono text-stone-400">
                    {score.layoutSettings.measureLockPerLine ? `${score.layoutSettings.measureLockPerLine}/line` : 'Off'}
                  </span>
                </div>

                <div className="px-1.5 py-0.5 space-y-0.5">
                  <button
                    id="format-lock-off-btn"
                    onClick={() => {
                      onUpdateLayout({ measureLockPerLine: null });
                      setActiveMenu(null);
                      showToast('Measure Lock Per Line: Off (automatic reflow & manual line breaks)');
                    }}
                    className="w-full px-2.5 py-1.5 rounded text-left hover:bg-stone-100 flex items-center justify-between"
                  >
                    <span className={score.layoutSettings.measureLockPerLine == null ? 'font-semibold text-amber-700' : ''}>
                      Off
                    </span>
                    {score.layoutSettings.measureLockPerLine == null && <Check className="w-3.5 h-3.5 text-amber-700" />}
                  </button>

                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      id={`format-lock-${num}-btn`}
                      onClick={() => {
                        onUpdateLayout({ measureLockPerLine: num });
                        setActiveMenu(null);
                        showToast(`Measure Lock: ${num} per line`);
                      }}
                      className="w-full px-2.5 py-1.5 rounded text-left hover:bg-stone-100 flex items-center justify-between"
                    >
                      <span className={score.layoutSettings.measureLockPerLine === num ? 'font-semibold text-amber-700' : ''}>
                        {num}
                      </span>
                      {score.layoutSettings.measureLockPerLine === num && <Check className="w-3.5 h-3.5 text-amber-700" />}
                    </button>
                  ))}

                  <button
                    id="format-lock-custom-btn"
                    onClick={() => {
                      setCustomLockInput(String(score.layoutSettings.measureLockPerLine || 4));
                      setIsCustomLockModalOpen(true);
                      setActiveMenu(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded text-left hover:bg-stone-100 flex items-center justify-between text-stone-700"
                  >
                    <span className={score.layoutSettings.measureLockPerLine && score.layoutSettings.measureLockPerLine > 6 ? 'font-semibold text-amber-700' : ''}>
                      Custom... {score.layoutSettings.measureLockPerLine && score.layoutSettings.measureLockPerLine > 6 ? `(${score.layoutSettings.measureLockPerLine})` : ''}
                    </span>
                    {score.layoutSettings.measureLockPerLine && score.layoutSettings.measureLockPerLine > 6 && <Check className="w-3.5 h-3.5 text-amber-700" />}
                  </button>
                </div>

                <div className="my-1 border-t border-stone-100" />
                <button
                  onClick={() => {
                    setCustomLockInput(String(score.layoutSettings.measureLockPerLine || 4));
                    setIsCustomLockModalOpen(true);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between text-stone-700"
                >
                  <span className="flex items-center gap-1.5">
                    <Columns className="w-3.5 h-3.5 text-stone-500" />
                    Custom Measures Per Line...
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Score Menu */}
          <div className="relative">
            <button
              type="button"
              id="menu-score-btn"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenu((prev) => (prev === 'score' ? null : 'score'));
              }}
              onMouseEnter={() => {
                if (activeMenu && activeMenu !== 'score') {
                  setActiveMenu('score');
                }
              }}
              className={`px-2.5 py-1 rounded-md text-xs tracking-wide transition-colors cursor-pointer select-none ${
                activeMenu === 'score' ? 'bg-amber-100 text-amber-950 font-bold shadow-2xs ring-1 ring-amber-400/60' : 'hover:bg-stone-100 text-stone-700'
              }`}
            >
              Score
            </button>
            {activeMenu === 'score' && (
              <div
                className="absolute left-0 top-full mt-1 w-56 bg-white border border-stone-200 rounded-lg shadow-lg py-1.5 z-50 text-xs font-sans text-stone-800"
              >
                <button
                  id="score-add-measure-btn"
                  onClick={() => {
                    onAddMeasure?.();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center space-x-2 font-medium text-stone-900"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-stone-600" />
                  <span>Add Measure</span>
                </button>

                <div className="my-1 border-t border-stone-100" />
                <div className="px-3 py-1 text-[10px] uppercase font-semibold text-stone-500">
                  Time Signature
                </div>
                {[
                  { num: 2, den: 4, label: '2/4' },
                  { num: 3, den: 4, label: '3/4' },
                  { num: 4, den: 4, label: '4/4' },
                  { num: 5, den: 4, label: '5/4' },
                  { num: 6, den: 8, label: '6/8' },
                  { num: 7, den: 8, label: '7/8' },
                  { num: 9, den: 8, label: '9/8' },
                  { num: 12, den: 8, label: '12/8' },
                ].map((item) => {
                  const isActive =
                    score.metadata.initialTimeSignature.numerator === item.num &&
                    score.metadata.initialTimeSignature.denominator === item.den;
                  return (
                    <button
                      key={item.label}
                      onClick={() => {
                        onChangeTimeSignature?.({ numerator: item.num, denominator: item.den });
                        setActiveMenu(null);
                        showToast(`Time Signature set to ${item.label}`);
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between"
                    >
                      <span className={isActive ? 'font-semibold text-amber-700' : 'text-stone-700'}>
                        {item.label}
                      </span>
                      {isActive && <Check className="w-3.5 h-3.5 text-amber-700" />}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    onOpenCustomTimeSignature?.();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between text-stone-600 border-t border-stone-50"
                >
                  <span className="flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-stone-500" />
                    <span>Custom Time Signature...</span>
                  </span>
                </button>

                <div className="my-1 border-t border-stone-100" />
                <button
                  onClick={() => {
                    onOpenChordDialog?.();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center space-x-2 text-stone-700"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Lead Sheet Chord Symbol...</span>
                </button>
              </div>
            )}
          </div>

          {/* Playback Menu */}
          <div className="relative">
            <button
              type="button"
              id="menu-playback-btn"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenu((prev) => (prev === 'playback' ? null : 'playback'));
              }}
              onMouseEnter={() => {
                if (activeMenu && activeMenu !== 'playback') {
                  setActiveMenu('playback');
                }
              }}
              className={`px-2.5 py-1 rounded-md text-xs tracking-wide transition-colors cursor-pointer select-none ${
                activeMenu === 'playback' ? 'bg-amber-100 text-amber-950 font-bold shadow-2xs ring-1 ring-amber-400/60' : 'hover:bg-stone-100 text-stone-700'
              }`}
            >
              Playback
            </button>
            {activeMenu === 'playback' && (
              <div
                className="absolute left-0 top-full mt-1 w-52 bg-white border border-stone-200 rounded-lg shadow-lg py-1.5 z-50 text-xs font-sans text-stone-800"
              >
                <button
                  onClick={() => {
                    onToggleVirtualPiano?.();
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-stone-50 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2">
                    <Piano className="w-3.5 h-3.5 text-stone-600" />
                    <span>Virtual Piano Keyboard</span>
                  </div>
                  {isVirtualPianoOpen && <span>✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Help Menu */}
          <button
            onClick={onOpenShortcuts}
            className="px-2 py-1 rounded-md text-xs tracking-wide hover:bg-stone-100 flex items-center space-x-1"
          >
            <HelpCircle className="w-3.5 h-3.5 text-stone-500" />
            <span>Shortcuts</span>
          </button>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pianotastic,.json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Center: Interactive Score Title */}
      <div className="flex items-center justify-center">
        {isEditingTitle ? (
          <input
            type="text"
            value={titleValue}
            autoFocus
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={() => {
              setIsEditingTitle(false);
              onUpdateMetadata({ title: titleValue.trim() || 'Untitled' });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditingTitle(false);
                onUpdateMetadata({ title: titleValue.trim() || 'Untitled' });
              }
            }}
            className="text-center font-serif text-sm font-semibold border-b border-stone-400 bg-stone-50 px-2 py-0.5 rounded outline-none w-64"
          />
        ) : (
          <div
            className="group flex items-center space-x-1.5 px-3 py-1 rounded-md hover:bg-stone-100 transition-colors"
            title="Click title to edit, or click gear for Song Properties"
          >
            <span
              onClick={() => setIsEditingTitle(true)}
              className="font-serif text-sm font-medium text-stone-900 cursor-pointer"
            >
              {score.metadata.title}
            </span>
            <button
              id="header-song-props-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSongProperties?.();
              }}
              title="Song Properties & Keyboard Layout"
              className="p-1 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
            >
              <Settings2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Right: Quick Actions & Zoom */}
      <div className="flex items-center space-x-2">
        {/* Undo / Redo */}
        <div className="flex items-center space-x-0.5 bg-stone-100 p-0.5 rounded-lg">
          <button
            id="undo-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title={`Undo (${modifierKeyName}+Z)`}
            className="p-1.5 rounded-md hover:bg-white text-stone-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            id="redo-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title={`Redo (${redoShortcutLabel})`}
            className="p-1.5 rounded-md hover:bg-white text-stone-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center space-x-1 bg-stone-100 p-0.5 rounded-lg text-xs font-medium text-stone-700">
          <button
            onClick={() =>
              onUpdateLayout({
                zoom: Math.max(0.6, Math.round((score.layoutSettings.zoom - 0.1) * 10) / 10),
              })
            }
            title="Zoom Out"
            className="p-1.5 rounded-md hover:bg-white transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="w-10 text-center font-mono text-[11px]">
            {Math.round(score.layoutSettings.zoom * 100)}%
          </span>
          <button
            onClick={() =>
              onUpdateLayout({
                zoom: Math.min(1.8, Math.round((score.layoutSettings.zoom + 0.1) * 10) / 10),
              })
            }
            title="Zoom In"
            className="p-1.5 rounded-md hover:bg-white transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Keyboard Layout Switcher (61, 76, 88 Keys) */}
        <div className="flex items-center space-x-1.5 bg-stone-100 px-2 py-1 rounded-lg border border-stone-200 text-xs shadow-2xs">
          <Piano className="w-3.5 h-3.5 text-stone-700 shrink-0" />
          <span className="text-[11px] font-semibold text-stone-600 hidden sm:inline">Keyboard:</span>
          <select
            id="header-keyboard-layout-select"
            value={score.layoutSettings.keyboardLayout || score.metadata.keyboardLayout || '61'}
            onChange={(e) => {
              const layout = e.target.value as '61' | '76' | '88';
              onUpdateLayout({ keyboardLayout: layout });
              onUpdateMetadata({ keyboardLayout: layout });
              showToast(`Switched keyboard layout to ${layout} Keys`);
            }}
            className="bg-white border border-stone-300 rounded px-1.5 py-0.5 text-xs font-semibold text-stone-800 hover:border-amber-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500 cursor-pointer"
            title="Keyboard Layout & Octave Display Convention (61, 76, or 88 Keys)"
          >
            <option value="61">61 Keys</option>
            <option value="76">76 Keys</option>
            <option value="88">88 Keys</option>
          </select>
        </div>

        {/* Educational View Mode Switcher */}
        <button
          id="view-mode-toggle-btn"
          onClick={() => {
            const currentMode = score.learningLayer?.viewMode || 'professional';
            const nextMode = currentMode === 'practice_sheet' ? 'professional' : 'practice_sheet';
            onUpdateLearningLayer?.({
              viewMode: nextMode,
              enabled: true,
            });
            showToast(nextMode === 'practice_sheet' ? 'Switched to Practice Sheet View' : 'Switched to Professional Score View');
          }}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            score.learningLayer?.viewMode === 'practice_sheet'
              ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs'
              : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
          }`}
          title="Toggle between Professional Engraving and Pianotastic Educational Practice Sheet"
        >
          {score.learningLayer?.viewMode === 'practice_sheet' ? (
            <>
              <GraduationCap className="w-3.5 h-3.5 text-amber-700" />
              <span className="font-serif">Practice Sheet</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-stone-500" />
              <span>Professional Score</span>
            </>
          )}
        </button>

        {/* Print / PDF button */}
        <button
          id="print-pdf-btn"
          onClick={() => {
            if (onOpenPrintStudio) {
              onOpenPrintStudio();
            } else {
              ExportService.printScore();
            }
          }}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 transition-colors shadow-xs"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print / PDF</span>
        </button>

        {/* Cloud Sync Status Indicator (Always visible in top-right) */}
        {cloudSyncStatus && (
          <CloudSyncStatusIndicator
            status={cloudSyncStatus}
            lastSavedAt={lastSavedAt ?? null}
            errorMessage={cloudErrorMessage}
            onRetry={onRetryCloudSync}
            onOpenCloudSettings={onOpenAuthModal}
          />
        )}

        {/* Cloud Sync & Account Workspace Profile / Avatar */}
        {onOpenAuthModal && (
          <button
            id="header-cloud-sync-btn"
            onClick={onOpenAuthModal}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors shadow-2xs ${
              currentUser
                ? 'bg-amber-50/80 border-amber-300 text-stone-900 hover:bg-amber-100 font-medium'
                : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
            }`}
            title={currentUser ? `Signed in as ${currentUser.email || 'Google Account'} (Cloud Sync Active)` : 'Sign in to sync projects to cloud'}
          >
            {currentUser ? (
              <>
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.email || 'User Avatar'}
                    className="w-4 h-4 rounded-full object-cover border border-amber-400"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-bold">
                    {currentUser.email ? currentUser.email[0].toUpperCase() : 'G'}
                  </div>
                )}
                <span className="truncate max-w-[130px] font-semibold text-amber-950">
                  {currentUser.email || 'Google Account'}
                </span>
                <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              </>
            ) : (
              <>
                <Cloud className="w-3.5 h-3.5 text-stone-500" />
                <span>Cloud Sync</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Custom Measure Lock Modal */}
      {isCustomLockModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-stone-300 max-w-sm w-full p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-stone-900 text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                Measure Lock Per Line
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Force each score line to display a fixed number of measures. All lines align to page boundaries with content-aware measure widths.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parseInt(customLockInput, 10);
                if (!isNaN(parsed) && parsed >= 1 && parsed <= 24) {
                  onUpdateLayout({ measureLockPerLine: parsed });
                  showToast(`Measure Lock set to ${parsed} per line`);
                  setIsCustomLockModalOpen(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Measures per line:
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  autoFocus
                  value={customLockInput}
                  onChange={(e) => setCustomLockInput(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  placeholder="e.g. 4"
                />
                <span className="text-[11px] text-stone-400 mt-1 block">
                  Press <kbd className="px-1 py-0.5 rounded bg-stone-100 border text-[10px] font-mono">Enter</kbd> to apply immediately
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsCustomLockModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-stone-300 text-xs font-medium text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateLayout({ measureLockPerLine: null });
                    showToast('Measure Lock disabled (Off)');
                    setIsCustomLockModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded border border-stone-200 text-xs text-stone-600 hover:bg-stone-50"
                >
                  Turn Off
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-stone-900 text-white text-xs font-medium hover:bg-stone-800"
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Action Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-[-3rem] left-1/2 -translate-x-1/2 bg-stone-900 text-white text-xs px-3.5 py-1.5 rounded-full shadow-lg flex items-center space-x-2 z-50 animate-in fade-in duration-200 pointer-events-none">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </header>
  );
};
