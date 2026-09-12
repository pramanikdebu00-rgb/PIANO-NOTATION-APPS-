import React, { useState } from 'react';
import { SavedProject, Score } from '../../types/score';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import {
  FolderOpen,
  X,
  Search,
  Plus,
  Clock,
  Music,
  Trash2,
  Copy,
  ChevronRight,
  FileMusic,
  Cloud,
  RefreshCw,
} from 'lucide-react';

interface ProjectLibraryModalProps {
  isOpen: boolean;
  projects: SavedProject[];
  currentProjectId?: string;
  onClose: () => void;
  onOpenProject: (score: Score) => void;
  onDeleteProject: (projectId: string) => void;
  onDuplicateProject: (project: SavedProject) => void;
  onNewProject: () => void;
  currentUser?: { email?: string | null; uid: string } | null;
  onOpenAuthModal?: () => void;
  onSyncCloud?: () => void;
  isSyncing?: boolean;
}

export const ProjectLibraryModal: React.FC<ProjectLibraryModalProps> = ({
  isOpen,
  projects,
  currentProjectId,
  onClose,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
  onNewProject,
  currentUser,
  onOpenAuthModal,
  onSyncCloud,
  isSyncing = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<SavedProject | null>(null);

  if (!isOpen) return null;

  const filteredProjects = projects.filter((p) =>
    (p.name || p.score?.metadata?.title || '')
      .toLowerCase()
      .includes(searchQuery.toLowerCase().trim())
  );

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shadow-xs">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-stone-900 text-base">Open Project</h2>
              <p className="text-xs text-stone-500">Select a project from your internal score library</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onClose();
                onNewProject();
              }}
              className="px-3 py-1.5 bg-white border border-stone-200 hover:border-amber-400 text-stone-700 hover:text-amber-700 font-semibold text-xs rounded-lg shadow-2xs flex items-center space-x-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Score</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-stone-100 bg-stone-50/50">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search your saved scores..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-stone-800 placeholder:text-stone-400"
            />
          </div>
        </div>

        {/* Cloud Sync Status Banner */}
        <div className="px-4 py-2 bg-stone-100/70 border-b border-stone-200 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 min-w-0">
            <Cloud className={`w-3.5 h-3.5 shrink-0 ${currentUser ? 'text-amber-600' : 'text-stone-400'}`} />
            {currentUser ? (
              <span className="text-stone-700 font-medium truncate">
                Cloud Sync: <span className="font-semibold text-stone-900">{currentUser.email}</span>
              </span>
            ) : (
              <span className="text-stone-500 truncate">
                Sign in with Google to sync scores across all your devices
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            {currentUser && onSyncCloud && (
              <button
                onClick={onSyncCloud}
                disabled={isSyncing}
                className="px-2 py-1 bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 rounded font-semibold text-[11px] flex items-center space-x-1 transition-colors"
                title="Refresh scores from Firestore"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-amber-600' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            )}
            {onOpenAuthModal && (
              <button
                onClick={onOpenAuthModal}
                className="text-amber-700 hover:text-amber-800 font-semibold text-[11px] hover:underline"
              >
                {currentUser ? 'Account' : 'Sign In'}
              </button>
            )}
          </div>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredProjects.length === 0 ? (
            <div className="py-12 text-center text-stone-400">
              <FileMusic className="w-10 h-10 mx-auto mb-2 opacity-40 text-stone-300" />
              <p className="text-sm font-semibold text-stone-600">No projects found</p>
              <p className="text-xs mt-0.5">Try searching with a different term or create a new score</p>
            </div>
          ) : (
            filteredProjects.map((p) => {
              const isCurrent = p.id === currentProjectId || p.score?.id === currentProjectId;
              return (
                <div
                  key={p.id}
                  className={`group flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-amber-50/60 border-amber-300 shadow-2xs'
                      : 'bg-white hover:bg-stone-50/80 border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div
                    onClick={() => {
                      onOpenProject(p.score);
                      onClose();
                    }}
                    className="flex-1 min-w-0 cursor-pointer pr-3"
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-serif font-bold text-sm text-stone-900 truncate group-hover:text-amber-800 transition-colors">
                        {p.name || p.score?.metadata?.title || 'Untitled Project'}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 uppercase tracking-wide">
                          Current
                        </span>
                      )}
                    </div>

                    <div className="flex items-center flex-wrap gap-2 text-[11px] text-stone-500">
                      <span className="flex items-center space-x-1">
                        <Music className="w-3 h-3 text-stone-400" />
                        <span>{p.measuresCount || p.score?.measures?.length || 0} bars</span>
                      </span>
                      <span>•</span>
                      <span>{p.keySignature || 'C Major'}</span>
                      <span>•</span>
                      <span>{p.tempo || 80} BPM</span>
                      <span>•</span>
                      <span className="flex items-center space-x-1 text-stone-400">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(p.lastModified)}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100">
                    <button
                      title="Duplicate project"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateProject(p);
                      }}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      id={`library-delete-project-btn-${p.id}`}
                      type="button"
                      title={`Delete "${p.name}"`}
                      aria-label={`Delete project ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(p);
                      }}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        onOpenProject(p.score);
                        onClose();
                      }}
                      className="ml-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center space-x-1"
                    >
                      <span>Open</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
          <span>{projects.length} saved score{projects.length === 1 ? '' : 's'} in library</span>
          <button
            onClick={onClose}
            className="font-semibold text-stone-600 hover:text-stone-900"
          >
            Close
          </button>
        </div>
      </div>

      {/* In-app confirmation dialog for deleting project */}
      <ConfirmDeleteModal
        isOpen={Boolean(projectToDelete)}
        itemName={projectToDelete?.name || 'Untitled'}
        itemType="project"
        onConfirm={() => {
          if (projectToDelete) {
            onDeleteProject(projectToDelete.id);
            setProjectToDelete(null);
          }
        }}
        onCancel={() => setProjectToDelete(null)}
      />
    </div>
  );
};
