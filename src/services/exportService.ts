import { jsPDF } from 'jspdf';
import {
  Score,
  Measure,
  NoteEvent,
  Pitch,
  NoteStep,
  AccidentalType,
  ToolMode,
  VoltaEnding,
  NavigationJump,
  NavigationTarget,
  PianotasticProject,
  DEFAULT_LEARNING_LAYER,
  LearningLayerSettings,
} from '../types/score';
import { getMidiNote, KEY_SIGNATURES, getEventBeats } from '../utils/musicTheory';
import { calculatePlaybackRoute } from '../utils/navigationEngine';
import {
  buildPrintableScoreDocument,
  PrintableScoreDocument,
  PrintableDocumentOptions,
} from './printableScoreDocument';

/**
 * Draw crisp vector sharp (♯) with line primitives to guarantee high-DPI vector PDF quality
 */
function drawVectorSharp(pdf: jsPDF, x: number, y: number, size: number) {
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.65);
  pdf.line(x, y - size * 0.45, x, y + size * 0.35);
  pdf.line(x + size * 0.28, y - size * 0.35, x + size * 0.28, y + size * 0.45);
  pdf.setLineWidth(1.05);
  pdf.line(x - size * 0.1, y - size * 0.08, x + size * 0.38, y - size * 0.22);
  pdf.line(x - size * 0.1, y + size * 0.22, x + size * 0.38, y + size * 0.08);
}

/**
 * Draw crisp vector flat (♭) with line and curve primitives
 */
function drawVectorFlat(pdf: jsPDF, x: number, y: number, size: number) {
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.75);
  pdf.line(x, y - size * 0.55, x, y + size * 0.25);
  pdf.lines(
    [
      [size * 0.28, -size * 0.05],
      [0, -size * 0.25],
      [-size * 0.28, -size * 0.05],
    ],
    x,
    y + size * 0.25,
    [1, 1],
    'S',
    true
  );
}

/**
 * Draw crisp vector natural (♮) with line primitives
 */
function drawVectorNatural(pdf: jsPDF, x: number, y: number, size: number) {
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.7);
  pdf.line(x, y - size * 0.55, x, y + size * 0.15);
  pdf.line(x + size * 0.28, y - size * 0.3, x + size * 0.28, y + size * 0.4);
  pdf.setLineWidth(0.95);
  pdf.line(x, y - size * 0.3, x + size * 0.28, y - size * 0.3);
  pdf.line(x, y + size * 0.15, x + size * 0.28, y + size * 0.15);
}

/**
 * Draw crisp vector tie / undertie (⌣) curve
 */
function drawVectorTie(pdf: jsPDF, x: number, y: number, width: number) {
  pdf.setDrawColor(107, 33, 168); // #6b21a8
  pdf.setLineWidth(1.2);
  const halfW = width / 2;
  pdf.lines([[halfW * 0.6, 3.5], [halfW * 0.8, -3.5]], x - halfW, y, [1, 1], 'S');
}

/**
 * Draw vector quarter note symbol for tempo marking
 */
function drawQuarterNoteSymbol(pdf: jsPDF, x: number, y: number, _size: number) {
  pdf.setFillColor(15, 23, 42);
  // Slanted oval notehead
  pdf.ellipse(x + 3.2, y + 1.2, 3.2, 2.3, 'F');
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(1.0);
  pdf.line(x + 5.8, y + 1.2, x + 5.8, y - 8.5);
}

/**
 * Render canonical PrintableScoreDocument directly into a vector jsPDF instance.
 * Guarantees 100% visual and data fidelity with Print Preview.
 */
