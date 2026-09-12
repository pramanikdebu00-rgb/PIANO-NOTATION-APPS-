import { Score, SavedProject, HandTemplate, Measure, TimeSignature, DEFAULT_LEARNING_LAYER } from '../types/score';
import { SAMPLE_SCORES } from '../data/sampleScores';
import { INDIAN_TAALS } from '../utils/indianTaals';

const STORAGE_KEY = 'pianotastic_saved_projects_v2';

export interface NewScoreConfig {
  template: HandTemplate;
  scaleId: string;
  taalId: string;
  tempoBpm: number;
  measuresCount: number;
  pickupBeat: number; // 1-based beat within Measure 1
  pickupMeasure?: number; // Backwards compatibility
  barsPerLine: number;
  title: string;
  subtitle: string;
  composer: string;
  lyricist: string;
  copyright: string;
  customNumerator?: number;
  customDenominator?: number;
}

export class ProjectStorageService {
  /**
   * Load saved projects from localStorage, or return default seeded samples on first run.
   */
  public static getSavedProjects(): SavedProject[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read saved projects from localStorage:', e);
    }

    // Default seeded projects
    const defaultProjects: SavedProject[] = [
      {
        id: 'proj_etude_seed',
        name: SAMPLE_SCORES.etude.metadata.title,
        lastModified: new Date(Date.now() - 3600000 * 2).toISOString(),
        score: {
          ...SAMPLE_SCORES.etude,
          metadata: {
            ...SAMPLE_SCORES.etude.metadata,
            handTemplate: 'Both',
            indianTaal: 'None',
            pickupMeasure: 1,
          },
          layoutSettings: {
            ...SAMPLE_SCORES.etude.layoutSettings,
            measuresPerSystemAuto: 4,
            barsPerLine: 4,
          },
        },
        handTemplate: 'Both',
        measuresCount: SAMPLE_SCORES.etude.measures.length,
        keySignature: 'C Major',
        tempo: SAMPLE_SCORES.etude.metadata.tempoBpm,
        taal: 'None',
      },
      {
        id: 'proj_twinkle_seed',
        name: SAMPLE_SCORES.twinkle.metadata.title,
        lastModified: new Date(Date.now() - 3600000 * 24).toISOString(),
        score: {
          ...SAMPLE_SCORES.twinkle,
          metadata: {
            ...SAMPLE_SCORES.twinkle.metadata,
            handTemplate: 'Both',
            indianTaal: 'None',
            pickupMeasure: 1,
          },
          layoutSettings: {
            ...SAMPLE_SCORES.twinkle.layoutSettings,
            measuresPerSystemAuto: 4,
            barsPerLine: 4,
          },
        },
        handTemplate: 'Both',
        measuresCount: SAMPLE_SCORES.twinkle.measures.length,
        keySignature: 'C Major',
        tempo: SAMPLE_SCORES.twinkle.metadata.tempoBpm,
        taal: 'None',
      },
    ];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProjects));
    } catch {
      // Ignore storage quota issues
    }

    return defaultProjects;
  }

  /**
   * Save a score into saved projects list in localStorage.
   */
  public static saveProject(score: Score): SavedProject[] {
    const projects = this.getSavedProjects();
    const existingIdx = projects.findIndex((p) => p.id === score.id || p.score.id === score.id);

    const now = new Date().toISOString();
    const projectItem: SavedProject = {
      id: score.id,
      name: score.metadata.title || 'Untitled Project',
      lastModified: now,
      score,
      handTemplate: score.metadata.handTemplate || 'Both',
      measuresCount: score.measures.length,
      keySignature: score.metadata.initialKeySignature.replace('_', ' '),
      tempo: score.metadata.tempoBpm || 80,
      taal: score.metadata.indianTaal || 'None',
    };

    let updated: SavedProject[];
    if (existingIdx >= 0) {
      updated = [...projects];
      updated[existingIdx] = projectItem;
    } else {
      updated = [projectItem, ...projects];
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
    return updated;
  }

  /**
   * Save a complete list of projects directly to localStorage
   */
  public static saveProjects(projects: SavedProject[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.warn('Failed to save projects to localStorage:', e);
    }
  }

  /**
   * Delete a project from saved list.
   */
  public static deleteProject(projectId: string): SavedProject[] {
    const projects = this.getSavedProjects().filter(
      (p) => p.id !== projectId && p.score?.id !== projectId
    );
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.warn('Failed to update localStorage after delete:', e);
    }
    return projects;
  }

  /**
   * Create a new blank Score initialized with the exact configuration from New Page setup.
   */
  public static createNewScore(config: NewScoreConfig): Score {
    const scoreId = `pianotastic_${Date.now()}`;
    const taalDef = INDIAN_TAALS.find((t) => t.id === config.taalId);

    // Determine initial time signature
    let timeSignature: TimeSignature = { numerator: 4, denominator: 4 };
    if (config.customNumerator && config.customDenominator) {
      timeSignature = { numerator: config.customNumerator, denominator: config.customDenominator };
    } else if (taalDef && taalDef.id !== 'None') {
      timeSignature = taalDef.recommendedTimeSignature;
    }

    // Determine rest duration based on time signature
    const restDuration = timeSignature.numerator === 3 ? 'half' : 'whole';

    const measures: Measure[] = [];
    const count = Math.max(1, config.measuresCount || 16);

    for (let i = 1; i <= count; i++) {
      const measure: Measure = {
        id: `m_${Date.now()}_${i}`,
        measureNumber: i,
        barlineType: i === count ? 'end' : 'single',
        chordSymbols: [],
        beatNotes: {},
        beatValues: {},
        beatLyrics: {},
        rhEvents:
          config.template === 'LH'
            ? []
            : [
                {
                  id: `rh_${Date.now()}_${i}`,
                  type: 'rest',
                  pitches: [],
                  duration: restDuration,
                  isDotted: timeSignature.numerator === 3,
                },
              ],
        lhEvents:
          config.template === 'RH'
            ? []
            : [
                {
                  id: `lh_${Date.now()}_${i}`,
                  type: 'rest',
                  pitches: [],
                  duration: restDuration,
                  isDotted: timeSignature.numerator === 3,
                },
              ],
      };
      measures.push(measure);
    }

    const newScore: Score = {
      id: scoreId,
      version: '2.0',
      metadata: {
        title: config.title || 'Untitled Composition',
        subtitle: config.subtitle || '',
        composer: config.composer || 'Pianotastic Academy',
        lyricist: config.lyricist || '',
        copyright: config.copyright || '© Pianotastic Academy. All rights reserved.',
        tempoBpm: config.tempoBpm || 80,
        initialTimeSignature: timeSignature,
        initialKeySignature: config.scaleId || 'C_major',
        handTemplate: config.template,
        indianTaal: config.taalId,
        pickupBeat: config.pickupBeat || 1,
        pickupMeasure: config.pickupMeasure || 1,
        keyboardLayout: '61',
      },
      layoutSettings: {
        pageSize: 'A4',
        orientation: 'portrait',
        layoutMode: 'auto',
        measuresPerSystemAuto: config.barsPerLine || 4,
        barsPerLine: config.barsPerLine || 4,
        pageMargins: { top: 40, right: 36, bottom: 40, left: 36 },
        keyboardLayout: '61',
        showAcademyBranding: true,
        showMeasureNumbers: true,
        showAnnotations: true,
        showNoteNames: false,
        showFingering: true,
        showHandLabels: true,
        showLyrics: true,
        showChordSymbols: true,
        zoom: 1.0,
      },
      learningLayer: {
        ...DEFAULT_LEARNING_LAYER,
        teacherGeneralNotes:
          config.taalId && config.taalId !== 'None'
            ? `Rhythmic Taal: ${config.taalId} (${taalDef?.representation}). Practice with metronome at ${config.tempoBpm} BPM.`
            : 'Practice with curved fingers and steady tempo.',
      },
      measures,
    };

    return newScore;
  }
}
