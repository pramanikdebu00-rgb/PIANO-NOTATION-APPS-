import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Score } from '../../types/score';
import {
  Printer,
  ArrowLeft,
  FileDown,
  RotateCw,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Sliders,
  Check,
  FileText,
  Copy,
  Layers,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { NotationRenderer } from '../notation/NotationRenderer';
import { ExportService } from '../../services/exportService';

interface PrintStudioProps {
  score: Score;
  onBackToEditor: () => void;
  onUpdateScore?: (score: Score) => void;
}

export const PrintStudio: React.FC<PrintStudioProps> = ({
  score,
  onBackToEditor,
  onUpdateScore,
}) => {
  // 1. Printer selection
  const [selectedPrinter, setSelectedPrinter] = useState<string>('default');

  // 2. Copies
  const [copies, setCopies] = useState<number>(1);

  // 3. Pages selection ('all' | 'current' | 'custom')
  const [pageSelectionType, setPageSelectionType] = useState<'all' | 'current' | 'custom'>('all');
  const [customPagesInput, setCustomPagesInput] = useState<string>('1');

  // 4. Paper Size ('a4' | 'letter' | 'a3' | 'legal')
  const [paperSize, setPaperSize] = useState<'a4' | 'letter' | 'a3' | 'legal'>(
    (score.layoutSettings.pageSize?.toLowerCase() as any) || 'a4'
  );

  // 5. Orientation ('portrait' | 'landscape')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    score.layoutSettings.orientation || 'portrait'
  );

  // 6. Margins ('normal' | 'narrow' | 'custom')
  const [marginPreset, setMarginPreset] = useState<'normal' | 'narrow' | 'custom'>('normal');
  const [customMargins, setCustomMargins] = useState<{ top: number; right: number; bottom: number; left: number }>({
    top: 40,
    right: 44,
    bottom: 40,
    left: 44,
  });

  // 7. Scaling
  const [scalingMode, setScalingMode] = useState<'fit' | 'actual' | 'custom'>('actual');
  const [customScale, setCustomScale] = useState<number>(100);

  // 8. Header Controls
  const [showHeader, setShowHeader] = useState<boolean>(
    score.layoutSettings.showHeader ?? true
  );
  const [headerCustomText, setHeaderCustomText] = useState<string>(
    score.layoutSettings.headerCustomText ?? ''
  );
  const [headerAlignment, setHeaderAlignment] = useState<'left' | 'center' | 'right'>(
    score.layoutSettings.headerAlignment ?? 'center'
  );
  const [headerFontSize, setHeaderFontSize] = useState<number>(
    score.layoutSettings.headerFontSize ?? 10
  );
  const [headerSpaceFromTop, setHeaderSpaceFromTop] = useState<number>(
    score.layoutSettings.headerSpaceFromTop ?? 24
  );
  const [headerSpaceBelow, setHeaderSpaceBelow] = useState<number>(
    score.layoutSettings.headerSpaceBelow ?? 16
  );

  // 9. Footer Controls
  const [showFooter, setShowFooter] = useState<boolean>(
    score.layoutSettings.showFooter ?? true
  );
  const [footerCustomText, setFooterCustomText] = useState<string>(
    score.layoutSettings.footerCustomText ?? (score.metadata.copyright || '')
  );
  const [footerAlignment, setFooterAlignment] = useState<'left' | 'center' | 'right'>(
    score.layoutSettings.footerAlignment ?? 'left'
  );
  const [footerFontSize, setFooterFontSize] = useState<number>(
    score.layoutSettings.footerFontSize ?? 9.5
  );
  const [footerSpaceFromBottom, setFooterSpaceFromBottom] = useState<number>(
    score.layoutSettings.footerSpaceFromBottom ?? 20
  );
  const [footerSpaceAbove, setFooterSpaceAbove] = useState<number>(
    score.layoutSettings.footerSpaceAbove ?? 14
  );

  // 10. Page Numbers
  const [showPageNumber, setShowPageNumber] = useState<boolean>(
    score.layoutSettings.showPageNumber ?? true
  );
  const [pageNumberPosition, setPageNumberPosition] = useState<'left' | 'center' | 'right'>(
    score.layoutSettings.pageNumberPosition ?? 'right'
  );
  const [pageNumberFormat, setPageNumberFormat] = useState<'page' | 'pageOfTotal'>(
    score.layoutSettings.footerPageNumbering === 'pageOfTotal' || score.layoutSettings.footerIncludeTotalPages ? 'pageOfTotal' : 'page'
  );

  // Preview & Pagination State
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [previewZoom, setPreviewZoom] = useState<number>(0.8);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [pdfStatusMessage, setPdfStatusMessage] = useState<string | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Synchronize margins based on preset
  const activeMargins = useMemo(() => {
    if (marginPreset === 'narrow') {
      return { top: 24, right: 24, bottom: 24, left: 24 };
    }
    if (marginPreset === 'normal') {
      return { top: 40, right: 44, bottom: 40, left: 44 };
    }
    return customMargins;
  }, [marginPreset, customMargins]);

  // Compute scale multiplier
  const effectiveScale = useMemo(() => {
    if (scalingMode === 'actual') return 1.0;
    if (scalingMode === 'fit') return 0.95;
    return customScale / 100;
  }, [scalingMode, customScale]);

  // Build configured printScore honoring all canonical data and print overrides
  const printScore = useMemo<Score>(() => {
    return {
      ...score,
      layoutSettings: {
        ...score.layoutSettings,
        pageSize: paperSize === 'letter' ? 'Letter' : paperSize === 'a3' ? 'A3' : paperSize === 'legal' ? 'Legal' : 'A4',
        orientation,
        pageMargins: activeMargins,
        showHeader,
        headerCustomText,
        headerAlignment,
        headerFontSize,
        headerSpaceFromTop,
        headerSpaceBelow,
        showFooter,
        footerCustomText,
        footerAlignment,
        footerFontSize,
        footerSpaceFromBottom,
        footerSpaceAbove,
        showPageNumber,
        pageNumberPosition,
        footerPageNumbering: pageNumberFormat,
        footerIncludeTotalPages: pageNumberFormat === 'pageOfTotal',
      },
    };
  }, [
    score,
    paperSize,
    orientation,
    activeMargins,
    showHeader,
    headerCustomText,
    headerAlignment,
    headerFontSize,
    headerSpaceFromTop,
    headerSpaceBelow,
    showFooter,
    footerCustomText,
    footerAlignment,
    footerFontSize,
    footerSpaceFromBottom,
    footerSpaceAbove,
    showPageNumber,
    pageNumberPosition,
    pageNumberFormat,
  ]);

  const handleBackToEditor = () => {
    if (onUpdateScore) {
      onUpdateScore(printScore);
    }
    onBackToEditor();
  };

  const handlePageCountCalculated = useCallback((count: number) => {
    setTotalPages((prev) => (count > 0 && count !== prev ? count : prev));
  }, []);

  // Calculate visible page indices based on selection
  const visiblePageIndices = useMemo(() => {
    if (pageSelectionType === 'all') {
      return undefined; // All pages rendered
    }
    if (pageSelectionType === 'current') {
      return [currentPage - 1];
    }
    // Custom pages parser (e.g. "1, 2-3")
    const indices: number[] = [];
    const parts = customPagesInput.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const s = parseInt(startStr, 10);
        const e = parseInt(endStr, 10);
        if (!isNaN(s) && !isNaN(e)) {
          for (let p = Math.max(1, s); p <= Math.min(totalPages, e); p++) {
            indices.push(p - 1);
          }
        }
      } else {
        const p = parseInt(trimmed, 10);
        if (!isNaN(p) && p >= 1 && p <= totalPages) {
          indices.push(p - 1);
        }
      }
    }
    return indices.length > 0 ? Array.from(new Set(indices)) : [0];
  }, [pageSelectionType, currentPage, customPagesInput, totalPages]);

  // Execute system print
  const handlePrint = () => {
    if (selectedPrinter === 'pdf') {
      handleSaveAsPdf();
      return;
    }
    window.print();
  };

  // Generate and download high-resolution vector PDF directly from canonical score and preview DOM
  const handleSaveAsPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      setPdfStatusMessage('Rendering exact vector PDF from Print Preview...');

      const container = printAreaRef.current;
      const pageEls = Array.from(
        container?.querySelectorAll<HTMLElement>('.score-page') || []
      );

      const targetPages = pageSelectionType === 'all' ? undefined : visiblePageIndices;
      const pagesToExport = targetPages
        ? pageEls.filter((_, idx) => targetPages.includes(idx))
        : pageEls;

      if (pagesToExport.length > 0) {
        const firstSvg = pagesToExport[0].querySelector('svg');
        const svgWidth = firstSvg ? parseFloat(firstSvg.getAttribute('width') || '794') : 794;
        const svgHeight = firstSvg ? parseFloat(firstSvg.getAttribute('height') || '1123') : 1123;
        const pdfWidth = svgWidth * 0.75;
        const pdfHeight = svgHeight * 0.75;

        const pdf = new jsPDF({
          orientation,
          unit: 'pt',
          format: [pdfWidth, pdfHeight],
        });

        for (let i = 0; i < pagesToExport.length; i++) {
          if (i > 0) {
            pdf.addPage([pdfWidth, pdfHeight], orientation);
          }
          const svgEl = pagesToExport[i].querySelector('svg');
          if (svgEl) {
            const clonedSvg = svgEl.cloneNode(true) as SVGElement;
            clonedSvg.querySelectorAll('.print\\:hidden, .print-preview-badge').forEach((el) => el.remove());
            await svg2pdf(clonedSvg, pdf, {
              x: 0,
              y: 0,
              width: pdfWidth,
              height: pdfHeight,
            });
          }
        }

        const cleanTitle = (printScore.metadata.title || 'Score').replace(/[/\\?%*:|"<>]/g, '_');
        pdf.save(`${cleanTitle}.pdf`);
        setPdfStatusMessage('PDF saved successfully!');
        setTimeout(() => setPdfStatusMessage(null), 2500);
        return;
      }

      const paperSizeUpper = (
        paperSize === 'letter'
          ? 'Letter'
          : paperSize === 'a3'
          ? 'A3'
          : paperSize === 'legal'
          ? 'Legal'
          : 'A4'
      ) as 'A4' | 'Letter' | 'A3' | 'Legal';

      await ExportService.exportPDF(
        printScore,
        'professional',
        printScore.metadata.title || 'Score',
        {
          paperSize: paperSizeUpper,
          orientation,
          margins: {
            top: activeMargins.top,
            right: activeMargins.right,
            bottom: activeMargins.bottom,
            left: activeMargins.left,
          },
          scaling: effectiveScale,
          keyboardLayout:
            printScore.layoutSettings.keyboardLayout ||
            printScore.metadata.keyboardLayout ||
            '61',
          showHeader,
          showFooter,
        },
        targetPages
      );

      setPdfStatusMessage('PDF generated successfully!');
      setTimeout(() => setPdfStatusMessage(null), 2500);
    } catch (err) {
      console.error('DOM vector PDF generation error, using canonical fallback:', err);
      try {
        await ExportService.exportPDF(
          printScore,
          'professional',
          printScore.metadata.title || 'Score'
        );
        setPdfStatusMessage('PDF generated successfully!');
        setTimeout(() => setPdfStatusMessage(null), 2500);
      } catch (fallbackErr) {
        console.error('Fallback export error:', fallbackErr);
        alert('Could not generate PDF. You can also choose "Save as PDF" in the print dialog.');
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div
      id="word-style-print-screen"
      className="flex h-screen w-screen overflow-hidden bg-stone-200 text-stone-900 font-sans select-none relative"
    >
      {/* Print Media Style Sheet Injection */}
      <style>{`
        @media print {
          @page {
            size: ${paperSize} ${orientation};
            margin: 0;
          }
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-studio-sidebar,
          .print-studio-topbar,
          .print-studio-bottombar,
          .print-studio-thumbnails,
          #app-header,
          #bottom-playback-bar,
          #virtual-piano-panel {
            display: none !important;
          }
          #notation-canvas-container {
            padding: 0 !important;
            margin: 0 !important;
            space-y: 0 !important;
            transform: none !important;
          }
          .print-paper-container {
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            transform: none !important;
          }
          .score-page {
            box-shadow: none !important;
            border: none !important;
            page-break-after: always !important;
            break-after: page !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* ================= LEFT SIDE: WORD-STYLE PRINT SETTINGS ================= */}
      <aside className="print-studio-sidebar w-80 lg:w-96 h-full bg-white border-r border-stone-300 flex flex-col z-20 shadow-xl print:hidden shrink-0">
        {/* Header / Back Action */}
        <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <button
            id="print-back-to-editor-btn"
            onClick={handleBackToEditor}
            className="flex items-center space-x-1.5 text-xs font-semibold text-stone-700 hover:text-stone-900 px-3 py-1.5 rounded-lg hover:bg-stone-200/70 border border-stone-200 transition-colors shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Editor</span>
          </button>
          <div className="flex items-center space-x-1.5 text-stone-800 font-serif font-bold text-base">
            <Printer className="w-4 h-4 text-amber-600" />
            <span>Print</span>
          </div>
        </div>

        {/* Primary Action Buttons: Print & Save as PDF */}
        <div className="p-4 border-b border-stone-200 bg-stone-50/50 space-y-2">
          <button
            id="print-execute-btn"
            onClick={handlePrint}
            className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 text-sm cursor-pointer"
          >
            <Printer className="w-4 h-4 stroke-[2.5]" />
            <span>Print</span>
          </button>

          <button
            id="print-save-pdf-btn"
            disabled={isGeneratingPdf}
            onClick={handleSaveAsPdf}
            className="w-full py-2 px-4 bg-white hover:bg-stone-50 active:bg-stone-100 text-stone-800 border border-stone-300 font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-2 text-xs cursor-pointer disabled:opacity-50"
          >
            <FileDown className="w-4 h-4 text-amber-600" />
            <span>{isGeneratingPdf ? 'Generating PDF...' : 'Save as PDF'}</span>
          </button>

          {pdfStatusMessage && (
            <p className="text-[11px] text-center font-medium text-amber-700 animate-pulse">
              {pdfStatusMessage}
            </p>
          )}
        </div>

        {/* Settings Scrollable Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Printer */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-1.5">
              Printer
            </label>
            <select
              value={selectedPrinter}
              onChange={(e) => setSelectedPrinter(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-stone-800 shadow-2xs"
            >
              <option value="default">Default Printer / System Dialog</option>
              <option value="pdf">Save as PDF (Direct Download)</option>
              <option value="microsoft_pdf">Microsoft Print to PDF</option>
            </select>
          </div>

          {/* Copies */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-1.5">
              Copies
            </label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setCopies((c) => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-300 font-bold text-stone-700 flex items-center justify-center text-sm"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                max="99"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 text-center py-1.5 border border-stone-300 rounded-lg text-xs font-bold text-stone-900 bg-white"
              />
              <button
                type="button"
                onClick={() => setCopies((c) => c + 1)}
                className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-300 font-bold text-stone-700 flex items-center justify-center text-sm"
              >
                +
              </button>
            </div>
          </div>

          {/* Pages */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-1.5">
              Pages
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="pageSelection"
                  checked={pageSelectionType === 'all'}
                  onChange={() => setPageSelectionType('all')}
                  className="w-3.5 h-3.5 text-amber-600 focus:ring-amber-500 accent-amber-600"
                />
                <span className="text-stone-700 font-medium">All Pages ({totalPages})</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="pageSelection"
                  checked={pageSelectionType === 'current'}
                  onChange={() => setPageSelectionType('current')}
                  className="w-3.5 h-3.5 text-amber-600 focus:ring-amber-500 accent-amber-600"
                />
                <span className="text-stone-700 font-medium">Current Page (Page {currentPage})</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="pageSelection"
                  checked={pageSelectionType === 'custom'}
                  onChange={() => setPageSelectionType('custom')}
                  className="w-3.5 h-3.5 text-amber-600 focus:ring-amber-500 accent-amber-600"
                />
                <span className="text-stone-700 font-medium">Custom Pages</span>
              </label>

              {pageSelectionType === 'custom' && (
                <div className="pl-5 pt-1">
                  <input
                    type="text"
                    placeholder="e.g. 1 or 1-2"
                    value={customPagesInput}
                    onChange={(e) => setCustomPagesInput(e.target.value)}
                    className="w-full px-2.5 py-1 text-xs border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500"
                  />
                  <p className="text-[10px] text-stone-500 mt-1">Type page numbers or ranges separated by commas</p>
                </div>
              )}
            </div>
          </div>

          {/* Paper Size */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-1.5">
              Paper Size
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'a4', label: 'A4', sub: '210 × 297 mm' },
                { id: 'letter', label: 'Letter', sub: '8.5 × 11 in' },
                { id: 'a3', label: 'A3', sub: '297 × 420 mm' },
                { id: 'legal', label: 'Legal', sub: '8.5 × 14 in' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPaperSize(item.id as any)}
                  className={`p-2 rounded-lg border text-left transition-colors ${
                    paperSize === item.id
                      ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                      : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <div className="font-bold text-xs">{item.label}</div>
                  <div className="text-[10px] text-stone-500">{item.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Orientation */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-1.5">
              Orientation
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-2 transition-colors ${
                  orientation === 'portrait'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="w-3 h-4 border border-current rounded-xs"></div>
                <span>Portrait</span>
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-2 transition-colors ${
                  orientation === 'landscape'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="w-4 h-3 border border-current rounded-xs"></div>
                <span>Landscape</span>
              </button>
            </div>
          </div>

          {/* Margins */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-1.5">
              Margins
            </label>
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              {[
                { id: 'normal', label: 'Normal' },
                { id: 'narrow', label: 'Narrow' },
                { id: 'custom', label: 'Custom' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMarginPreset(m.id as any)}
                  className={`py-1.5 px-2 rounded-lg border text-center font-medium text-xs transition-colors ${
                    marginPreset === m.id
                      ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold shadow-2xs'
                      : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {marginPreset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 bg-stone-50 p-2 rounded-lg border border-stone-200">
                <div>
                  <span className="text-[10px] text-stone-500 block">Top/Bottom</span>
                  <input
                    type="number"
                    value={customMargins.top}
                    onChange={(e) =>
                      setCustomMargins((prev) => ({
                        ...prev,
                        top: Number(e.target.value),
                        bottom: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2 py-1 text-xs border border-stone-300 rounded bg-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-stone-500 block">Left/Right</span>
                  <input
                    type="number"
                    value={customMargins.left}
                    onChange={(e) =>
                      setCustomMargins((prev) => ({
                        ...prev,
                        left: Number(e.target.value),
                        right: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2 py-1 text-xs border border-stone-300 rounded bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Scaling */}
          <div>
            <label className="font-bold text-stone-800 uppercase tracking-wider text-[10px] block mb-1.5">
              Scaling
            </label>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => {
                  setScalingMode('fit');
                  setCustomScale(95);
                }}
                className={`py-1.5 px-2 rounded-lg border text-center text-xs transition-colors ${
                  scalingMode === 'fit'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold shadow-2xs'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                Fit to Page
              </button>
              <button
                type="button"
                onClick={() => {
                  setScalingMode('actual');
                  setCustomScale(100);
                }}
                className={`py-1.5 px-2 rounded-lg border text-center text-xs transition-colors ${
                  scalingMode === 'actual'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold shadow-2xs'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                Actual Size (100%)
              </button>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="range"
                min="60"
                max="140"
                step="5"
                value={customScale}
                onChange={(e) => {
                  setScalingMode('custom');
                  setCustomScale(Number(e.target.value));
                }}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <span className="text-[11px] font-mono font-bold text-stone-700 w-10 text-right">
                {customScale}%
              </span>
            </div>
          </div>

          <hr className="border-stone-200" />

          {/* ================= HEADER CONTROLS ================= */}
          <div className="space-y-3 bg-stone-50/80 p-3 rounded-xl border border-stone-200">
            <div className="flex items-center justify-between">
              <label className="font-bold text-stone-900 uppercase tracking-wider text-[11px] flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHeader}
                  onChange={(e) => setShowHeader(e.target.checked)}
                  className="w-3.5 h-3.5 text-amber-600 rounded focus:ring-amber-500 accent-amber-600 cursor-pointer"
                />
                <span>Score Header</span>
              </label>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showHeader ? 'bg-amber-100 text-amber-800' : 'bg-stone-200 text-stone-600'}`}>
                {showHeader ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {showHeader && (
              <div className="space-y-2.5 pt-1">
                {/* Custom Header Text */}
                <div>
                  <span className="text-[10px] font-semibold text-stone-600 block mb-1">
                    Custom Header Text
                  </span>
                  <input
                    type="text"
                    placeholder={score.metadata.title || 'Score Title (Default)'}
                    value={headerCustomText}
                    onChange={(e) => setHeaderCustomText(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                {/* Header Alignment */}
                <div>
                  <span className="text-[10px] font-semibold text-stone-600 block mb-1">
                    Alignment
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button
                        key={`header-align-${align}`}
                        type="button"
                        onClick={() => setHeaderAlignment(align)}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1 transition-colors ${
                          headerAlignment === align
                            ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        {align === 'left' && <AlignLeft className="w-3 h-3" />}
                        {align === 'center' && <AlignCenter className="w-3 h-3" />}
                        {align === 'right' && <AlignRight className="w-3 h-3" />}
                        <span className="capitalize">{align}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Header Font Size */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-semibold text-stone-600">Font Size</span>
                    <span className="text-[10px] font-mono font-bold text-stone-700">{headerFontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="18"
                    step="0.5"
                    value={headerFontSize}
                    onChange={(e) => setHeaderFontSize(Number(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>

                {/* Space from Top of Page */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-semibold text-stone-600">Space from Top</span>
                    <span className="text-[10px] font-mono font-bold text-stone-700">{headerSpaceFromTop} px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="2"
                    value={headerSpaceFromTop}
                    onChange={(e) => setHeaderSpaceFromTop(Number(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>

                {/* Space between Header and Score */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-semibold text-stone-600">Space Below Header</span>
                    <span className="text-[10px] font-mono font-bold text-stone-700">{headerSpaceBelow} px</span>
                  </div>
                  <input
                    type="range"
                    min="6"
                    max="48"
                    step="2"
                    value={headerSpaceBelow}
                    onChange={(e) => setHeaderSpaceBelow(Number(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ================= FOOTER CONTROLS ================= */}
          <div className="space-y-3 bg-stone-50/80 p-3 rounded-xl border border-stone-200">
            <div className="flex items-center justify-between">
              <label className="font-bold text-stone-900 uppercase tracking-wider text-[11px] flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFooter}
                  onChange={(e) => setShowFooter(e.target.checked)}
                  className="w-3.5 h-3.5 text-amber-600 rounded focus:ring-amber-500 accent-amber-600 cursor-pointer"
                />
                <span>Score Footer</span>
              </label>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showFooter ? 'bg-amber-100 text-amber-800' : 'bg-stone-200 text-stone-600'}`}>
                {showFooter ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {showFooter && (
              <div className="space-y-2.5 pt-1">
                {/* Custom Footer Text */}
                <div>
                  <span className="text-[10px] font-semibold text-stone-600 block mb-1">
                    Custom Footer Text
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. © 2025 All rights reserved"
                    value={footerCustomText}
                    onChange={(e) => setFooterCustomText(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                {/* Footer Alignment */}
                <div>
                  <span className="text-[10px] font-semibold text-stone-600 block mb-1">
                    Alignment
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button
                        key={`footer-align-${align}`}
                        type="button"
                        onClick={() => setFooterAlignment(align)}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1 transition-colors ${
                          footerAlignment === align
                            ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        {align === 'left' && <AlignLeft className="w-3 h-3" />}
                        {align === 'center' && <AlignCenter className="w-3 h-3" />}
                        {align === 'right' && <AlignRight className="w-3 h-3" />}
                        <span className="capitalize">{align}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer Font Size */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-semibold text-stone-600">Font Size</span>
                    <span className="text-[10px] font-mono font-bold text-stone-700">{footerFontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="14"
                    step="0.5"
                    value={footerFontSize}
                    onChange={(e) => setFooterFontSize(Number(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>

                {/* Space from Bottom of Page */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-semibold text-stone-600">Space from Bottom</span>
                    <span className="text-[10px] font-mono font-bold text-stone-700">{footerSpaceFromBottom} px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="2"
                    value={footerSpaceFromBottom}
                    onChange={(e) => setFooterSpaceFromBottom(Number(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>

                {/* Space between Score and Footer */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-semibold text-stone-600">Space Above Footer</span>
                    <span className="text-[10px] font-mono font-bold text-stone-700">{footerSpaceAbove} px</span>
                  </div>
                  <input
                    type="range"
                    min="6"
                    max="48"
                    step="2"
                    value={footerSpaceAbove}
                    onChange={(e) => setFooterSpaceAbove(Number(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ================= PAGE NUMBERS ================= */}
          <div className="space-y-3 bg-stone-50/80 p-3 rounded-xl border border-stone-200">
            <div className="flex items-center justify-between">
              <label className="font-bold text-stone-900 uppercase tracking-wider text-[11px] flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPageNumber}
                  onChange={(e) => setShowPageNumber(e.target.checked)}
                  className="w-3.5 h-3.5 text-amber-600 rounded focus:ring-amber-500 accent-amber-600 cursor-pointer"
                />
                <span>Page Numbers</span>
              </label>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showPageNumber ? 'bg-amber-100 text-amber-800' : 'bg-stone-200 text-stone-600'}`}>
                {showPageNumber ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {showPageNumber && (
              <div className="space-y-2.5 pt-1">
                {/* Position */}
                <div>
                  <span className="text-[10px] font-semibold text-stone-600 block mb-1">
                    Position
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['left', 'center', 'right'] as const).map((pos) => (
                      <button
                        key={`page-num-pos-${pos}`}
                        type="button"
                        onClick={() => setPageNumberPosition(pos)}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1 transition-colors ${
                          pageNumberPosition === pos
                            ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        <span className="capitalize">{pos}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Format */}
                <div>
                  <span className="text-[10px] font-semibold text-stone-600 block mb-1">
                    Format
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPageNumberFormat('page')}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-semibold transition-colors ${
                        pageNumberFormat === 'page'
                          ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                          : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      Page 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageNumberFormat('pageOfTotal')}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-semibold transition-colors ${
                        pageNumberFormat === 'pageOfTotal'
                          ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                          : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      1 / {totalPages}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ================= RIGHT SIDE: REALISTIC WORD-STYLE PREVIEW ================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-[#e7e5e4]">
        {/* Top Control Bar */}
        <header className="print-studio-topbar h-12 bg-white border-b border-stone-300 px-6 flex items-center justify-between z-10 print:hidden shadow-xs shrink-0">
          <div className="flex items-center space-x-3 text-xs font-semibold text-stone-700">
            <span className="flex items-center space-x-1.5">
              <FileText className="w-4 h-4 text-amber-600" />
              <span className="font-bold text-stone-900">{score.metadata.title || 'Untitled Notation'}</span>
            </span>
            <span className="text-stone-300">•</span>
            <span className="text-stone-500 capitalize">
              {paperSize.toUpperCase()} • {orientation}
            </span>
            <span className="text-stone-300">•</span>
            <span className="text-stone-500">
              {totalPages} {totalPages === 1 ? 'Page' : 'Pages'}
            </span>
          </div>

          {/* Zoom & Fit Controls */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setPreviewZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(1))))}
              className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 transition-colors"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-bold text-stone-700 w-12 text-center">
              {Math.round(previewZoom * 100)}%
            </span>
            <button
              onClick={() => setPreviewZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(1))))}
              className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 transition-colors"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPreviewZoom(0.8)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 transition-colors ml-1"
            >
              Fit
            </button>
            <button
              onClick={() => setPreviewZoom(1.0)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 transition-colors"
            >
              100%
            </button>
          </div>
        </header>

        {/* Content area: Thumbnails Strip + Canvas */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Thumbnails Sidebar (if multiple pages) */}
          {totalPages > 1 && (
            <div className="print-studio-thumbnails w-28 bg-[#f5f5f4] border-r border-stone-300 p-3 overflow-y-auto space-y-3 shrink-0 print:hidden shadow-inner">
              <div className="text-[10px] uppercase font-bold text-stone-500 tracking-wider text-center">
                Pages
              </div>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                <button
                  key={`thumb-${pNum}`}
                  onClick={() => setCurrentPage(pNum)}
                  className={`w-full flex flex-col items-center p-1.5 rounded-lg border transition-all ${
                    currentPage === pNum
                      ? 'border-amber-600 bg-amber-50/80 shadow-xs'
                      : 'border-stone-300 bg-white hover:border-stone-400'
                  }`}
                >
                  <div className="w-full aspect-[1/1.4] bg-white border border-stone-200 rounded flex flex-col items-center justify-center p-1 relative overflow-hidden text-[9px] text-stone-400">
                    <span className="font-serif text-lg font-bold text-stone-300 select-none">𝄞</span>
                    <span className="absolute bottom-1 font-mono text-[9px] font-semibold text-stone-600">
                      {pNum}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-stone-700 mt-1">Page {pNum}</span>
                </button>
              ))}
            </div>
          )}

          {/* Main Printable Canvas Container */}
          <div
            ref={printAreaRef}
            id="print-sheet-paper"
            className="print-paper-container flex-1 overflow-auto p-6 md:p-10 flex flex-col items-center bg-[#d6d3d1] print:bg-white print:p-0"
          >
            <div
              style={{
                transform: `scale(${previewZoom * effectiveScale})`,
                transformOrigin: 'top center',
                transition: 'transform 0.1s ease-out',
                marginBottom: `${Math.max(60, (previewZoom - 1) * 800)}px`,
              }}
              className="flex flex-col items-center space-y-8"
            >
              <NotationRenderer
                score={printScore}
                isPrintView={true}
                toolMode="select"
                selection={{ measureId: null, staff: 'RH', eventId: null }}
                playbackPosition={null}
                onSelectBeat={() => {}}
                onSelectMeasure={() => {}}
                visiblePageIndices={visiblePageIndices}
                onPageCountCalculated={handlePageCountCalculated}
              />
            </div>
          </div>
        </div>

        {/* Bottom Page Navigation Controls */}
        <footer className="print-studio-bottombar h-11 bg-white border-t border-stone-300 px-6 flex items-center justify-between z-10 print:hidden shadow-xs shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded-md bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Previous page"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-stone-700">
              Page <span className="font-bold text-stone-900">{currentPage}</span> of{' '}
              <span className="font-bold text-stone-900">{totalPages}</span>
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1 rounded-md bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Next page"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-stone-500 font-medium">
            Word-Style Print Studio • Press Esc or click Back to Editor to return
          </div>
        </footer>
      </main>
    </div>
  );
};
