import React, { useState, useEffect } from 'react';
import { ScoreMetadata, LayoutSettings, TimeSignature } from '../../types/score';
import { KEY_SIGNATURES } from '../../utils/musicTheory';
import { INDIAN_TAALS } from '../../utils/indianTaals';
import { X, Music, Check, Settings2, Sliders, Calendar, Globe, User, ShieldCheck } from 'lucide-react';

interface SongPropertiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: ScoreMetadata;
  layoutSettings: LayoutSettings;
  onUpdateMetadata: (patch: Partial<ScoreMetadata>) => void;
  onUpdateLayout: (patch: Partial<LayoutSettings>) => void;
}

export const SongPropertiesModal: React.FC<SongPropertiesModalProps> = ({
  isOpen,
  onClose,
  metadata,
  layoutSettings,
  onUpdateMetadata,
  onUpdateLayout,
}) => {
  const [title, setTitle] = useState(metadata.title || '');
  const [subtitle, setSubtitle] = useState(metadata.subtitle || '');
  const [composer, setComposer] = useState(metadata.composer || '');
  const [lyricist, setLyricist] = useState(metadata.lyricist || '');
  const [copyright, setCopyright] = useState(metadata.copyright || '');
  const [keySignature, setKeySignature] = useState(metadata.initialKeySignature || 'C_major');
  const [indianTaal, setIndianTaal] = useState(metadata.indianTaal || 'None');
  const [tempoBpm, setTempoBpm] = useState(metadata.tempoBpm || 80);
  const [timeSigNum, setTimeSigNum] = useState(metadata.initialTimeSignature?.numerator || 4);
  const [timeSigDen, setTimeSigDen] = useState(metadata.initialTimeSignature?.denominator || 4);
  const [keyboardLayout, setKeyboardLayout] = useState<'61' | '76' | '88'>(
    layoutSettings.keyboardLayout || metadata.keyboardLayout || '61'
  );
  const [showHeader, setShowHeader] = useState<boolean>(layoutSettings.showHeader ?? true);
  const [showFooter, setShowFooter] = useState<boolean>(layoutSettings.showFooter ?? true);
  const [footerCustomText, setFooterCustomText] = useState<string>(
    layoutSettings.footerCustomText ?? (metadata.copyright || '© Pianotastic Academy')
  );
  const [footerPageNumbering, setFooterPageNumbering] = useState<'simple' | 'none'>(
    layoutSettings.footerPageNumbering === 'none' ? 'none' : 'simple'
  );
  const [footerShowOnAllPages, setFooterShowOnAllPages] = useState<boolean>(
    layoutSettings.footerShowOnAllPages ?? true
  );

  useEffect(() => {
    if (isOpen) {
      setTitle(metadata.title || '');
      setSubtitle(metadata.subtitle || '');
      setComposer(metadata.composer || '');
      setLyricist(metadata.lyricist || '');
      setCopyright(metadata.copyright || '');
      setKeySignature(metadata.initialKeySignature || 'C_major');
      setIndianTaal(metadata.indianTaal || 'None');
      setTempoBpm(metadata.tempoBpm || 80);
      setTimeSigNum(metadata.initialTimeSignature?.numerator || 4);
      setTimeSigDen(metadata.initialTimeSignature?.denominator || 4);
      setKeyboardLayout(layoutSettings.keyboardLayout || metadata.keyboardLayout || '61');
      setShowHeader(layoutSettings.showHeader ?? true);
      setShowFooter(layoutSettings.showFooter ?? true);
      setFooterCustomText(layoutSettings.footerCustomText ?? (metadata.copyright || '© Pianotastic Academy'));
      setFooterPageNumbering(layoutSettings.footerPageNumbering === 'none' ? 'none' : 'simple');
      setFooterShowOnAllPages(layoutSettings.footerShowOnAllPages ?? true);
    }
  }, [isOpen, metadata, layoutSettings]);

  if (!isOpen) return null;

  const handleSave = () => {
    const newTs: TimeSignature = {
      numerator: timeSigNum,
      denominator: timeSigDen,
    };

    onUpdateMetadata({
      title: title.trim() || 'Untitled Score',
      subtitle: subtitle.trim(),
      composer: composer.trim(),
      lyricist: lyricist.trim(),
      copyright: copyright.trim(),
      initialKeySignature: keySignature,
      indianTaal,
      tempoBpm: Math.max(20, Math.min(320, tempoBpm)),
      initialTimeSignature: newTs,
      keyboardLayout,
    });

    onUpdateLayout({
      keyboardLayout,
      showHeader,
      showFooter,
      footerCustomText: footerCustomText.trim(),
      footerPageNumbering,
      footerShowOnAllPages,
    });

    onClose();
  };

  const keySignatureOptions = Object.keys(KEY_SIGNATURES).map((k) => ({
    id: k,
    label: KEY_SIGNATURES[k]?.name || k.replace('_', ' '),
  }));

  const standardTimeSignatures = [
    { num: 4, den: 4, label: '4/4' },
    { num: 3, den: 4, label: '3/4' },
    { num: 2, den: 4, label: '2/4' },
    { num: 6, den: 8, label: '6/8' },
    { num: 5, den: 4, label: '5/4' },
    { num: 7, den: 4, label: '7/4' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="song-properties-modal"
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden text-stone-900 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">Song Properties</h2>
              <p className="text-xs text-stone-500">
                Edit document details at any time without affecting entered notes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar text-sm">
          {/* Title & Subtitle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1">
                Score Title *
              </label>
              <input
                id="prop-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Moonlight Sonata"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1">
                Subtitle / Description
              </label>
              <input
                id="prop-subtitle-input"
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="e.g. Pianotastic Academy Edition"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden"
              />
            </div>
          </div>

          {/* Composer & Lyricist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-stone-400" />
                Composer
              </label>
              <input
                id="prop-composer-input"
                type="text"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="e.g. L. van Beethoven"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-stone-400" />
                Lyricist / Arranger
              </label>
              <input
                id="prop-lyricist-input"
                type="text"
                value={lyricist}
                onChange={(e) => setLyricist(e.target.value)}
                placeholder="e.g. Traditional / Arranged by..."
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden"
              />
            </div>
          </div>

          {/* Scale & Indian Taal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-stone-100">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1">
                Scale / Key Signature
              </label>
              <select
                id="prop-key-sig-select"
                value={keySignature}
                onChange={(e) => setKeySignature(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium"
              >
                {keySignatureOptions.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-stone-400" />
                Indian Taal
              </label>
              <select
                id="prop-taal-select"
                value={indianTaal}
                onChange={(e) => setIndianTaal(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium"
              >
                <option value="None">None (Standard Western Meter)</option>
                {INDIAN_TAALS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.beats} Matras)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Time Signature & Tempo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-stone-100">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1">
                Time Signature
              </label>
              <div className="flex items-center space-x-1 mb-2">
                {standardTimeSignatures.map((ts) => {
                  const isSelected = timeSigNum === ts.num && timeSigDen === ts.den;
                  return (
                    <button
                      key={ts.label}
                      type="button"
                      onClick={() => {
                        setTimeSigNum(ts.num);
                        setTimeSigDen(ts.den);
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      {ts.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="32"
                  value={timeSigNum}
                  onChange={(e) => setTimeSigNum(Math.max(1, parseInt(e.target.value) || 4))}
                  className="w-16 px-2 py-1.5 border border-stone-300 rounded-md text-center text-sm font-bold"
                />
                <span className="text-stone-400 font-bold">/</span>
                <select
                  value={timeSigDen}
                  onChange={(e) => setTimeSigDen(parseInt(e.target.value) || 4)}
                  className="px-2 py-1.5 border border-stone-300 rounded-md text-sm font-bold bg-white"
                >
                  <option value="2">2</option>
                  <option value="4">4</option>
                  <option value="8">8</option>
                  <option value="16">16</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1">
                Tempo (BPM): <span className="text-amber-700 font-bold">{tempoBpm}</span>
              </label>
              <div className="flex items-center space-x-3 pt-1">
                <input
                  type="range"
                  min="30"
                  max="240"
                  value={tempoBpm}
                  onChange={(e) => setTempoBpm(Number(e.target.value))}
                  className="flex-1 accent-amber-600"
                />
                <input
                  type="number"
                  min="20"
                  max="320"
                  value={tempoBpm}
                  onChange={(e) => setTempoBpm(Number(e.target.value))}
                  className="w-16 px-2 py-1 border border-stone-300 rounded-md text-center text-sm font-bold"
                />
              </div>
            </div>
          </div>

          {/* Keyboard Layout Convention */}
          <div className="pt-2 border-t border-stone-100">
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5">
              Keyboard Range & Octave Convention
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['61', '76', '88'] as const).map((layout) => (
                <button
                  key={layout}
                  type="button"
                  onClick={() => setKeyboardLayout(layout)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    keyboardLayout === layout
                      ? 'border-amber-600 bg-amber-50/70 shadow-xs ring-1 ring-amber-500'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="font-bold text-xs text-stone-900 flex items-center justify-between">
                    <span>{layout} Keys</span>
                    {keyboardLayout === layout && <Check className="w-3.5 h-3.5 text-amber-600" />}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    {layout === '61'
                      ? 'Middle C as C³ (Default)'
                      : layout === '76'
                      ? 'E1..G7 range'
                      : 'Standard Piano (Middle C⁴)'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Copyright Notice */}
          <div className="pt-2 border-t border-stone-100">
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
              Copyright & Attribution
            </label>
            <input
              id="prop-copyright-input"
              type="text"
              value={copyright}
              onChange={(e) => setCopyright(e.target.value)}
              placeholder="e.g. © 2026 Pianotastic Academy. All rights reserved."
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden"
            />
          </div>

          {/* Header & Footer Independent Settings */}
          <div className="pt-3 border-t border-stone-100 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800 uppercase tracking-wide">
                Header & Footer Settings
              </label>
            </div>

            {/* Header Settings */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-xs text-stone-800">Score Header (Page 1)</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showHeader}
                    onChange={(e) => setShowHeader(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
              </div>
              <p className="text-[11px] text-stone-500">
                Displays Title, Subtitle, Composer, Tempo, and Time Signature at the top of the first page.
              </p>
            </div>

            {/* Footer Settings */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-xs text-stone-800">Score Footer (Optional)</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFooter}
                    onChange={(e) => setShowFooter(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
              </div>

              {showFooter && (
                <div className="space-y-2 pt-1 border-t border-stone-200/60">
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">
                      Footer Text
                    </label>
                    <input
                      type="text"
                      value={footerCustomText}
                      onChange={(e) => setFooterCustomText(e.target.value)}
                      placeholder="e.g. © Pianotastic Academy"
                      className="w-full px-2.5 py-1.5 border border-stone-300 rounded-md text-xs bg-white focus:ring-1 focus:ring-amber-500 outline-hidden"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-stone-600 mb-1">
                        Page Numbering
                      </label>
                      <select
                        value={footerPageNumbering}
                        onChange={(e) => setFooterPageNumbering(e.target.value as 'simple' | 'none')}
                        className="w-full px-2 py-1.5 border border-stone-300 rounded-md text-xs bg-white font-medium text-stone-700"
                      >
                        <option value="simple">Simple Numbers (1, 2, 3...)</option>
                        <option value="none">No Page Numbers</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-stone-600 mb-1">
                        Pages
                      </label>
                      <select
                        value={footerShowOnAllPages ? 'all' : 'from2'}
                        onChange={(e) => setFooterShowOnAllPages(e.target.value === 'all')}
                        className="w-full px-2 py-1.5 border border-stone-300 rounded-md text-xs bg-white font-medium text-stone-700"
                      >
                        <option value="all">Show on All Pages</option>
                        <option value="from2">Pages 2+ Only</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-stone-500">
            All notes, chords, and annotations are fully preserved.
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-stone-600 hover:bg-stone-200/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              id="save-song-properties-btn"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors flex items-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
