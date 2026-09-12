import React, { useState } from 'react';
import {
  User as UserIcon,
  Mail,
  Lock,
  Cloud,
  LogOut,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  FolderSync,
} from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { auth, googleProvider } from '../../lib/firebase';
import { CloudProjectService } from '../../services/cloudProjectService';
import { SavedProject } from '../../types/score';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: User | null;
  localProjects?: SavedProject[];
  onProjectsSynced?: () => void;
  onMigrateLocalProjects?: (userId: string) => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  localProjects = [],
  onProjectsSynced,
}) => {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (tab === 'signup') {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        setSuccessMsg('Account created successfully! Your projects will now sync to the cloud.');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setSuccessMsg('Signed in successfully! Synced with your cloud library.');
      }
      onProjectsSynced?.();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Auth error:', err);
      let friendly = err.message || 'Authentication failed.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        friendly = 'Invalid email or password.';
      } else if (err.code === 'auth/email-already-in-use') {
        friendly = 'An account with this email already exists. Try signing in instead.';
      } else if (err.code === 'auth/weak-password') {
        friendly = 'Password should be at least 6 characters.';
      }
      setErrorMsg(friendly);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      await signInWithPopup(auth, googleProvider);
      setSuccessMsg('Connected with Google! Scores synchronized.');
      onProjectsSynced?.();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Google Sign In error:', err);
      // If popup blocked or cancelled
      if (err.code === 'auth/popup-blocked') {
        setErrorMsg('Sign-in popup was blocked by your browser. Please allow popups or use email/password.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Sign-in window closed before completing.');
      } else {
        setErrorMsg(err.message || 'Could not sign in with Google. You can sign up with email/password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setSuccessMsg('Signed out. Local cache active.');
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMsg('Failed to sign out: ' + err.message);
    }
  };

  const handleMigrateLocal = async () => {
    if (!currentUser) return;
    setIsMigrating(true);
    setErrorMsg(null);
    try {
      const count = await CloudProjectService.migrateLocalProjects(currentUser.uid, localProjects);
      setSuccessMsg(`Successfully uploaded ${count} local project${count === 1 ? '' : 's'} to your cloud account!`);
      onProjectsSynced?.();
    } catch (err: any) {
      setErrorMsg('Migration error: ' + err.message);
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-stone-200 max-w-md w-full overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-stone-900 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center space-x-2.5">
            <Cloud className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-semibold text-sm tracking-wide">Pianotastic Cloud Sync</h2>
              <p className="text-[11px] text-stone-400">Save & access your notation on any computer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start space-x-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start space-x-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">{successMsg}</div>
            </div>
          )}

          {/* Signed-in Account State */}
          {currentUser ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-800 flex items-center justify-center font-bold text-base border border-amber-500/20">
                  {currentUser.email ? currentUser.email[0].toUpperCase() : 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-stone-500">Connected Account</p>
                  <p className="text-sm font-semibold text-stone-900 truncate">{currentUser.email}</p>
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Cloud Firestore Synchronized
                  </p>
                </div>
              </div>

              {/* Migrate Local Projects option if any */}
              {localProjects.length > 0 && (
                <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                      <FolderSync className="w-4 h-4 text-amber-700" />
                      {localProjects.length} Offline/Local Project{localProjects.length === 1 ? '' : 's'} Found
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600">
                    Upload your existing local device scores to this cloud account so you can open them anywhere.
                  </p>
                  <button
                    onClick={handleMigrateLocal}
                    disabled={isMigrating}
                    className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-amber-700 hover:bg-amber-800 text-white transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    {isMigrating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                    <span>{isMigrating ? 'Syncing...' : 'Sync Local Scores to Cloud'}</span>
                  </button>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between border-t border-stone-100">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                >
                  Done
                </button>
                <button
                  onClick={handleSignOut}
                  className="px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center space-x-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : (
            /* Signed Out State: Sign In or Sign Up */
            <div className="space-y-4">
              {/* Account Intended Information Box */}
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-900">Authoritative Cloud Account</span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                    Safari & Chrome Sync
                  </span>
                </div>
                <p className="text-xs font-semibold text-stone-900">Cloud Score Library</p>
                <p className="text-[11px] text-stone-600">
                  Sign in or create an account to sync your sheet music scores between Safari, Chrome, and all devices.
                </p>
              </div>

              {/* Google Sign In Primary Button */}
              <button
                type="button"
                id="google-signin-btn"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl border border-stone-300 hover:bg-stone-50 font-medium text-xs text-stone-900 flex items-center justify-center space-x-2.5 transition-colors shadow-2xs bg-white hover:border-stone-400"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google Sign-In</span>
              </button>

              <div className="flex items-center space-x-2 my-2">
                <div className="flex-1 h-px bg-stone-200" />
                <span className="text-[10px] uppercase font-bold text-stone-400">or with email</span>
                <div className="flex-1 h-px bg-stone-200" />
              </div>

              {/* Tabs */}
              <div className="grid grid-cols-2 p-1 bg-stone-100 rounded-lg text-xs font-semibold text-stone-600">
                <button
                  type="button"
                  onClick={() => setTab('signin')}
                  className={`py-1.5 rounded-md transition-all ${
                    tab === 'signin' ? 'bg-white text-stone-900 shadow-2xs' : 'hover:text-stone-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setTab('signup')}
                  className={`py-1.5 rounded-md transition-all ${
                    tab === 'signup' ? 'bg-white text-stone-900 shadow-2xs' : 'hover:text-stone-900'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-stone-700 block mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="pianist@example.com"
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:bg-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-stone-700 block mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:bg-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs transition-colors shadow-2xs flex items-center justify-center space-x-1.5"
                >
                  {loading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>{tab === 'signin' ? 'Sign In & Sync' : 'Create Free Cloud Account'}</span>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
