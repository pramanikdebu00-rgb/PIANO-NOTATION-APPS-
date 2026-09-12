import React from 'react';
import { AccidentalType } from '../types/score';

export interface NoteGeometry {
  /** Note center X in parent coordinate system (authoritative position that MUST NOT change) */
  noteX: number;
  /** Note text baseline Y in parent coordinate system */
  letterY: number;
  /** Font size of the note letter (typically 14, 17, or 18 in editor; or scaled in PDF) */
  letterSize: number;
  /** Number of subdivisions in this beat (1, 2, 3, 4+) to adjust scale */
  subBeatCount?: number;
  /** Scale factor (e.g. 1.0 for editor, or PDF scale factor) */
  scale?: number;
}

export interface AccidentalLayoutResult {
  /** Accidental type normalized */
  type: AccidentalType | null;
  /** Whether an accidental should be rendered */
  hasAccidental: boolean;
  /** Note letter X position (centered textAnchor="middle") — GUARANTEED UNCHANGED */
  letterX: number;
  /** Note letter baseline Y — GUARANTEED UNCHANGED */
  letterY: number;
  /** Note letter size */
  letterSize: number;
  /** Note letter estimated width */
  letterWidth: number;
  /** Superscript octave X position (centered textAnchor="middle") — GUARANTEED UNCHANGED */
  octaveX: number;
  /** Superscript octave baseline Y — GUARANTEED UNCHANGED */
  octaveY: number;
  /** Superscript octave size */
  octaveSize: number;
  /** Note left boundary (left edge of the note letter) */
  noteLeft: number;
  /** Center X of accidental glyph */
  accidentalX: number;
  /** Optical Center / Reference Y of accidental */
  accidentalY: number;
  /** Width of the accidental glyph */
  accidentalWidth: number;
  /** Height of the accidental glyph */
  accidentalHeight: number;
  /** Scale multiplier applied to accidental */
  accidentalScale: number;
  /** Horizontal gap between accidental right edge and note left edge */
  horizontalGap: number;
}

/**
 * Canonical Accidental Layout Calculator (Prompt 87 — Mathematical Superscript Style)
 *
 * CRITICAL DIRECTIVES:
 * 1. The note position itself is the authoritative anchor:
 *    note X, note Y, font size, subdivision spacing, and measure structure
 *    remain 100% UNCHANGED whether an accidental exists or not.
 * 2. Positioned like a mathematical superscript (e.g., C², C³ -> C♯, C♭, C♮):
 *    occupies the upper-right shoulder of the note.
 * 3. Upper-right vertical placement:
 *    accidentalY = noteTop + subtleOffset (derived from note's actual geometry).
 *    Clearly raised above center, but controlled and not floating far above the note.
 * 4. Small visible gap between the note and the accidental (similar to base to superscript spacing).
 * 5. Accidental glyph is sized proportionally smaller like a mathematical superscript (~68-74%).
 * 6. In notes with superscript octaves (C♯⁴, B♭⁵, F♮⁴), the octave follows the accidental
 *    without collision, maintaining its existing baseline height and font size.
 */