function renderCanonicalDocumentToPdf(
  doc: PrintableScoreDocument,
  targetPageIndices?: number[],
  _mode: 'professional' | 'practice_sheet' = 'professional'
): jsPDF {
  const orientation = doc.orientation;
  const scale = 0.75; // 96 DPI screen px to 72 DPI PDF pt
  const pdfWidth = doc.pageWidth * scale;
  const pdfHeight = doc.pageHeight * scale;

  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: [pdfWidth, pdfHeight],
  });

  const pagesToRender = doc.pages.filter(
    (p) => !targetPageIndices || targetPageIndices.includes(p.pageIndex)
  );

  pagesToRender.forEach((page, pageIter) => {
    if (pageIter > 0) {
      pdf.addPage([pdfWidth, pdfHeight], orientation);
    }

    // 1. White Page Background
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');

    // 2. Score Header
    // Page 0 (First Page): ALWAYS render Main Song Title, Subtitle, Tempo, Time Signature, Composer, Lyricist
    if (page.pageIndex === 0) {
      // Main Song Title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.setTextColor(15, 23, 42);
      pdf.text(doc.title || 'Untitled Composition', pdfWidth / 2, 52 * scale, { align: 'center' });

      // Subtitle
      if (doc.subtitle) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(11);
        pdf.setTextColor(71, 85, 105);
        pdf.text(doc.subtitle, pdfWidth / 2, 70 * scale, { align: 'center' });
      }

      // Tempo Marking (Top Left)
      const tempoY = (doc.subtitle ? 102 : 88) * scale;
      const staffLeft = page.staffMarginLeft * scale;
      drawQuarterNoteSymbol(pdf, staffLeft, tempoY - 2, 10 * scale);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(15, 23, 42);
      pdf.text(`= ${doc.tempoBpm || 80} BPM`, staffLeft + 12 * scale, tempoY);

      // Time Signature & Indian Taal
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      pdf.text(doc.timeSignatureFormatted, staffLeft, tempoY + 14 * scale);

      // Composer & Lyricist (Top Right)
      const staffRight = (page.pageWidth - page.staffMarginRight) * scale;
      if (doc.composer) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9.5);
        pdf.setTextColor(30, 41, 59);
        pdf.text(doc.composer, staffRight, tempoY, { align: 'right' });
      }
      if (doc.lyricist) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Lyrics: ${doc.lyricist}`, staffRight, tempoY + 12 * scale, { align: 'right' });
      }
    } else if (page.showHeader && page.pageIndex > 0) {
      // Running Header on subsequent pages
      const staffLeft = page.staffMarginLeft * scale;
      const staffRight = (page.pageWidth - page.staffMarginRight) * scale;
      const runY = page.headerSpaceFromTop * scale;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(Math.round(page.headerFontSize * scale));
      pdf.setTextColor(100, 116, 139);

      const headerTextToDraw = page.headerCustomText || doc.title;
      const headerX =
        page.headerAlignment === 'left'
          ? staffLeft
          : page.headerAlignment === 'right'
          ? staffRight
          : (staffLeft + staffRight) / 2;
      const headerAlign =
        page.headerAlignment === 'left'
          ? 'left'
          : page.headerAlignment === 'right'
          ? 'right'
          : 'center';

      pdf.text(headerTextToDraw, headerX, runY, { align: headerAlign });
    }

    // 3. Page Footer (Canonical, user configurable)
    if (page.showFooter || page.showPageNumber) {
      const staffLeft = page.staffMarginLeft * scale;
      const staffRight = (page.pageWidth - page.staffMarginRight) * scale;
      const footerBaselineY = (page.pageHeight - page.footerSpaceFromBottom) * scale;

      // Custom footer text
      if (page.showFooter && (page.footerCustomText !== undefined ? page.footerCustomText : doc.copyright)) {
        const textToDraw = page.footerCustomText !== undefined ? page.footerCustomText : (doc.copyright || '');
        if (textToDraw) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(Math.round(page.footerFontSize * scale));
          pdf.setTextColor(100, 116, 139);
          const fX =
            page.footerAlignment === 'left'
              ? staffLeft
              : page.footerAlignment === 'right'
              ? staffRight
              : (staffLeft + staffRight) / 2;
          const fAlign =
            page.footerAlignment === 'left'
              ? 'left'
              : page.footerAlignment === 'right'
              ? 'right'
              : 'center';
          pdf.text(textToDraw, fX, footerBaselineY, { align: fAlign });
        }
      }

      // Page Number
      if (page.showPageNumber && page.pageNumberLabel) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(Math.round(page.footerFontSize * scale));
        pdf.setTextColor(71, 85, 105);
        const pX =
          page.pageNumberPosition === 'left'
            ? staffLeft
            : page.pageNumberPosition === 'center'
            ? (staffLeft + staffRight) / 2
            : staffRight;
        const pAlign =
          page.pageNumberPosition === 'left'
            ? 'left'
            : page.pageNumberPosition === 'center'
            ? 'center'
            : 'right';
        pdf.text(page.pageNumberLabel, pX, footerBaselineY, { align: pAlign });
      }
    }

    // 4. Systems & Measures
    page.systems.forEach((sys) => {
      sys.measures.forEach((m) => {
        const mX = m.x * scale;
        const mY = m.y * scale;
        const mW = m.width * scale;
        const mH = m.height * scale;

        // Staff frame / measure outline
        pdf.setDrawColor(203, 213, 225); // #cbd5e1
        pdf.setLineWidth(0.65);
        pdf.roundedRect(mX, mY, mW, mH, 2, 2, 'S');

        // Measure Number
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text(String(m.measureNumber), mX + 6 * scale, mY + 13 * scale);

        // Voltas
        if (m.voltas && m.voltas.length > 0) {
          m.voltas.forEach((v) => {
            const vY = (m.y - 10) * scale;
            pdf.setDrawColor(15, 23, 42);
            pdf.setLineWidth(0.75);
            pdf.line(mX, vY, mX + mW, vY);
            pdf.line(mX, vY, mX, vY + 8 * scale);
            if (v.closedEnd !== false) {
              pdf.line(mX + mW, vY, mX + mW, vY + 8 * scale);
            }
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(15, 23, 42);
            const label = v.text || (v.endingNumbers?.join(', ') ? `${v.endingNumbers.join(', ')}.` : '1.');
            pdf.text(label, mX + 5 * scale, vY - 2 * scale);
          });
        }

        // Barlines
        if (m.hasDoubleBarline) {
          // Double barline: two parallel vertical lines 3px apart
          pdf.setDrawColor(15, 23, 42);
          pdf.setLineWidth(1.1);
          pdf.line(mX + mW - 3 * scale, mY, mX + mW - 3 * scale, mY + mH);
          pdf.line(mX + mW, mY, mX + mW, mY + mH);
        } else if (m.barlineType === 'repeat_end') {
          pdf.setDrawColor(15, 23, 42);
          pdf.setLineWidth(0.75);
          pdf.line(mX + mW - 4 * scale, mY, mX + mW - 4 * scale, mY + mH);
          pdf.setLineWidth(2.2);
          pdf.line(mX + mW, mY, mX + mW, mY + mH);
          // Repeat dots
          pdf.setFillColor(15, 23, 42);
          pdf.circle(mX + mW - 8 * scale, mY + mH * 0.45, 1.8 * scale, 'F');
          pdf.circle(mX + mW - 8 * scale, mY + mH * 0.65, 1.8 * scale, 'F');
        } else if (m.barlineType === 'repeat_start') {
          pdf.setDrawColor(15, 23, 42);
          pdf.setLineWidth(2.2);
          pdf.line(mX, mY, mX, mY + mH);
          pdf.setLineWidth(0.75);
          pdf.line(mX + 4 * scale, mY, mX + 4 * scale, mY + mH);
          // Repeat dots
          pdf.setFillColor(15, 23, 42);
          pdf.circle(mX + 8 * scale, mY + mH * 0.45, 1.8 * scale, 'F');
          pdf.circle(mX + 8 * scale, mY + mH * 0.65, 1.8 * scale, 'F');
        } else {
          // Standard right barline
          pdf.setDrawColor(203, 213, 225);
          pdf.setLineWidth(0.75);
          pdf.line(mX + mW, mY, mX + mW, mY + mH);
        }

        // Beats
        m.beats.forEach((beat) => {
          const bX = beat.colX * scale;
          const bCenterX = beat.colCenterX * scale;

          // Subtle column divider line
          if (beat.beatIndex > 0) {
            pdf.setDrawColor(241, 245, 249);
            pdf.setLineWidth(0.5);
            pdf.line(bX, mY + 18 * scale, bX, mY + mH - 18 * scale);
          }

          // Row 1: Chord
          if (beat.chord) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9.5);
            pdf.setTextColor(37, 99, 235); // #2563eb
            pdf.text(beat.chord, bCenterX, mY + 36 * scale, { align: 'center' });
          }

          // Row 2: Beat Number / Matra
          // For Keharwa: 1, 2, 3, 4, 5, 6, 7, 8 in ONE single measure!
          // For Dadra: 1, 2, 3, 4, 5, 6 in ONE measure!
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8.5);
          pdf.setTextColor(100, 116, 139); // #64748b
          pdf.text(String(beat.beatNumber), bCenterX, mY + 54 * scale, { align: 'center' });

          // Row 3: Notes
          beat.notes.forEach((note) => {
            const nX = note.x * scale;
            const nY = (m.y + 84) * scale;

            if (note.isEmpty) {
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(13);
              pdf.setTextColor(148, 163, 184);
              const emptyChar = note.isRestDot ? '•' : note.subBeatCount > 1 ? '•' : '—';
              pdf.text(emptyChar, nX, nY, { align: 'center' });
            } else {
              pdf.setFont('helvetica', 'bold');
              const fontSize = note.subBeatCount > 2 ? 10 : note.subBeatCount === 2 ? 12 : 13.5;
              pdf.setFontSize(fontSize);
              pdf.setTextColor(15, 23, 42);

              const letterStr = note.step || '';
              const letterWidth = pdf.getStringUnitWidth(letterStr) * fontSize;

              const hasAcc = Boolean(note.accidental && note.accidental !== 'natural');
              const accWidth = hasAcc ? 6.5 * scale : 0;
              const octaveDigit = String(note.displayOctave);
              const octaveFontSize = Math.round(fontSize * 0.65);
              const octaveWidth = pdf.getStringUnitWidth(octaveDigit) * octaveFontSize;

              const totalClusterWidth = letterWidth + accWidth + octaveWidth;
              const clusterStartX = nX - totalClusterWidth / 2;

              // Note letter
              pdf.text(letterStr, clusterStartX + letterWidth / 2, nY, { align: 'center' });

              // Accidental vector glyph (♯, ♭, ♮)
              let currentX = clusterStartX + letterWidth;
              if (hasAcc) {
                const accX = currentX + 1.5 * scale;
                const accY = nY - 3 * scale;
                if (note.accidental === 'sharp') {
                  drawVectorSharp(pdf, accX, accY, fontSize * 0.75);
                } else if (note.accidental === 'flat') {
                  drawVectorFlat(pdf, accX, accY, fontSize * 0.75);
                } else if (note.accidental === 'natural') {
                  drawVectorNatural(pdf, accX, accY, fontSize * 0.75);
                }
                currentX += accWidth;
              }

              // Superscript Octave number: standard ASCII digit, raised Y position
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(octaveFontSize);
              pdf.setTextColor(30, 41, 59);
              pdf.text(octaveDigit, currentX + octaveWidth / 2, nY - 5 * scale, { align: 'center' });
            }
          });

          // Row 4: Symbols (e.g. ⌣)
          beat.symbols.forEach((sym) => {
            if (sym === '⌣' || sym.includes('⌣')) {
              drawVectorTie(pdf, bCenterX, (m.y + 104) * scale, 14 * scale);
            } else if (sym && sym.trim()) {
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(10.5);
              pdf.setTextColor(107, 33, 168);
              pdf.text(sym.trim(), bCenterX, (m.y + 106) * scale, { align: 'center' });
            }
          });

          // Row 5: Lyrics
          beat.lyrics.forEach((lyric) => {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(30, 41, 59);
            pdf.text(lyric.text, lyric.x * scale, (m.y + 124) * scale, { align: 'center' });
          });
        });
      });
    });

    // 5. Free-Position Text Objects
    page.textObjects.forEach((t) => {
      pdf.setFont('helvetica', t.fontWeight === 'bold' ? 'bold' : 'normal');
      pdf.setFontSize(Math.max(6, t.fontSize * 0.75));
      pdf.setTextColor(30, 41, 59);
      pdf.text(t.text, t.x * scale, t.y * scale);
    });
  });

  return pdf;
}

export class ExportService {
  /**
   * Export project to native .pianotastic file
   */
  public static exportProject(project: PianotasticProject, filename?: string) {
    const dataStr = JSON.stringify(project, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const cleanTitle = (filename || project.score.metadata.title || 'Score').replace(/[/\\?%*:|"<>]/g, '_');
    this.triggerDownload(blob, `${cleanTitle}.pianotastic`);
  }

  /**
   * Export score to JSON / .pianotastic file (backwards compatible)
   */
  public static exportJSON(score: Score, filename?: string) {
    const project: PianotasticProject = {
      format: 'pianotastic',
      version: '2.0.0',
      lastSavedAt: new Date().toISOString(),
      score,
      learningLayer: score.learningLayer || DEFAULT_LEARNING_LAYER,
      playbackSettings: {
        tempoBpm: score.metadata.tempoBpm || 108,
        tempoBeatUnit: score.metadata.tempoBeatUnit || 'quarter',
        metronomeOn: false,
        metronomeVolume: 0.7,
        accentFirstBeat: true,
      },
      midiSettings: {
        mode: 'playback',
        quantization: 'quarter',
        selectedChannel: 0,
        velocitySensitive: true,
      },
      brandingSettings: {
        showAcademyBranding: score.layoutSettings.showAcademyBranding ?? true,
        academyFooterText: score.layoutSettings.academyFooterText || 'Pianotastic Academy — Pianotastic Notation Studio',
      },
    };
    this.exportProject(project, filename);
  }

  /**
   * Import project from .pianotastic (or raw JSON score)
   */
  public static async importProject(file: File): Promise<PianotasticProject> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string);
          if (parsed && parsed.format === 'pianotastic' && parsed.score) {
            resolve(parsed as PianotasticProject);
          } else if (parsed && parsed.measures && parsed.metadata) {
            // Raw score file, construct full project
            const score = parsed as Score;
            resolve({
              format: 'pianotastic',
              version: '2.0.0',
              lastSavedAt: new Date().toISOString(),
              score,
              learningLayer: score.learningLayer || DEFAULT_LEARNING_LAYER,
              playbackSettings: {
                tempoBpm: score.metadata.tempoBpm || 108,
                tempoBeatUnit: score.metadata.tempoBeatUnit || 'quarter',
                metronomeOn: false,
                metronomeVolume: 0.7,
                accentFirstBeat: true,
              },
              midiSettings: {
                mode: 'playback',
                quantization: 'quarter',
                selectedChannel: 0,
                velocitySensitive: true,
              },
              brandingSettings: {
                showAcademyBranding: score.layoutSettings.showAcademyBranding ?? true,
                academyFooterText: score.layoutSettings.academyFooterText || 'Pianotastic Academy — Pianotastic Notation Studio',
              },
            });
          } else {
            reject(new Error('Invalid Pianotastic project format. File must contain valid score data.'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Import score from JSON file (.pianotastic)
   */
  public static async importJSON(file: File): Promise<Score> {
    const proj = await this.importProject(file);
    return {
      ...proj.score,
      learningLayer: proj.learningLayer,
    };
  }

  /**
   * Export high-resolution vector PDF using the canonical PrintableScoreDocument.
   * Consumes the exact same structured data, coordinates, typography, barlines,
   * accidentals, and octave superscripts as Print Preview.
   */
  public static async exportPDF(
    score: Score,
    mode: 'professional' | 'practice_sheet' = 'professional',
    filename?: string,
    options?: PrintableDocumentOptions,
    targetPageIndices?: number[]
  ) {
    const doc = buildPrintableScoreDocument(score, options);
    const pdf = renderCanonicalDocumentToPdf(doc, targetPageIndices, mode);

    const modeSuffix = mode === 'practice_sheet' ? ' (Pianotastic Practice Sheet)' : ' (Professional Score)';
    const cleanTitle = (filename || doc.title || 'Score').replace(/[/\\?%*:|"<>]/g, '_');
    pdf.save(`${cleanTitle}${modeSuffix}.pdf`);
  }

  /**
   * Export already built canonical PrintableScoreDocument directly to PDF
   */
  public static async exportDocumentToPdf(
    doc: PrintableScoreDocument,
    filename?: string,
    targetPageIndices?: number[],
    mode: 'professional' | 'practice_sheet' = 'professional'
  ) {
    const pdf = renderCanonicalDocumentToPdf(doc, targetPageIndices, mode);
    const modeSuffix = mode === 'practice_sheet' ? ' (Pianotastic Practice Sheet)' : ' (Professional Score)';
    const cleanTitle = (filename || doc.title || 'Score').replace(/[/\\?%*:|"<>]/g, '_');
    pdf.save(`${cleanTitle}${modeSuffix}.pdf`);
  }

  /**
   * Convenience method: Export Professional Score PDF
   */
  public static async exportProfessionalScorePDF(
    score: Score,
    filename?: string,
    options?: PrintableDocumentOptions,
    targetPageIndices?: number[]
  ) {
    return this.exportPDF(score, 'professional', filename, options, targetPageIndices);
  }

  /**
   * Convenience method: Export Pianotastic Practice Sheet PDF
   */
  public static async exportPracticeSheetPDF(
    score: Score,
    filename?: string,
    options?: PrintableDocumentOptions,
    targetPageIndices?: number[]
  ) {
    return this.exportPDF(score, 'practice_sheet', filename, options, targetPageIndices);
  }

  /**
   * Browser native print dialog
   */
  public static printScore() {
    window.print();
  }

  /**
   * Generate valid MusicXML 3.1 / 4.0 file including repeats, endings, and navigation
   */
  public static exportMusicXML(score: Score, filename?: string) {
    const xml = this.generateMusicXML(score);
    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
    this.triggerDownload(blob, `${filename || score.metadata.title || 'Score'}.musicxml`);
  }

  public static generateMusicXML(score: Score): string {
    const { metadata, measures } = score;
    const initialKey = KEY_SIGNATURES[metadata.initialKeySignature] || KEY_SIGNATURES['C_major'];
    const ts = metadata.initialTimeSignature;

    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC
    "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>${this.escapeXML(metadata.title)}</work-title>
  </work>
  <identification>
    <creator type="composer">${this.escapeXML(metadata.composer)}</creator>
    ${metadata.lyricist ? `<creator type="lyricist">${this.escapeXML(metadata.lyricist)}</creator>` : ''}
    ${metadata.arranger ? `<creator type="arranger">${this.escapeXML(metadata.arranger)}</creator>` : ''}
    <rights>${this.escapeXML(metadata.copyright)}</rights>
    <encoding>
      <software>Pianotastic Notation Studio</software>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <score-instrument id="P1-I1">
        <instrument-name>Acoustic Grand Piano</instrument-name>
      </score-instrument>
      <midi-instrument id="P1-I1">
        <midi-program>1</midi-program>
      </midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
`;

    measures.forEach((m, mIdx) => {
      const isFirst = mIdx === 0;
      xml += `    <measure number="${m.measureNumber}">\n`;

      // Repeat Start barline
      if (m.repeatStart || m.barlineType === 'repeat_start' || m.barlineType === 'repeat_both') {
        xml += `      <barline location="left">
        <bar-style>heavy-light</bar-style>
        <repeat direction="forward"/>
      </barline>\n`;
      }

      // Volta 1st/2nd/3rd Ending start
      if (m.voltaEnding) {
        xml += `      <barline location="left">
        <ending number="${m.voltaEnding}" type="start">${m.voltaEnding}.</ending>
      </barline>\n`;
      }

      // Initial attributes
      if (isFirst) {
        xml += `      <attributes>
        <divisions>4</divisions>
        <key>
          <fifths>${initialKey.fifths}</fifths>
          <mode>${initialKey.mode}</mode>
        </key>
        <time>
          <beats>${ts.numerator}</beats>
          <beat-type>${ts.denominator}</beat-type>
        </time>
        <staves>2</staves>
        <clef number="1">
          <sign>G</sign>
          <line>2</line>
        </clef>
        <clef number="2">
          <sign>F</sign>
          <line>4</line>
        </clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>${metadata.tempoBeatUnit || 'quarter'}</beat-unit>
            <per-minute>${metadata.tempoBpm}</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="${metadata.tempoBpm}"/>
      </direction>\n`;
      }

      // Mid-measure tempo change
      if (m.tempoBpm && !isFirst) {
        xml += `      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>${m.tempoBeatUnit || 'quarter'}</beat-unit>
            <per-minute>${m.tempoBpm}</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="${m.tempoBpm}"/>
      </direction>\n`;
      }

      // Navigation Targets: Segno, Coda
      if (m.navigationTarget === 'Segno') {
        xml += `      <direction placement="above">
        <direction-type><segno/></direction-type>
        <sound segno="segno"/>
      </direction>\n`;
      }
      if (m.navigationTarget === 'Coda') {
        xml += `      <direction placement="above">
        <direction-type><coda/></direction-type>
        <sound coda="coda"/>
      </direction>\n`;
      }
      if (m.navigationTarget === 'Fine') {
        xml += `      <direction placement="above">
        <direction-type><words font-weight="bold" font-style="italic">Fine</words></direction-type>
        <sound fine="fine"/>
      </direction>\n`;
      }

      // Chord symbols
      if (m.chordSymbols && m.chordSymbols.length > 0) {
        m.chordSymbols.forEach((cs) => {
          xml += `      <harmony>
        <root>
          <root-step>${cs.root.charAt(0)}</root-step>
          ${cs.root.includes('#') ? '<root-alter>1</root-alter>' : cs.root.includes('b') ? '<root-alter>-1</root-alter>' : ''}
        </root>
        <kind text="${this.escapeXML(cs.formatted)}">${cs.quality.toLowerCase().includes('m') ? 'minor' : 'major'}</kind>
        ${cs.bass ? `<bass><bass-step>${cs.bass.charAt(0)}</bass-step></bass>` : ''}
      </harmony>\n`;
        });
      }

      // Voice 1 (RH Staff 1)
      this.writeEventsToXML(m.rhEvents, 1, 1, (str) => {
        xml += str;
      });

      // Voice 2 (LH Staff 2)
      if (m.lhEvents && m.lhEvents.length > 0) {
        const curTs = m.timeSignature || ts;
        xml += `      <backup>
        <duration>${((curTs.numerator * 4) / curTs.denominator) * 4}</duration>
      </backup>\n`;
        this.writeEventsToXML(m.lhEvents, 2, 2, (str) => {
          xml += str;
        });
      }

      // Navigation Jumps: To Coda, D.C., D.S.
      if (m.navigationJump && m.navigationJump !== 'none') {
        xml += `      <direction placement="above">
        <direction-type><words font-weight="bold" font-style="italic">${m.navigationJump}</words></direction-type>
      </direction>\n`;
      }

      // Repeat End barline & Volta stop
      const isRepeatEnd = m.repeatEnd || m.barlineType === 'repeat_end' || m.barlineType === 'repeat_both';
      if (isRepeatEnd || m.voltaEnding) {
        xml += `      <barline location="right">
        ${isRepeatEnd ? `<bar-style>light-heavy</bar-style><repeat direction="backward" times="${m.repeatCount || 2}"/>` : ''}
        ${m.voltaEnding ? `<ending number="${m.voltaEnding}" type="stop"/>` : ''}
      </barline>\n`;
      } else if (m.barlineType === 'double') {
        xml += `      <barline location="right"><bar-style>light-light</bar-style></barline>\n`;
      } else if (m.barlineType === 'end') {
        xml += `      <barline location="right"><bar-style>light-heavy</bar-style></barline>\n`;
      }

      xml += `    </measure>\n`;
    });

    xml += `  </part>
</score-partwise>`;

    return xml;
  }

  /**
   * Import MusicXML file into internal Score model
   */
  public static async importMusicXML(file: File): Promise<Score> {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');

    const titleEl = xmlDoc.querySelector('work-title') || xmlDoc.querySelector('movement-title');
    const composerEl = xmlDoc.querySelector('creator[type="composer"]');
    const lyricistEl = xmlDoc.querySelector('creator[type="lyricist"]');
    const rightsEl = xmlDoc.querySelector('rights');

    const title = titleEl?.textContent || file.name.replace(/\.(musicxml|xml)$/i, '');
    const composer = composerEl?.textContent || 'Unknown Composer';
    const lyricist = lyricistEl?.textContent || '';
    const copyright = rightsEl?.textContent || '';

    // Measure elements
    const measureEls = xmlDoc.querySelectorAll('measure');
    const parsedMeasures: Measure[] = [];

    let currentFifths = 0;
    let currentBeats = 4;
    let currentBeatType = 4;
    let currentTempo = 100;

    const keySigFifthsMap: Record<number, string> = {
      0: 'C_major',
      1: 'G_major',
      2: 'D_major',
      3: 'A_major',
      4: 'E_major',
      5: 'B_major',
      6: 'F_sharp_major',
      '-1': 'F_major',
      '-2': 'B_flat_major',
      '-3': 'E_flat_major',
      '-4': 'A_flat_major',
      '-5': 'D_flat_major',
      '-6': 'G_flat_major',
    };

    measureEls.forEach((mEl, idx) => {
      const mNum = parseInt(mEl.getAttribute('number') || `${idx + 1}`) || idx + 1;

      // Attributes check
      const fifthsEl = mEl.querySelector('key > fifths');
      if (fifthsEl) currentFifths = parseInt(fifthsEl.textContent || '0');

      const beatsEl = mEl.querySelector('time > beats');
      const beatTypeEl = mEl.querySelector('time > beat-type');
      if (beatsEl && beatTypeEl) {
        currentBeats = parseInt(beatsEl.textContent || '4');
        currentBeatType = parseInt(beatTypeEl.textContent || '4');
      }

      const tempoEl = mEl.querySelector('sound[tempo]');
      if (tempoEl) currentTempo = parseInt(tempoEl.getAttribute('tempo') || '100');

      // Repeats & Navigation
      const repeatForward = mEl.querySelector('repeat[direction="forward"]');
      const repeatBackward = mEl.querySelector('repeat[direction="backward"]');
      const repeatCount = repeatBackward?.getAttribute('times') ? parseInt(repeatBackward.getAttribute('times')!) : undefined;

      const endingEl = mEl.querySelector('ending');
      let voltaEnding: VoltaEnding | undefined;
      if (endingEl && endingEl.getAttribute('number')) {
        const num = parseInt(endingEl.getAttribute('number')!);
        if (num === 1 || num === 2 || num === 3) {
          voltaEnding = num as VoltaEnding;
        }
      }

      let navTarget: NavigationTarget = 'none';
      if (mEl.querySelector('segno')) navTarget = 'Segno';
      if (mEl.querySelector('coda')) navTarget = 'Coda';
      if (mEl.textContent?.includes('Fine')) navTarget = 'Fine';

      let navJump: NavigationJump = 'none';
      const wordsEls = mEl.querySelectorAll('words');
      wordsEls.forEach((w) => {
        const txt = w.textContent?.trim() || '';
        if (txt.includes('D.C. al Fine')) navJump = 'D.C. al Fine';
        else if (txt.includes('D.C. al Coda')) navJump = 'D.C. al Coda';
        else if (txt.includes('D.C.')) navJump = 'D.C.';
        else if (txt.includes('D.S. al Fine')) navJump = 'D.S. al Fine';
        else if (txt.includes('D.S. al Coda')) navJump = 'D.S. al Coda';
        else if (txt.includes('D.S.')) navJump = 'D.S.';
        else if (txt.includes('To Coda')) navJump = 'To Coda';
      });

      // Parse Notes
      const rhEvents: NoteEvent[] = [];
      const lhEvents: NoteEvent[] = [];
      const noteEls = mEl.querySelectorAll('note');

      noteEls.forEach((nEl, nIdx) => {
        const staffNum = nEl.querySelector('staff')?.textContent === '2' ? 2 : 1;
        const isRest = !!nEl.querySelector('rest');
        const typeEl = nEl.querySelector('type')?.textContent || 'quarter';
        const isDotted = !!nEl.querySelector('dot');
        const lyricEl = nEl.querySelector('lyric text');
        const lyricText = lyricEl?.textContent || undefined;
        const isHyphen = nEl.querySelector('syllabic')?.textContent === 'middle';

        const duration = (
          typeEl === 'whole' || typeEl === 'half' || typeEl === 'quarter' ||
          typeEl === 'eighth' || typeEl === 'sixteenth' || typeEl === 'thirty_second'
            ? typeEl
            : 'quarter'
        ) as NoteEvent['duration'];

        const pitches: Pitch[] = [];
        if (!isRest) {
          const step = (nEl.querySelector('step')?.textContent || 'C') as NoteStep;
          const octave = parseInt(nEl.querySelector('octave')?.textContent || '4');
          const alter = parseInt(nEl.querySelector('alter')?.textContent || '0');
          const accidental: AccidentalType | null = alter === 1 ? 'sharp' : alter === -1 ? 'flat' : null;

          pitches.push({ step, octave, accidental });
        }

        const ev: NoteEvent = {
          id: `imp_m${mNum}_${staffNum}_${nIdx}`,
          type: isRest ? 'rest' : 'note',
          pitches,
          duration,
          isDotted,
          lyricSyllable: lyricText,
          lyricHyphen: isHyphen,
        };

        if (staffNum === 2) {
          lhEvents.push(ev);
        } else {
          rhEvents.push(ev);
        }
      });

      parsedMeasures.push({
        id: `m_${mNum}`,
        measureNumber: mNum,
        timeSignature: idx === 0 ? { numerator: currentBeats, denominator: currentBeatType } : undefined,
        keySignature: keySigFifthsMap[currentFifths] || 'C_major',
        barlineType: repeatBackward ? 'repeat_end' : repeatForward ? 'repeat_start' : 'single',
        repeatStart: !!repeatForward,
        repeatEnd: !!repeatBackward,
        repeatCount,
        voltaEnding,
        navigationTarget: navTarget,
        navigationJump: navJump,
        rhEvents: rhEvents.length > 0 ? rhEvents : [{ id: `m${mNum}_rh_rest`, type: 'rest', pitches: [], duration: 'whole' }],
        lhEvents: lhEvents.length > 0 ? lhEvents : [{ id: `m${mNum}_lh_rest`, type: 'rest', pitches: [], duration: 'whole' }],
        chordSymbols: [],
      });
    });

    const score: Score = {
      id: `imported_${Date.now()}`,
      version: '1.0',
      metadata: {
        title,
        subtitle: '',
        composer,
        lyricist,
        copyright,
        tempoBpm: currentTempo,
        tempoBeatUnit: 'quarter',
        initialTimeSignature: { numerator: currentBeats, denominator: currentBeatType },
        initialKeySignature: keySigFifthsMap[currentFifths] || 'C_major',
      },
      layoutSettings: {
        pageSize: 'A4',
        orientation: 'portrait',
        layoutMode: 'auto',
        measuresPerSystemAuto: 3,
        pageMargins: { top: 40, right: 36, bottom: 40, left: 36 },
        showMeasureNumbers: true,
        showAnnotations: true,
        showNoteNames: false,
        showFingering: true,
        showHandLabels: true,
        showLyrics: true,
        showChordSymbols: true,
        showAcademyBranding: true,
        academyFooterText: 'Pianotastic Academy — Pianotastic Notation Studio',
        zoom: 1.0,
      },
      measures: parsedMeasures.length > 0 ? parsedMeasures : [
        {
          id: 'm1',
          measureNumber: 1,
          barlineType: 'single',
          rhEvents: [{ id: 'm1_rh_rest', type: 'rest', pitches: [], duration: 'whole' }],
          lhEvents: [{ id: 'm1_lh_rest', type: 'rest', pitches: [], duration: 'whole' }],
          chordSymbols: [],
        }
      ],
    };

    return score;
  }

  private static writeEventsToXML(
    events: NoteEvent[],
    voice: number,
    staff: number,
    writer: (s: string) => void
  ) {
    const DURATION_TO_DIVISIONS: Record<string, number> = {
      whole: 16,
      half: 8,
      quarter: 4,
      eighth: 2,
      sixteenth: 1,
      thirty_second: 0.5,
    };

    events.forEach((ev) => {
      const baseDiv = DURATION_TO_DIVISIONS[ev.duration] || 4;
      const divisions = ev.isDotted ? baseDiv * 1.5 : baseDiv;

      if (ev.type === 'rest') {
        writer(`      <note>
        <rest/>
        <duration>${divisions}</duration>
        <voice>${voice}</voice>
        <type>${ev.duration}</type>
        ${ev.isDotted ? '<dot/>' : ''}
        <staff>${staff}</staff>
      </note>\n`);
      } else {
        ev.pitches.forEach((p, pIdx) => {
          if (!p || !p.step) return;
          const alter = p.accidental === 'sharp' ? 1 : p.accidental === 'flat' ? -1 : 0;
          writer(`      <note>
        ${pIdx > 0 ? '<chord/>' : ''}
        <pitch>
          <step>${p.step}</step>
          ${alter !== 0 ? `<alter>${alter}</alter>` : ''}
          <octave>${p.octave}</octave>
        </pitch>
        <duration>${divisions}</duration>
        <voice>${voice}</voice>
        <type>${ev.duration}</type>
        ${ev.isDotted ? '<dot/>' : ''}
        ${ev.fingerNumber ? `<notations><technical><fingering>${ev.fingerNumber}</fingering></technical></notations>` : ''}
        ${ev.lyricSyllable && pIdx === 0 ? `<lyric><text>${this.escapeXML(ev.lyricSyllable)}</text>${ev.lyricHyphen ? '<syllabic>middle</syllabic>' : '<syllabic>single</syllabic>'}</lyric>` : ''}
        <staff>${staff}</staff>
      </note>\n`);
        });
      }
    });
  }

  /**
   * Export standard MIDI Type 1 file respecting full playback route (repeats, voltas, D.C./D.S., tempo)
   */
  public static exportMIDI(score: Score, filename?: string) {
    const bytes = this.generateMidiBytes(score);
    const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
    this.triggerDownload(blob, `${filename || score.metadata.title || 'Score'}.mid`);
  }

  private static generateMidiBytes(score: Score): number[] {
    const ticksPerQuarter = 480;
    const bpm = score.metadata.tempoBpm || 100;
    const microsecondsPerQuarter = Math.round(60000000 / bpm);

    // Calculate full route respecting repeats and endings!
    const routeValidation = calculatePlaybackRoute(
      score.measures,
      score.metadata.tempoBpm,
      score.metadata.initialTimeSignature,
      score.metadata.initialKeySignature
    );
    const routeSteps = routeValidation.route;

    // Header Chunk: Type 1, 2 tracks
    const header: number[] = [
      0x4d, 0x54, 0x68, 0x64, // "MThd"
      0x00, 0x00, 0x00, 0x06, // length 6
      0x00, 0x01,             // format 1 (multi-track)
      0x00, 0x02,             // 2 tracks (Tempo track + Piano Notes track)
      (ticksPerQuarter >> 8) & 0xff,
      ticksPerQuarter & 0xff,
    ];

    // Track 0: Tempo & Time Signature meta events
    const track0Events: number[] = [
      0x00, 0xff, 0x58, 0x04,
      score.metadata.initialTimeSignature.numerator,
      Math.log2(score.metadata.initialTimeSignature.denominator),
      24, 8,
      0x00, 0xff, 0x51, 0x03,
      (microsecondsPerQuarter >> 16) & 0xff,
      (microsecondsPerQuarter >> 8) & 0xff,
      microsecondsPerQuarter & 0xff,
      0x00, 0xff, 0x03, 0x0b,
      ...Array.from('Pianotastic').map((c) => c.charCodeAt(0)),
      0x00, 0xff, 0x2f, 0x00,
    ];

    const track0Chunk: number[] = [
      0x4d, 0x54, 0x72, 0x6b,
      (track0Events.length >> 24) & 0xff,
      (track0Events.length >> 16) & 0xff,
      (track0Events.length >> 8) & 0xff,
      track0Events.length & 0xff,
      ...track0Events,
    ];

    // Track 1: Piano Notes according to calculated route
    const track1Events: number[] = [];
    track1Events.push(0x00, 0xc0, 0x00); // Program change: Acoustic Grand Piano (0)

    let lastTick = 0;
    const allEvents: { tick: number; type: 'on' | 'off'; note: number; velocity: number }[] = [];

    let currentTick = 0;
    routeSteps.forEach((step) => {
      const m = score.measures[step.measureIndex];
      if (!m) return;
      const keySig = step.keySignature || m.keySignature || score.metadata.initialKeySignature || 'C_major';

      // RH Notes
      let rhTick = currentTick;
      m.rhEvents.forEach((ev) => {
        const beats = getEventBeats(ev);
        const durationTicks = Math.round(beats * ticksPerQuarter);
        if (ev.type === 'note') {
          ev.pitches.forEach((p) => {
            const noteNum = getMidiNote(p, keySig);
            allEvents.push({ tick: rhTick, type: 'on', note: noteNum, velocity: 85 });
            allEvents.push({ tick: rhTick + durationTicks - 12, type: 'off', note: noteNum, velocity: 0 });
          });
        }
        rhTick += durationTicks;
      });

      // LH Notes
      let lhTick = currentTick;
      m.lhEvents.forEach((ev) => {
        const beats = getEventBeats(ev);
        const durationTicks = Math.round(beats * ticksPerQuarter);
        if (ev.type === 'note') {
          ev.pitches.forEach((p) => {
            const noteNum = getMidiNote(p, keySig);
            allEvents.push({ tick: lhTick, type: 'on', note: noteNum, velocity: 80 });
            allEvents.push({ tick: lhTick + durationTicks - 12, type: 'off', note: noteNum, velocity: 0 });
          });
        }
        lhTick += durationTicks;
      });

      const ts = step.timeSignature || m.timeSignature || score.metadata.initialTimeSignature;
      const measureTicks = Math.round(((ts.numerator * 4) / ts.denominator) * ticksPerQuarter);
      currentTick += measureTicks;
    });

    allEvents.sort((a, b) => a.tick - b.tick);

    allEvents.forEach((e) => {
      const delta = Math.max(0, e.tick - lastTick);
      lastTick = e.tick;
      this.writeVarLen(track1Events, delta);
      if (e.type === 'on') {
        track1Events.push(0x90, e.note, e.velocity);
      } else {
        track1Events.push(0x80, e.note, 0x00);
      }
    });

    track1Events.push(0x00, 0xff, 0x2f, 0x00); // End of track

    const track1Chunk: number[] = [
      0x4d, 0x54, 0x72, 0x6b,
      (track1Events.length >> 24) & 0xff,
      (track1Events.length >> 16) & 0xff,
      (track1Events.length >> 8) & 0xff,
      track1Events.length & 0xff,
      ...track1Events,
    ];

    return [...header, ...track0Chunk, ...track1Chunk];
  }

  private static writeVarLen(arr: number[], val: number) {
    let buffer = val & 0x7f;
    while ((val >>= 7) > 0) {
      buffer <<= 8;
      buffer |= 0x80;
      buffer += val & 0x7f;
    }
    while (true) {
      arr.push(buffer & 0xff);
      if (buffer & 0x80) {
        buffer >>= 8;
      } else {
        break;
      }
    }
  }

  private static escapeXML(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private static triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
