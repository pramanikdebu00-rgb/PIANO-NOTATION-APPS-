import React from 'react';
import { Score, Measure, HandTemplate, Pitch } from '../../types/score';
import {
  getAccidentalGlyph,
  getSuperscriptOctave,
  getMeasureBeatPitches,
  getMeasureTotalBeats,
  isBeatLockedByPickup,
} from '../../utils/pianotasticNotation';
import { KEY_SIGNATURES } from '../../utils/musicTheory';
import { calculateAccidentalLayout, AccidentalVectorGlyph } from '../../utils/accidentalLayout';

interface ScoreMiniaturePreviewProps {
  score: Score;
  handTemplate?: HandTemplate;
  className?: string;
}

export const ScoreMiniaturePreview: React.FC<ScoreMiniaturePreviewProps> = ({
  score,
  handTemplate: propHandTemplate,
  className = '',
}) => {
  const hand = propHandTemplate || score.metadata.handTemplate || 'Both';
  const initialTs = score.metadata.initialTimeSignature || { numerator: 4, denominator: 4 };
  const pickupBeat = score.metadata.pickupBeat || 1;
  const keySigId = score.metadata.initialKeySignature || 'C_major';
  const keyInfo = KEY_SIGNATURES[keySigId];

  // Show up to the first 3 or 4 measures to provide a clear, readable miniature
  const rawMeasures = score.measures && score.measures.length > 0 ? score.measures : [];
  const measuresCount = rawMeasures.length;
  const numToDisplay = Math.min(3, Math.max(1, measuresCount));
  const previewMeasures = rawMeasures.slice(0, numToDisplay);

  const isBoth = hand === 'Both';
  const svgWidth = 440;
  const svgHeight = isBoth ? 120 : 76;

  // Header column: Clef, Key signature, Time signature
  const headerWidth = 46;
  const availableContentWidth = svgWidth - headerWidth - 12;
  const measureWidth = availableContentWidth / numToDisplay;

  // Staff positions
  // Treble staff lines (y: 16 to 40)
  const rhLines = [16, 22, 28, 34, 40];
  const rhNoteY = 31; // Center line for note text
  // Bass staff lines (y: 68 to 92)
  const lhLines = [68, 74, 80, 86, 92];
  const lhNoteY = 83;

  // For single staff (RH only or LH only)
  const singleLines = [22, 28, 34, 40, 46];
  const singleNoteY = 37;

  // Helper to extract chord text
  const getChord = (m: Measure, bIdx: number): string | undefined => {
    if (m.beatChords && m.beatChords[bIdx]) {
      return m.beatChords[bIdx];
    }
    if (m.chordSymbols && m.chordSymbols.length > 0) {
      const cs = m.chordSymbols.find((c) => Math.floor(c.beatOffset) === bIdx);
      return cs?.formatted || (cs ? `${cs.root}${cs.quality || ''}` : undefined);
    }
    return undefined;
  };

  return (
    <div
      className={`w-full h-full flex items-center justify-center select-none ${className}`}
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background Paper Tone */}
        <rect
          x="0"
          y="0"
          width={svgWidth}
          height={svgHeight}
          fill="#faf8f4"
          rx="6"
        />

        {/* 1. STAFF LINES & GRAND BRACE */}
        {isBoth ? (
          <>
            {/* System start bracket */}
            <line
              x1={8}
              y1={14}
              x2={8}
              y2={94}
              stroke="#44403c"
              strokeWidth="2"
              strokeLinecap="square"
            />
            {/* Treble 5 lines */}
            {rhLines.map((y, i) => (
              <line
                key={`rh-line-${i}`}
                x1={8}
                y1={y}
                x2={svgWidth - 10}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="0.85"
              />
            ))}
            {/* Bass 5 lines */}
            {lhLines.map((y, i) => (
              <line
                key={`lh-line-${i}`}
                x1={8}
                y1={y}
                x2={svgWidth - 10}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="0.85"
              />
            ))}

            {/* Clef Glyphs */}
            <text
              x={13}
              y={35}
              fontSize="20"
              fill="#292524"
              fontFamily="serif"
              className="select-none"
            >
              𝄞
            </text>
            <text
              x={14}
              y={84}
              fontSize="14"
              fill="#292524"
              fontFamily="serif"
              className="select-none"
            >
              𝄢
            </text>
          </>
        ) : (
          <>
            {/* Single staff start line */}
            <line
              x1={8}
              y1={18}
              x2={8}
              y2={50}
              stroke="#44403c"
              strokeWidth="1.75"
              strokeLinecap="square"
            />
            {/* 5 lines */}
            {singleLines.map((y, i) => (
              <line
                key={`single-line-${i}`}
                x1={8}
                y1={y}
                x2={svgWidth - 10}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="0.85"
              />
            ))}
            {/* Clef */}
            <text
              x={13}
              y={hand === 'LH' ? 40 : 41}
              fontSize={hand === 'LH' ? '17' : '22'}
              fill="#292524"
              fontFamily="serif"
              className="select-none"
            >
              {hand === 'LH' ? '𝄢' : '𝄞'}
            </text>
          </>
        )}

        {/* 2. TIME SIGNATURE (Fraction) */}
        {isBoth ? (
          <>
            {/* RH Time Sig */}
            <text
              x={35}
              y={25}
              fontSize="10"
              fontWeight="bold"
              fill="#44403c"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              textAnchor="middle"
            >
              {initialTs.numerator}
            </text>
            <text
              x={35}
              y={37}
              fontSize="10"
              fontWeight="bold"
              fill="#44403c"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              textAnchor="middle"
            >
              {initialTs.denominator}
            </text>

            {/* LH Time Sig */}
            <text
              x={35}
              y={77}
              fontSize="10"
              fontWeight="bold"
              fill="#44403c"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              textAnchor="middle"
            >
              {initialTs.numerator}
            </text>
            <text
              x={35}
              y={89}
              fontSize="10"
              fontWeight="bold"
              fill="#44403c"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              textAnchor="middle"
            >
              {initialTs.denominator}
            </text>
          </>
        ) : (
          <>
            <text
              x={35}
              y={31}
              fontSize="10"
              fontWeight="bold"
              fill="#44403c"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              textAnchor="middle"
            >
              {initialTs.numerator}
            </text>
            <text
              x={35}
              y={43}
              fontSize="10"
              fontWeight="bold"
              fill="#44403c"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              textAnchor="middle"
            >
              {initialTs.denominator}
            </text>
          </>
        )}

        {/* Start barline after time signature */}
        <line
          x1={headerWidth}
          y1={isBoth ? 14 : 20}
          x2={headerWidth}
          y2={isBoth ? 94 : 48}
          stroke="#78716c"
          strokeWidth="1.2"
        />

        {/* 3. MEASURES & NOTES */}
        {previewMeasures.map((measure, mIdx) => {
          const mX = headerWidth + mIdx * measureWidth;
          const mRightX = mX + measureWidth;
          const ts = measure.timeSignature || initialTs;
          const totalBeats = getMeasureTotalBeats(measure, ts, score.metadata?.indianTaal);
          const beatWidth = measureWidth / Math.max(1, totalBeats);

          // Get pitches for RH (or single staff)
          const rhBeatPitches = getMeasureBeatPitches(measure, totalBeats, 'RH');
          // Get pitches for LH (if Both)
          const lhBeatPitches = isBoth
            ? getMeasureBeatPitches(measure, totalBeats, 'LH')
            : [];

          return (
            <g key={`m-${measure.id || mIdx}`}>
              {/* Measure Number Label */}
              <text
                x={mX + 4}
                y={isBoth ? 10 : 14}
                fontSize="8"
                fontWeight="bold"
                fill="#64748b"
                fontFamily="'Plus Jakarta Sans', sans-serif"
              >
                {measure.measureNumber || mIdx + 1}
                {mIdx === 0 && pickupBeat > 1 && (
                  <tspan fill="#d97706" fontSize="7">
                    {' '}
                    (P)
                  </tspan>
                )}
              </text>

              {/* Measure Section Label if any */}
              {measure.sectionName && (
                <text
                  x={mX + measureWidth / 2}
                  y={isBoth ? 10 : 14}
                  fontSize="7.5"
                  fontWeight="bold"
                  fill="#0f172a"
                  fontFamily="'Plus Jakarta Sans', sans-serif"
                  textAnchor="middle"
                >
                  {measure.sectionName.toUpperCase()}
                </text>
              )}

              {/* Right Barline */}
              <line
                x1={mRightX}
                y1={isBoth ? 14 : 20}
                x2={mRightX}
                y2={isBoth ? 94 : 48}
                stroke="#78716c"
                strokeWidth={mIdx === previewMeasures.length - 1 && measuresCount <= numToDisplay ? 1.5 : 1}
              />

              {/* Beats */}
              {Array.from({ length: totalBeats }, (_, bIdx) => {
                const bX = mX + bIdx * beatWidth;
                const bCenterX = bX + beatWidth / 2;
                const isLocked = isBeatLockedByPickup(
                  measure.measureNumber || mIdx + 1,
                  bIdx,
                  pickupBeat
                );

                const chord = getChord(measure, bIdx);
                const lyric = measure.beatLyrics?.[bIdx];

                // RH Pitches (or Single Staff)
                const rhPitches = rhBeatPitches[bIdx] || [];
                // LH Pitches
                const lhPitches = lhBeatPitches[bIdx] || [];

                return (
                  <g key={`m-${mIdx}-b-${bIdx}`}>
                    {/* Chord Symbol above Staff */}
                    {chord && (
                      <text
                        x={bCenterX}
                        y={isBoth ? 12 : 14}
                        fontSize="8.5"
                        fontWeight="bold"
                        fill="#b45309"
                        fontFamily="'Plus Jakarta Sans', sans-serif"
                        textAnchor="middle"
                      >
                        {chord}
                      </text>
                    )}

                    {/* Locked Pickup Highlight */}
                    {isLocked && (
                      <rect
                        x={bX}
                        y={isBoth ? 14 : 20}
                        width={beatWidth}
                        height={isBoth ? 80 : 30}
                        fill="#f1f5f9"
                        fillOpacity="0.6"
                      />
                    )}

                    {/* RH NOTATION OR SINGLE NOTATION */}
                    {(() => {
                      const noteY = isBoth ? rhNoteY : singleNoteY;
                      if (isLocked) {
                        return (
                          <text
                            x={bCenterX}
                            y={noteY}
                            fontSize="9"
                            fontWeight="bold"
                            fill="#cbd5e1"
                            textAnchor="middle"
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                          >
                            —
                          </text>
                        );
                      }

                      if (rhPitches.length === 0) {
                        return (
                          <text
                            x={bCenterX}
                            y={noteY}
                            fontSize="10"
                            fontWeight="bold"
                            fill="#94a3b8"
                            textAnchor="middle"
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                          >
                            —
                          </text>
                        );
                      }

                      // Render pitch(es)
                      const count = rhPitches.length;
                      const subWidth = beatWidth / count;
                      return rhPitches.map((p, pIdx) => {
                        if (!p || !p.step) {
                          return (
                            <text
                              key={`p-${pIdx}`}
                              x={bX + pIdx * subWidth + subWidth / 2}
                              y={noteY}
                              fontSize="9"
                              fontWeight="bold"
                              fill="#94a3b8"
                              textAnchor="middle"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              {count > 1 ? '.' : '—'}
                            </text>
                          );
                        }

                        const subCenterX = bX + pIdx * subWidth + subWidth / 2;
                        const octChar = getSuperscriptOctave(
                          typeof p.octave === 'number' ? p.octave : 4
                        );
                        const fontSize = count > 2 ? 7.5 : count === 2 ? 8.5 : 9.5;
                        const layout = calculateAccidentalLayout(
                          {
                            noteX: subCenterX,
                            letterY: noteY,
                            letterSize: fontSize,
                            subBeatCount: count,
                          },
                          p.accidental
                        );

                        return (
                          <g key={`p-${pIdx}`} className="note-cluster-vector">
                            {layout.hasAccidental && layout.type && (
                              <AccidentalVectorGlyph
                                type={layout.type}
                                x={layout.accidentalX}
                                y={layout.accidentalY}
                                scale={layout.accidentalScale}
                                color="#0f172a"
                              />
                            )}
                            <text
                              x={layout.letterX}
                              y={layout.letterY}
                              fontSize={layout.letterSize}
                              fontWeight="bold"
                              fill="#0f172a"
                              textAnchor="middle"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              {p.step}
                            </text>
                            {octChar && (
                              <text
                                x={layout.octaveX}
                                y={layout.octaveY}
                                fontSize={layout.octaveSize}
                                fontWeight="bold"
                                fill="#334155"
                                textAnchor="middle"
                                fontFamily="'Plus Jakarta Sans', sans-serif"
                              >
                                {octChar}
                              </text>
                            )}
                          </g>
                        );
                      });
                    })()}

                    {/* LH NOTATION (Only for Both Hands Grand Staff) */}
                    {isBoth &&
                      (() => {
                        if (isLocked) {
                          return (
                            <text
                              x={bCenterX}
                              y={lhNoteY}
                              fontSize="9"
                              fontWeight="bold"
                              fill="#cbd5e1"
                              textAnchor="middle"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              —
                            </text>
                          );
                        }

                        if (lhPitches.length === 0) {
                          return (
                            <text
                              x={bCenterX}
                              y={lhNoteY}
                              fontSize="10"
                              fontWeight="bold"
                              fill="#94a3b8"
                              textAnchor="middle"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              —
                            </text>
                          );
                        }

                        const count = lhPitches.length;
                        const subWidth = beatWidth / count;
                        return lhPitches.map((p, pIdx) => {
                          if (!p || !p.step) {
                            return (
                              <text
                                key={`lhp-${pIdx}`}
                                x={bX + pIdx * subWidth + subWidth / 2}
                                y={lhNoteY}
                                fontSize="9"
                                fontWeight="bold"
                                fill="#94a3b8"
                                textAnchor="middle"
                                fontFamily="'Plus Jakarta Sans', sans-serif"
                              >
                                {count > 1 ? '.' : '—'}
                              </text>
                            );
                          }

                          const subCenterX = bX + pIdx * subWidth + subWidth / 2;
                          const octChar = getSuperscriptOctave(
                            typeof p.octave === 'number' ? p.octave : 3
                          );
                          const fontSize = count > 2 ? 7.5 : count === 2 ? 8.5 : 9.5;
                          const layout = calculateAccidentalLayout(
                            {
                              noteX: subCenterX,
                              letterY: lhNoteY,
                              letterSize: fontSize,
                              subBeatCount: count,
                            },
                            p.accidental
                          );

                          return (
                            <g key={`lhp-${pIdx}`} className="note-cluster-vector">
                              {layout.hasAccidental && layout.type && (
                                <AccidentalVectorGlyph
                                  type={layout.type}
                                  x={layout.accidentalX}
                                  y={layout.accidentalY}
                                  scale={layout.accidentalScale}
                                  color="#0f172a"
                                />
                              )}
                              <text
                                x={layout.letterX}
                                y={layout.letterY}
                                fontSize={layout.letterSize}
                                fontWeight="bold"
                                fill="#0f172a"
                                textAnchor="middle"
                                fontFamily="'Plus Jakarta Sans', sans-serif"
                              >
                                {p.step}
                              </text>
                              {octChar && (
                                <text
                                  x={layout.octaveX}
                                  y={layout.octaveY}
                                  fontSize={layout.octaveSize}
                                  fontWeight="bold"
                                  fill="#334155"
                                  textAnchor="middle"
                                  fontFamily="'Plus Jakarta Sans', sans-serif"
                                >
                                  {octChar}
                                </text>
                              )}
                            </g>
                          );
                        });
                      })()}

                    {/* Lyric text below staff if present */}
                    {lyric && (
                      <text
                        x={bCenterX}
                        y={isBoth ? 106 : 60}
                        fontSize="7.5"
                        fontWeight="600"
                        fill="#475569"
                        textAnchor="middle"
                        fontFamily="'Plus Jakarta Sans', sans-serif"
                      >
                        {lyric}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
