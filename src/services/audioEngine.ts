import { NoteEvent, Pitch, Measure, Score, TempoBeatUnit, TimeSignature } from '../types/score';
import { getMidiNote, midiToFrequency, getEventBeats, parseChordToMidiNotes } from '../utils/musicTheory';
import { calculatePlaybackRoute, PlaybackStep } from '../utils/navigationEngine';
import { getEffectiveBeatValue, getMeasureTotalBeats } from '../utils/pianotasticNotation';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private isPaused = false;
  private currentScore: Score | null = null;

  // Route-based playback
  private playbackRoute: PlaybackStep[] = [];
  private currentRouteIndex = 0;
  private playbackTimer: number | null = null;
  private scheduledEvents: { stop: () => void }[] = [];

  // Callbacks
  private onPositionUpdate: ((measureIndex: number, beat: number, stepIndex: number) => void) | null = null;
  private onStateChange: ((isPlaying: boolean) => void) | null = null;

  // Metronome & Audio settings
  private metronomeEnabled = true;
  private metronomeVolume = 0.7;
  private accentFirstBeat = true;
  private masterVolume = 0.85;

  // Selected playback start parameters
  private initialStartBeatIndex = 0;
  private initialStartSubBeatIndex = 0;
  private isFirstMeasureOfPlayback = false;

  private initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public setMetronome(enabled: boolean) {
    this.metronomeEnabled = enabled;
  }

  public getMetronome(): boolean {
    return this.metronomeEnabled;
  }

  public setMetronomeVolume(vol: number) {
    this.metronomeVolume = Math.max(0, Math.min(1, vol));
  }

  public getMetronomeVolume(): number {
    return this.metronomeVolume;
  }

  public setAccentFirstBeat(accent: boolean) {
    this.accentFirstBeat = accent;
  }

  public getAccentFirstBeat(): boolean {
    return this.accentFirstBeat;
  }

  public setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setPositionCallback(cb: (measureIndex: number, beat: number, stepIndex: number) => void) {
    this.onPositionUpdate = cb;
  }

  public setStateCallback(cb: (isPlaying: boolean) => void) {
    this.onStateChange = cb;
  }

  /**
   * Calculate effective quarter-note duration in seconds based on BPM and Beat Unit
   */
  public getQuarterNoteSec(bpm: number, beatUnit?: TempoBeatUnit): number {
    const validBpm = Math.max(30, Math.min(300, bpm || 100));
    switch (beatUnit) {
      case 'half':
        // Half note gets the beat => 1 half = 2 quarter notes = 60/BPM sec => 1 quarter note = 30/BPM sec
        return 30 / validBpm;
      case 'dotted_quarter':
        // Dotted quarter (compound time) gets the beat => 1.5 quarter notes = 60/BPM sec => 1 quarter = 40/BPM sec
        return 40 / validBpm;
      case 'quarter':
      default:
        return 60 / validBpm;
    }
  }

  /**
   * Synthesize an acoustic piano tone using multi-harmonic synthesis, envelope decay, and hammer transient
   */
  public playTone(freq: number, durationSec = 1.0, velocity = 0.8, timeOffset = 0) {
    try {
      if (!freq || freq <= 0 || isNaN(freq)) return { stop: () => {} };
      const ctx = this.initContext();
      // Ensure startTime is strictly non-negative and in the future
      const safeStartTime = Math.max(ctx.currentTime + 0.005, ctx.currentTime + timeOffset);

      const masterGain = ctx.createGain();
      const effectiveGain = Math.max(0.01, Math.min(1.0, this.masterVolume * velocity * 0.45));

      // In Web Audio API, exponential ramps cannot start from or ramp to 0!
      masterGain.gain.setValueAtTime(0.0001, safeStartTime);
      // Fast piano hammer attack
      masterGain.gain.linearRampToValueAtTime(effectiveGain, safeStartTime + 0.006);
      // Natural acoustic piano exponential decay
      const decayTime = Math.min(durationSec * 0.4, 0.25);
      masterGain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, effectiveGain * 0.42),
        safeStartTime + 0.006 + decayTime
      );
      masterGain.gain.exponentialRampToValueAtTime(
        0.0001,
        safeStartTime + durationSec + 0.12
      );

      // Low pass filter to simulate piano soundboard & acoustic string warmth
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const initialCutoff = Math.min(Math.max(freq * 5.5, 800), 10000);
      const endCutoff = Math.min(Math.max(freq * 2.2, 400), 5000);
      filter.frequency.setValueAtTime(initialCutoff, safeStartTime);
      filter.frequency.exponentialRampToValueAtTime(endCutoff, safeStartTime + durationSec);

      // Harmonics for rich acoustic timbre (Fundamental, 2nd, 3rd, 4th harmonics)
      const harmonics = [
        { mult: 1, gain: 1.0, type: 'triangle' as OscillatorType },
        { mult: 2, gain: 0.48, type: 'sine' as OscillatorType },
        { mult: 3, gain: 0.22, type: 'sine' as OscillatorType },
        { mult: 4, gain: 0.10, type: 'sine' as OscillatorType },
      ];

      const oscs: OscillatorNode[] = [];
      harmonics.forEach((h) => {
        const osc = ctx.createOscillator();
        osc.type = h.type;
        osc.frequency.setValueAtTime(freq * h.mult, safeStartTime);

        const hGain = ctx.createGain();
        hGain.gain.setValueAtTime(h.gain, safeStartTime);

        osc.connect(hGain);
        hGain.connect(filter);
        oscs.push(osc);
      });

      filter.connect(masterGain);
      masterGain.connect(ctx.destination);

      oscs.forEach((osc) => {
        osc.start(safeStartTime);
        osc.stop(safeStartTime + durationSec + 0.15);
      });

      return {
        stop: () => {
          try {
            masterGain.gain.cancelScheduledValues(ctx.currentTime);
            masterGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.03);
            setTimeout(() => {
              oscs.forEach((o) => {
                try { o.stop(); } catch {}
              });
            }, 40);
          } catch {
            // ignore
          }
        },
      };
    } catch (err) {
      console.warn('Audio playTone error:', err);
      return { stop: () => {} };
    }
  }

  /**
   * Play metronome click with first beat accent respecting time signature
   */
  public playClick(isHighBeat: boolean, timeOffset = 0) {
    if (!this.metronomeEnabled || this.metronomeVolume <= 0) return;
    try {
      const ctx = this.initContext();
      const startTime = ctx.currentTime + timeOffset;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Pitch: high accented beat vs normal beat
      const freq = isHighBeat && this.accentFirstBeat ? 1650 : 960;
      osc.frequency.setValueAtTime(freq, startTime);

      const clickVolume = isHighBeat && this.accentFirstBeat
        ? 0.32 * this.metronomeVolume
        : 0.16 * this.metronomeVolume;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(clickVolume, startTime + 0.0015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + (isHighBeat ? 0.05 : 0.038));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.055);
    } catch {
      // ignore
    }
  }

  public playPitch(pitch: Pitch, keySignatureId = 'C_major', durationSec = 0.6) {
    const midi = getMidiNote(pitch, keySignatureId);
    const freq = midiToFrequency(midi);
    return this.playTone(freq, durationSec);
  }

  public playChord(chordStr: string, durationSec = 0.85, velocity = 0.65) {
    const midis = parseChordToMidiNotes(chordStr);
    if (!midis || midis.length === 0) return;
    midis.forEach((midi) => {
      const freq = midiToFrequency(midi);
      this.playTone(freq, durationSec, velocity, 0);
    });
  }

  public playNoteEvent(event: NoteEvent, keySignatureId = 'C_major', durationSec?: number) {
    if (event.type === 'rest' || event.pitches.length === 0) return;
    const dur = durationSec ?? Math.max(0.2, getEventBeats(event) * 0.5);
    event.pitches.forEach((pitch) => {
      this.playPitch(pitch, keySignatureId, dur);
    });
  }

  /**
   * Start playback of score from specific measure index, beat index, and subdivision,
   * fully evaluating the navigation route (repeats, voltas, D.C., D.S., Coda, Fine).
   */
  public async playScore(
    score: Score,
    startMeasureIndex = 0,
    startBeatIndex = 0,
    startSubBeatIndex = 0
  ) {
    const ctx = this.initContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('AudioContext resume error:', err);
      }
    }
    this.stopPlayback();
    this.currentScore = score;
    this.initialStartBeatIndex = Math.max(0, startBeatIndex);
    this.initialStartSubBeatIndex = Math.max(0, startSubBeatIndex);
    this.isFirstMeasureOfPlayback = true;

    // Calculate full playback route
    const validation = calculatePlaybackRoute(
      score.measures,
      score.metadata.tempoBpm,
      score.metadata.initialTimeSignature,
      score.metadata.initialKeySignature
    );

    this.playbackRoute = validation.route;

    // Find the closest step in route matching startMeasureIndex
    let targetStepIdx = this.playbackRoute.findIndex((s) => s.measureIndex === startMeasureIndex);
    if (targetStepIdx === -1) targetStepIdx = 0;

    this.currentRouteIndex = targetStepIdx;
    this.isPlaying = true;
    this.isPaused = false;
    this.onStateChange?.(true);

    this.runPlaybackLoop();
  }

  private runPlaybackLoop() {
    if (!this.isPlaying || !this.currentScore || this.playbackRoute.length === 0) return;

    if (this.currentRouteIndex >= this.playbackRoute.length) {
      // Finished entire route
      this.stopPlayback();
      return;
    }

    const currentStep = this.playbackRoute[this.currentRouteIndex];
    const measure = this.currentScore.measures[currentStep.measureIndex];

    if (!measure) {
      this.stopPlayback();
      return;
    }

    // Determine measure parameters
    const keySig = currentStep.keySignature || measure.keySignature || this.currentScore.metadata.initialKeySignature || 'C_major';
    const bpm = measure.tempoBpm || currentStep.bpm || this.currentScore.metadata.tempoBpm || 100;
    const beatUnit = measure.tempoBeatUnit || this.currentScore.metadata.tempoBeatUnit || 'quarter';
    const quarterNoteSec = this.getQuarterNoteSec(bpm, beatUnit);

    const ts = measure.timeSignature || currentStep.timeSignature || this.currentScore.metadata.initialTimeSignature || { numerator: 4, denominator: 4 };
    const totalBeats = getMeasureTotalBeats(measure, ts, this.currentScore.metadata.indianTaal);
    const measureCapacityBeats = (totalBeats * 4) / ts.denominator;
    const measureDurationSec = measureCapacityBeats * quarterNoteSec;
    const beatDurationSec = (4 / ts.denominator) * quarterNoteSec;

    let startBeat = 0;
    let startSub = 0;
    let startOffsetSec = 0;

    if (this.isFirstMeasureOfPlayback) {
      startBeat = Math.min(totalBeats - 1, this.initialStartBeatIndex);
      const effVal = measure.beatValues?.[startBeat] || getEffectiveBeatValue(this.currentScore, currentStep.measureIndex, startBeat);
      startSub = Math.min(Math.max(0, effVal - 1), this.initialStartSubBeatIndex);
      const subDurationSec = beatDurationSec / effVal;
      startOffsetSec = startBeat * beatDurationSec + startSub * subDurationSec;
      this.isFirstMeasureOfPlayback = false;
    }

    const remainingMeasureDurationSec = Math.max(0.04, measureDurationSec - startOffsetSec);

    // Report starting measure and beat position to UI immediately
    this.onPositionUpdate?.(currentStep.measureIndex, startBeat, this.currentRouteIndex);

    // Schedule metronome clicks for this measure respecting startBeat
    for (let beat = startBeat; beat < totalBeats; beat++) {
      const beatOffsetSec = beat * beatDurationSec - startOffsetSec;
      if (beatOffsetSec >= -0.001) {
        this.playClick(beat === 0, Math.max(0, beatOffsetSec));

        // Report beat position to UI for smooth playhead cursor
        if (beat > startBeat) {
          const timerId = window.setTimeout(() => {
            if (this.isPlaying) {
              this.onPositionUpdate?.(currentStep.measureIndex, beat, this.currentRouteIndex);
            }
          }, beatOffsetSec * 1000);
          this.scheduledEvents.push({ stop: () => clearTimeout(timerId) });
        }
      }
    }

    // Schedule simultaneous harmonic chord playback for this measure
    this.scheduleMeasureChords(measure, quarterNoteSec, ts, currentStep.measureIndex, startBeat, startOffsetSec);

    // Schedule audio events: check if measure has explicit beatNotes
    const hasBeatNotes =
      measure.beatNotes &&
      Object.values(measure.beatNotes).some(
        (arr) => arr && arr.some((p) => p !== null && p !== undefined && p.step)
      );

    if (hasBeatNotes) {
      this.schedulePianotasticBeatNotes(
        measure,
        keySig,
        quarterNoteSec,
        ts,
        currentStep.measureIndex,
        startBeat,
        startSub,
        startOffsetSec
      );
    } else {
      // Fallback for legacy staff events
      this.scheduleStaffEvents(measure.rhEvents, keySig, quarterNoteSec);
      this.scheduleStaffEvents(measure.lhEvents, keySig, quarterNoteSec);
    }

    // Stop if this step is "Fine"
    if (currentStep.isFine) {
      this.playbackTimer = window.setTimeout(() => {
        this.stopPlayback();
      }, remainingMeasureDurationSec * 1000);
      return;
    }

    // Schedule next route step
    this.playbackTimer = window.setTimeout(() => {
      if (this.isPlaying) {
        this.currentRouteIndex++;
        this.initialStartBeatIndex = 0;
        this.initialStartSubBeatIndex = 0;
        this.runPlaybackLoop();
      }
    }, remainingMeasureDurationSec * 1000);
  }

  /**
   * Schedule simultaneous harmonic playback for chord symbols attached to beats.
   * Chords sound at the accompaniment register for the duration of the beat,
   * fully synchronized with melody, metronome, tempo, stop, and pause.
   */
  private scheduleMeasureChords(
    measure: Measure,
    quarterNoteSec: number,
    ts: TimeSignature,
    measureIndex: number,
    startBeat = 0,
    startOffsetSec = 0
  ) {
    const pickupBeat = this.currentScore?.metadata?.pickupBeat || 1;
    const isFirstMeasure = measure.measureNumber === 1 || measureIndex === 0;
    const lockedBeforeBeat = isFirstMeasure && pickupBeat > 1 ? pickupBeat - 1 : 0;
    const totalBeats = getMeasureTotalBeats(measure, ts, this.currentScore?.metadata?.indianTaal);
    const beatDurationSec = (4 / ts.denominator) * quarterNoteSec;

    for (let b = Math.max(startBeat, 0); b < totalBeats; b++) {
      if (isFirstMeasure && b < lockedBeforeBeat) {
        continue; // Locked pickup beat remains silent
      }

      // Find chord attached to this beat
      let chordStr: string | undefined = undefined;
      if (measure.beatChords && measure.beatChords[b] !== undefined && measure.beatChords[b].trim()) {
        chordStr = measure.beatChords[b].trim();
      } else if (measure.chordSymbols && measure.chordSymbols.length > 0) {
        const cs = measure.chordSymbols.find((c) => Math.floor(c.beatOffset) === b);
        if (cs) {
          chordStr = cs.formatted || `${cs.root}${cs.quality || ''}`;
        }
      }

      if (chordStr) {
        const chordMidis = parseChordToMidiNotes(chordStr);
        if (chordMidis && chordMidis.length > 0) {
          const beatOffsetSec = b * beatDurationSec - startOffsetSec;
          if (beatOffsetSec >= -0.01) {
            // Chord sounds for the duration of the beat
            const chordDurationSec = Math.max(0.18, beatDurationSec * 0.96);

            for (const midi of chordMidis) {
              const freq = midiToFrequency(midi);
              const handle = this.playTone(freq, chordDurationSec, 0.65, Math.max(0, beatOffsetSec));
              if (handle) {
                this.scheduledEvents.push(handle);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Schedule audio directly from Pianotastic beatNotes and beatValues.
   * Handles subdivisions with absolute precision:
   * - If Value = 2 with ". B", slot 0 is silent, and B plays precisely on slot 1.
   * - Respects exact stored octave (Low C = 48, Middle C = 60, High C = 72).
   * - Respects pickup beats in Measure 1.
   */
  private schedulePianotasticBeatNotes(
    measure: Measure,
    keySig: string,
    quarterNoteSec: number,
    ts: TimeSignature,
    measureIndex: number,
    startBeat = 0,
    startSub = 0,
    startOffsetSec = 0
  ) {
    const pickupBeat = this.currentScore?.metadata?.pickupBeat || 1;
    const isFirstMeasure = measure.measureNumber === 1 || measureIndex === 0;
    const lockedBeforeBeat = isFirstMeasure && pickupBeat > 1 ? pickupBeat - 1 : 0;
    const totalBeats = getMeasureTotalBeats(measure, ts, this.currentScore?.metadata?.indianTaal);
    const beatDurationSec = (4 / ts.denominator) * quarterNoteSec;

    for (let b = Math.max(startBeat, 0); b < totalBeats; b++) {
      if (isFirstMeasure && b < lockedBeforeBeat) {
        continue; // Locked pickup beat remains silent
      }

      const effVal =
        measure.beatValues?.[b] ||
        (this.currentScore ? getEffectiveBeatValue(this.currentScore, measureIndex, b) : 1);

      const subDurationSec = beatDurationSec / effVal;
      const pitches = measure.beatNotes?.[b] || [];

      // Check if beat has an active chord
      const hasBeatChord = Boolean(
        (measure.beatChords && measure.beatChords[b]?.trim()) ||
        (measure.chordSymbols && measure.chordSymbols.some((c) => Math.floor(c.beatOffset) === b))
      );

      const minSub = b === startBeat ? startSub : 0;
      for (let s = minSub; s < effVal; s++) {
        const pitch = pitches[s] ?? null;
        if (pitch && pitch.step) {
          const timeOffsetSec = (b * beatDurationSec + s * subDurationSec) - startOffsetSec;
          if (timeOffsetSec >= -0.01) {
            const noteDurationSec = Math.max(0.08, subDurationSec * 0.90);
            const midi = getMidiNote(pitch, keySig);
            const freq = midiToFrequency(midi);
            const handle = this.playTone(freq, noteDurationSec, 0.85, Math.max(0, timeOffsetSec));
            if (handle) {
              this.scheduledEvents.push(handle);
            }

            // Subtle left-hand accompaniment an octave lower ONLY if no explicit chord is attached to beat
            if (!hasBeatChord) {
              const lhMidi = Math.max(21, midi - 12);
              const lhHandle = this.playTone(midiToFrequency(lhMidi), noteDurationSec, 0.35, Math.max(0, timeOffsetSec));
              if (lhHandle) {
                this.scheduledEvents.push(lhHandle);
              }
            }
          }
        }
        // If pitch is null or empty: complete silence on this subdivision slot!
      }
    }
  }

  private scheduleStaffEvents(events: NoteEvent[], keySig: string, quarterNoteSec: number) {
    let currentOffsetBeats = 0;
    events.forEach((ev) => {
      const beats = getEventBeats(ev);
      const timeOffsetSec = currentOffsetBeats * quarterNoteSec;
      const durationSec = beats * quarterNoteSec * 0.95;

      if (ev.type === 'note' && ev.pitches.length > 0) {
        ev.pitches.forEach((pitch) => {
          const midi = getMidiNote(pitch, keySig);
          const freq = midiToFrequency(midi);
          const handle = this.playTone(freq, durationSec, 0.78, timeOffsetSec);
          if (handle) {
            this.scheduledEvents.push(handle);
          }
        });
      }

      currentOffsetBeats += beats;
    });
  }

  public pausePlayback() {
    this.isPlaying = false;
    this.isPaused = true;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.scheduledEvents.forEach((e) => e.stop());
    this.scheduledEvents = [];
    this.onStateChange?.(false);
  }

  public stopPlayback() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentRouteIndex = 0;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.scheduledEvents.forEach((e) => e.stop());
    this.scheduledEvents = [];
    this.onPositionUpdate?.(0, 0, 0);
    this.onStateChange?.(false);
  }

  public restartPlayback() {
    if (this.currentScore) {
      this.playScore(this.currentScore, 0);
    }
  }

  public jumpToPreviousMeasure() {
    if (!this.currentScore) return;
    const currentMIdx = this.playbackRoute[this.currentRouteIndex]?.measureIndex ?? 0;
    const prevMIdx = Math.max(0, currentMIdx - 1);
    if (this.isPlaying) {
      this.playScore(this.currentScore, prevMIdx);
    } else {
      this.onPositionUpdate?.(prevMIdx, 0, 0);
    }
  }

  public jumpToNextMeasure() {
    if (!this.currentScore) return;
    const currentMIdx = this.playbackRoute[this.currentRouteIndex]?.measureIndex ?? 0;
    const nextMIdx = Math.min(this.currentScore.measures.length - 1, currentMIdx + 1);
    if (this.isPlaying) {
      this.playScore(this.currentScore, nextMIdx);
    } else {
      this.onPositionUpdate?.(nextMIdx, 0, 0);
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  public getCurrentRoute(): PlaybackStep[] {
    return this.playbackRoute;
  }
}

export const audioEngine = new AudioEngine();
