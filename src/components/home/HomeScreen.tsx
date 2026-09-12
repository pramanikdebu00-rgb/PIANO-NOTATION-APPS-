import React, { useState } from 'react';
import { Score, SavedProject } from '../../types/score';
import { ProjectStorageService } from '../../services/projectStorageService';
import { ScoreMiniaturePreview } from './ScoreMiniaturePreview';
import { ConfirmDeleteModal } from '../modals/ConfirmDeleteModal';
import {
  Plus,
  FileMusic,
  Clock,
  Music,
  Trash2,
  Copy,
  Layers,
  Sparkles,
  Upload,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Cloud,
  RefreshCw,
} from 'lucide-react';

interface HomeScreenProps {
  savedProjects: SavedProject[];
  onOpenProject?: (score: Score) => void;
  onSelectProject?: (project: SavedProject) => void;
  onOpenNewPageModal?: () => void;
  onOpenNewPage?: () => void;
  onDeleteProject: (projectId: string) => void;
  onImportFile?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  currentUser?: { email?: string | null; uid: string; photoURL?: string | null; displayName?: string | null } | null;
  onOpenAuthModal?: () => void;
  onSyncCloud?: () => void;
  isSyncing?: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  savedProjects,
  onOpenProject,
  onSelectProject,
  onOpenNewPageModal,
  onOpenNewPage,
  onDeleteProject,
  onImportFile,
  currentUser,
  onOpenAuthModal,
  onSyncCloud,
  isSyncing = false,
}) => {
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<SavedProject | null>(null);

  const handleOpenScore = (project: SavedProject) => {
    if (typeof onOpenProject === 'function') {
      onOpenProject(project.score);
    } else if (typeof onSelectProject === 'function') {
      onSelectProject(project);
    }
  };

  const handleCreatePage = () => {
    if (typeof onOpenNewPageModal === 'function') {
      onOpenNewPageModal();
    } else if (typeof onOpenNewPage === 'function') {
      onOpenNewPage();
    }
  };

  // Helper to format date
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const diffMs = Date.now() - d.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      if (diffMinutes < 2) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div
      id="project-home-screen"
      className="min-h-screen bg-[#faf8f5] text-stone-900 flex flex-col font-sans select-none"
    >
      {/* Home Navigation Bar */}
      <header className="bg-white border-b border-stone-200/90 sticky top-0 z-20 px-6 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center text-white font-serif font-bold text-lg shadow-sm">
            𝄢
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-serif font-bold text-base text-stone-900 tracking-tight">
                Pianotastic Notation Studio
              </h1>
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-stone-500">
              Professional Sheet Music & Indian Taal Composer
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Cloud Sync Account Button */}
          {onOpenAuthModal && (
            <button
              id="home-cloud-sync-btn"
              onClick={onOpenAuthModal}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-2xs ${
                currentUser
                  ? 'bg-amber-50/90 border-amber-300 text-stone-900 hover:bg-amber-100'
                  : 'border-stone-300 bg-white hover:bg-stone-50 text-stone-700'
              }`}
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
                  <span className="truncate max-w-[140px] text-amber-950">
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

          {/* Import JSON / .pianotastic */}
          <label className="cursor-pointer px-3 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center space-x-1.5 transition-colors">
            <Upload className="w-3.5 h-3.5 text-stone-500" />
            <span>Open File</span>
            <input
              type="file"
              accept=".pianotastic,.json"
              onChange={onImportFile}
              className="hidden"
            />
          </label>

          {/* Primary "New Page" Action */}
          <button
            id="home-new-page-btn"
            onClick={handleCreatePage}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center space-x-2 shadow-sm transition-all hover:shadow-md"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Page</span>
          </button>
        </div>
      </header>

      {/* Main Home Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 pb-16 space-y-8">
        {/* Blank Workspace Card / Welcome Action Banner */}
        <section className="bg-white rounded-2xl border border-stone-200/90 shadow-sm p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-2 z-10 max-w-xl">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Notation Workspace Ready</span>
            </div>
            <h2 className="font-serif text-2xl font-bold text-stone-900 tracking-tight">
              Create a new sheet music score
            </h2>
            <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
              Start with your choice of <strong>Left Hand</strong>, <strong>Right Hand</strong>, or <strong>Both Hands</strong> grand staff template. Configure key signatures, classical Indian taals, BPM tempo, starting pickup bars, and dynamic engraving reflow.
            </p>
          </div>

          <div className="z-10 shrink-0 w-full md:w-auto">
            <button
              id="hero-create-page-btn"
              onClick={handleCreatePage}
              className="w-full md:w-auto px-6 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-sm flex items-center justify-center space-x-2 shadow-md hover:shadow-lg transition-all"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
              <span>New Page</span>
            </button>
          </div>

          {/* Decorative faint music background watermark */}
          <div className="absolute right-0 top-0 bottom-0 opacity-5 pointer-events-none select-none text-9xl font-serif flex items-center pr-8 text-stone-900">
            𝄞 𝄢
          </div>
        </section>

        {/* SECTION: Previously Saved Projects */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg font-bold text-stone-900 flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-amber-600" />
                <span>Previously Saved Projects</span>
              </h3>
              <p className="text-xs text-stone-500">
                Click any project card to open it directly in the notation editor.
              </p>
            </div>
            <span className="text-xs text-stone-500 font-medium">
              {savedProjects.length} {savedProjects.length === 1 ? 'Project' : 'Projects'}
            </span>
          </div>

          {savedProjects.length === 0 ? (
            /* Empty State */
            <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
                <FileMusic className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-stone-700">No Saved Projects Yet</h4>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Create your first score using the New Page button above. Your scores are automatically saved to your local workspace.
              </p>
              <button
                onClick={handleCreatePage}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Page</span>
              </button>
            </div>
          ) : (
            /* Projects Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedProjects.map((project) => {
                const hand = project.handTemplate || project.score.metadata.handTemplate || 'Both';
                const taal = project.taal || project.score.metadata.indianTaal || 'None';
                const keySig = project.keySignature || project.score.metadata.initialKeySignature || 'C Major';
                const bpm = project.tempo || project.score.metadata.tempoBpm || 80;
                const bars = project.measuresCount || project.score.measures.length || 16;
                const pickup = project.score.metadata.pickupBeat || project.score.metadata.pickupMeasure || 1;

                return (
                  <div
                    key={project.id}
                    id={`project-card-${project.id}`}
                    onMouseEnter={() => setHoveredProjectId(project.id)}
                    onMouseLeave={() => setHoveredProjectId(null)}
                    onClick={() => handleOpenScore(project)}
                    className="group bg-white rounded-xl border border-stone-200 hover:border-amber-500/60 p-4 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden"
                  >
                    {/* Top: Actual Staff Notation Thumbnail Preview */}
                    <div className="w-full h-32 bg-[#faf8f4] rounded-lg border border-stone-200/90 p-1 flex items-center justify-center relative overflow-hidden group-hover:bg-[#fcfaf7] transition-colors shadow-2xs">
                      <ScoreMiniaturePreview
                        score={project.score}
                        handTemplate={hand}
                      />

                      {/* Template Badge on Thumbnail */}
                      <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded bg-white/95 text-stone-800 border border-stone-200/80 shadow-2xs pointer-events-none backdrop-blur-xs">
                        {hand === 'Both' ? 'Grand Staff (Both)' : hand === 'RH' ? 'Right Hand' : 'Left Hand'}
                      </span>
                    </div>

                    {/* Middle: Title & Metadata */}
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-serif font-bold text-sm text-stone-900 group-hover:text-amber-800 transition-colors line-clamp-1">
                          {project.name}
                        </h4>
                      </div>

                      <div className="flex items-center space-x-1 text-[11px] text-stone-500">
                        <Clock className="w-3 h-3" />
                        <span>Last saved: {formatDate(project.lastModified)}</span>
                      </div>
                    </div>

                    {/* Tags & Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-medium">
                        {keySig.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-medium">
                        {bpm} BPM
                      </span>
                      <span className="text-[10px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-medium">
                        {bars} Bars
                      </span>
                      {pickup > 1 && (
                        <span className="text-[10px] bg-blue-100 text-blue-900 px-2 py-0.5 rounded font-medium">
                          Starts Beat {pickup}
                        </span>
                      )}
                      {taal !== 'None' && (
                        <span className="text-[10px] bg-orange-100 text-orange-900 px-2 py-0.5 rounded font-bold">
                          Taal: {taal}
                        </span>
                      )}
                    </div>

                    {/* Footer: Open Callout & Delete Option */}
                    <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-700 group-hover:text-amber-900 flex items-center space-x-1">
                        <span>Open Score</span>
                        <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>

                      <button
                        id={`delete-project-btn-${project.id}`}
                        type="button"
                        title={`Delete "${project.name}"`}
                        aria-label={`Delete project ${project.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(project);
                        }}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Confirmation Modal for Project Deletion */}
      <ConfirmDeleteModal
        isOpen={Boolean(projectToDelete)}
        itemName={projectToDelete?.name || 'Untitled Project'}
        itemType="project"
        onConfirm={() => {
          if (projectToDelete) {
            onDeleteProject(projectToDelete.id);
            setProjectToDelete(null);
          }
        }}
        onCancel={() => setProjectToDelete(null)}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200/80 py-4 px-6 text-center text-xs text-stone-500">
        <p>
          Pianotastic Notation Studio • Professional Sheet Music & Classical Indian Taal Composition System
        </p>
      </footer>
    </div>
  );
};
