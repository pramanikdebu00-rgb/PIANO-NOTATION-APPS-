import React, { useEffect } from 'react';
import { Trash2, X, AlertTriangle } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title?: string;
  itemName: string;
  itemType?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title = 'Delete Project',
  itemName,
  itemType = 'project',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      id="confirm-delete-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        id="confirm-delete-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-modal-title"
        className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-red-50/70 border-b border-red-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="confirm-delete-modal-title" className="font-serif font-bold text-stone-900 text-base leading-snug">
                {title}
              </h2>
              <p className="text-xs text-stone-500">This action cannot be undone</p>
            </div>
          </div>
          <button
            id="confirm-delete-close-btn"
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3">
          <div className="flex items-start space-x-3 text-stone-700">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <span className="font-bold text-stone-900">"{itemName || 'Untitled'}"</span>? All notation, measures, and lyrics for this {itemType} will be permanently removed.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-end space-x-2">
          <button
            id="confirm-delete-cancel-btn"
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            id="confirm-delete-proceed-btn"
            type="button"
            autoFocus
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold transition-colors shadow-xs flex items-center space-x-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete {itemType === 'project' ? 'Project' : 'Item'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