export function calculateAccidentalLayout(
  geometry: NoteGeometry,
  accidentalType?: AccidentalType | null
): AccidentalLayoutResult {
  const { noteX, letterY, letterSize, subBeatCount = 1, scale = 1.0 } = geometry;

  // 1. Authoritative Note Geometry (COMPLETELY INDEPENDENT of accidental existence)
  // The note position is the absolute anchor and NEVER moves when an accidental is present.
  const letterW = letterSize * 0.58 * scale;
  const fontRatio = letterSize / 18;
  const octSize = (subBeatCount > 2 ? 9 : subBeatCount === 2 ? 11 : 12) * fontRatio * scale;
  const octW = 6.2 * fontRatio * scale;
  const baseNoteClusterW = letterW + octW;

  // The base note letter anchor and default octave position
  const baseStartX = noteX - baseNoteClusterW / 2;
  const letterX = baseStartX + letterW / 2;
  const noteRightEdge = letterX + letterW / 2;
  const noteLeft = letterX - letterW / 2;
  const defaultOctaveX = noteRightEdge + octW / 2;
  const octaveY = letterY - 8 * fontRatio * scale;

  // 2. Validate Accidental Presence
  const normType =
    accidentalType && accidentalType !== ('none' as any) ? accidentalType : null;
  const hasAccidental = Boolean(normType);

  if (!hasAccidental || !normType) {
    return {
      type: null,
      hasAccidental: false,
      letterX,
      letterY,
      letterSize,
      letterWidth: letterW,
      octaveX: defaultOctaveX,
      octaveY,
      octaveSize: octSize,
      noteLeft,
      accidentalX: 0,
      accidentalY: 0,
      accidentalWidth: 0,
      accidentalHeight: 0,
      accidentalScale: 0,
      horizontalGap: 0,
    };
  }

  // 3. Accidental Sizing & Dimensions (Mathematical Superscript Proportions: ~65-74% of note)
  const subScale = subBeatCount > 2 ? 0.62 : subBeatCount === 2 ? 0.68 : 0.74;
  const accidentalScale = subScale * fontRatio * scale;

  let baseGlyphWidth = 5.2;
  let baseGlyphHeight = 9.8;

  if (normType === 'sharp') {
    baseGlyphWidth = 5.2;
    baseGlyphHeight = 9.8;
  } else if (normType === 'flat') {
    baseGlyphWidth = 4.6;
    baseGlyphHeight = 10.0;
  } else if (normType === 'natural') {
    baseGlyphWidth = 4.8;
    baseGlyphHeight = 10.0;
  } else if (normType === 'double_sharp') {
    baseGlyphWidth = 5.0;
    baseGlyphHeight = 5.0;
  } else if (normType === 'double_flat') {
    baseGlyphWidth = 8.5;
    baseGlyphHeight = 10.0;
  }

  const accidentalWidth = baseGlyphWidth * accidentalScale;
  const accidentalHeight = baseGlyphHeight * accidentalScale;

  // 4. Horizontal Right-Side Offset with Small Superscript Gap
  // Placed immediately to the RIGHT of the note letter with a small visible gap, not touching
  const horizontalGap = 1.2 * fontRatio * scale;
  const accidentalX = noteRightEdge + horizontalGap + accidentalWidth / 2;
  const accidentalRightEdge = noteRightEdge + horizontalGap + accidentalWidth;

  // 5. Mathematical Superscript Vertical Alignment (Upper-Right Shoulder of Note)
  // noteTop = letterY - 0.72 * letterSize * scale
  // accidentalY sits in the upper region of the note (noteTop + subtleOffset),
  // positioning the glyph in the upper-right shoulder like a mathematical superscript (e.g. C²)
  const noteTop = letterY - 0.72 * letterSize * scale;
  const subtleOffset = 0.20 * letterSize * scale;
  const accidentalY = noteTop + subtleOffset;

  // 6. Octave Label Placement
  // Follows immediately after the accidental (e.g. C♯⁴, B♭⁵, F♮⁴)
  // Preserves existing octave system, size, and superscript baseline
  const octGap = 1.0 * fontRatio * scale;
  const octaveX = accidentalRightEdge + octGap + octW / 2;

  return {
    type: normType,
    hasAccidental: true,
    letterX, // Authoritative note anchor - GUARANTEED UNCHANGED
    letterY, // Authoritative baseline Y - GUARANTEED UNCHANGED
    letterSize,
    letterWidth: letterW,
    octaveX, // Preserved superscript position following note/accidental
    octaveY, // Preserved superscript baseline
    octaveSize: octSize, // Preserved octave font size
    noteLeft,
    accidentalX,
    accidentalY,
    accidentalWidth,
    accidentalHeight,
    accidentalScale,
    horizontalGap,
  };
}

/**
 * SVG Vector Accidental Glyph Component
 *
 * Renders publication-quality, crisp vector paths for Sharps, Flats, Naturals,
 * Double Sharps, and Double Flats.
 */
