import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  getDocFromServer,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Score, SavedProject } from '../types/score';

/**
 * Remove undefined values recursively so Firestore setDoc does not throw
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      result[key] = sanitizeForFirestore(val);
    }
  }
  return result;
}

export class CloudProjectService {
  /**
   * Test Firestore server connection
   */
  public static async testConnection(userId: string): Promise<boolean> {
    try {
      const testRef = doc(db, 'users', userId, 'projects', '_ping');
      await getDocFromServer(testRef);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save a score into the user's private Firestore collection
   */
  public static async saveProject(userId: string, score: Score): Promise<SavedProject> {
    if (!userId) {
      throw new Error('User must be signed in to save to cloud');
    }

    const now = new Date().toISOString();
    const projectId = score.id || `score_${Date.now()}`;

    const projectData: SavedProject = {
      id: projectId,
      name: score.metadata.title || 'Untitled Composition',
      lastModified: now,
      score: {
        ...score,
        id: projectId,
      },
      handTemplate: score.metadata.handTemplate || 'Both',
      measuresCount: score.measures.length,
      keySignature: score.metadata.initialKeySignature?.replace('_', ' ') || 'C Major',
      tempo: score.metadata.tempoBpm || 80,
      taal: score.metadata.indianTaal || 'None',
    };

    const projectDocRef = doc(db, 'users', userId, 'projects', projectId);
    const sanitizedData = sanitizeForFirestore(projectData);

    await setDoc(projectDocRef, sanitizedData, { merge: true });

    return projectData;
  }

  /**
   * Fetch all cloud projects for the authenticated user
   */
  public static async fetchUserProjects(userId: string): Promise<SavedProject[]> {
    if (!userId) return [];

    try {
      const projectsColRef = collection(db, 'users', userId, 'projects');
      const snap = await getDocs(projectsColRef);

      const list: SavedProject[] = [];
      snap.forEach((docSnap) => {
        if (docSnap.id === '_ping') return;
        const data = docSnap.data() as SavedProject;
        if (data && data.score) {
          list.push(data);
        }
      });

      // Sort by last modified descending
      list.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      return list;
    } catch (err) {
      console.warn('Failed to fetch user projects from Firestore:', err);
      return [];
    }
  }

  public static async getUserProjects(userId: string): Promise<SavedProject[]> {
    return this.fetchUserProjects(userId);
  }

  /**
   * Listen to real-time updates for user's projects across tabs and browsers (Safari <-> Chrome)
   */
  public static subscribeToUserProjects(
    userId: string,
    onProjectsUpdate: (projects: SavedProject[]) => void,
    onError?: (error: any) => void
  ): () => void {
    if (!userId) return () => {};
    const projectsColRef = collection(db, 'users', userId, 'projects');
    return onSnapshot(
      projectsColRef,
      (snap) => {
        const list: SavedProject[] = [];
        snap.forEach((docSnap) => {
          if (docSnap.id === '_ping') return;
          const data = docSnap.data() as SavedProject;
          if (data && data.score) {
            list.push(data);
          }
        });
        list.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
        onProjectsUpdate(list);
      },
      (error) => {
        console.warn('Firestore subscription error:', error);
        onError?.(error);
      }
    );
  }

  /**
   * Delete a project from user's cloud storage
   */
  public static async deleteProject(userId: string, projectId: string): Promise<void> {
    if (!userId || !projectId) return;

    const projectDocRef = doc(db, 'users', userId, 'projects', projectId);
    await deleteDoc(projectDocRef);
  }

  /**
   * Migrate existing local projects to the cloud
   */
  public static async migrateLocalProjects(userId: string, localProjects: SavedProject[]): Promise<number> {
    if (!userId || !localProjects || localProjects.length === 0) return 0;

    let migrated = 0;
    for (const proj of localProjects) {
      // Don't migrate sample seed placeholders unless modified
      try {
        await this.saveProject(userId, proj.score);
        migrated++;
      } catch (e) {
        console.warn('Failed migrating project:', proj.name, e);
      }
    }
    return migrated;
  }
}

export const cloudProjectService = CloudProjectService;