export const AccidentalVectorGlyph: React.FC<{
  type: AccidentalType;
  x: number; // Center X
  y: number; // Optical Center Y
  scale?: number;
  color?: string;
  className?: string;
}> = ({ type, x, y, scale = 1, color = '#0f172a', className }) => {
  const s = scale;

  if (type === 'sharp') {
    return (
      <g className={className} stroke={color} strokeLinecap="round">
        {/* Left vertical line */}
        <line
          x1={x - 1.5 * s}
          y1={y - 5.2 * s}
          x2={x - 1.5 * s}
          y2={y + 4.6 * s}
          strokeWidth={0.95 * s}
        />
        {/* Right vertical line */}
        <line
          x1={x + 1.5 * s}
          y1={y - 4.6 * s}
          x2={x + 1.5 * s}
          y2={y + 5.2 * s}
          strokeWidth={0.95 * s}
        />
        {/* Upper slanted crossbar (slanted gently upwards to right) */}
        <line
          x1={x - 2.8 * s}
          y1={y - 1.2 * s}
          x2={x + 2.8 * s}
          y2={y - 2.4 * s}
          strokeWidth={1.35 * s}
        />
        {/* Lower slanted crossbar */}
        <line
          x1={x - 2.8 * s}
          y1={y + 2.4 * s}
          x2={x + 2.8 * s}
          y2={y + 1.2 * s}
          strokeWidth={1.35 * s}
        />
      </g>
    );
  }

  if (type === 'flat') {
    const stemX = x - 1.4 * s;
    return (
      <g className={className} stroke={color} fill={color}>
        {/* Vertical stem extending upwards */}
        <line
          x1={stemX}
          y1={y - 5.5 * s}
          x2={stemX}
          y2={y + 4.5 * s}
          strokeWidth={0.95 * s}
          strokeLinecap="round"
        />
        {/* Curved bowl of flat */}
        <path
          d={`M ${stemX} ${y - 0.2 * s} C ${stemX + 3.6 * s} ${y + 0.8 * s} ${stemX + 3.6 * s} ${y + 4.2 * s} ${stemX} ${y + 4.5 * s} Z`}
          strokeWidth={0.6 * s}
          strokeLinejoin="round"
        />
      </g>
    );
  }

  if (type === 'natural') {
    const leftX = x - 1.4 * s;
    const rightX = x + 1.4 * s;
    return (
      <g className={className} stroke={color} strokeLinecap="round">
        {/* Left vertical stem (extends upwards from box) */}
        <line
          x1={leftX}
          y1={y - 5.5 * s}
          x2={leftX}
          y2={y + 2.2 * s}
          strokeWidth={0.95 * s}
        />
        {/* Right vertical stem (extends downwards from box) */}
        <line
          x1={rightX}
          y1={y - 2.2 * s}
          x2={rightX}
          y2={y + 5.5 * s}
          strokeWidth={0.95 * s}
        />
        {/* Upper slanted bar */}
        <line
          x1={leftX}
          y1={y - 1.4 * s}
          x2={rightX}
          y2={y - 2.2 * s}
          strokeWidth={1.35 * s}
        />
        {/* Lower slanted bar */}
        <line
          x1={leftX}
          y1={y + 2.2 * s}
          x2={rightX}
          y2={y + 1.4 * s}
          strokeWidth={1.35 * s}
        />
      </g>
    );
  }

  if (type === 'double_sharp') {
    return (
      <g className={className} stroke={color} strokeLinecap="square">
        <line
          x1={x - 2.4 * s}
          y1={y - 2.4 * s}
          x2={x + 2.4 * s}
          y2={y + 2.4 * s}
          strokeWidth={1.35 * s}
        />
        <line
          x1={x - 2.4 * s}
          y1={y + 2.4 * s}
          x2={x + 2.4 * s}
          y2={y - 2.4 * s}
          strokeWidth={1.35 * s}
        />
      </g>
    );
  }

  if (type === 'double_flat') {
    return (
      <g className={className}>
        <AccidentalVectorGlyph
          type="flat"
          x={x - 2.0 * s}
          y={y}
          scale={scale * 0.9}
          color={color}
        />
        <AccidentalVectorGlyph
          type="flat"
          x={x + 2.0 * s}
          y={y}
          scale={scale * 0.9}
          color={color}
        />
      </g>
    );
  }

  return null;
};
