import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  setLogLevel,
  doc,
  getDocFromServer,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Silenciar logs internos de reconexión de @firebase/firestore cuando el proyecto Cloud tiene APIs restringidas o modo offline
try {
  setLogLevel('silent');
} catch {
  // ignorar si no aplica
}

// Limpiar caché antigua de IndexedDB (firebaseLocalStorageDb) para evitar que tokens expirados disparen llamadas a securetoken.googleapis.com si dicha API no está habilitada en el proyecto
if (typeof window !== 'undefined' && window.indexedDB) {
  try {
    window.indexedDB.deleteDatabase('firebaseLocalStorageDb');
  } catch {
    // ignorar errores de limpieza de IndexedDB
  }
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
})();

export const db = (firebaseConfig as Record<string, string>).firestoreDatabaseId
  ? getFirestore(app, (firebaseConfig as Record<string, string>).firestoreDatabaseId)
  : getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
// Scope para explorar y leer archivos .glb desde Google Drive
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');

// Caché en memoria del token de acceso de Google para llamadas a APIs de Workspace (Drive)
let inMemoryGoogleAccessToken: string | null = null;

export function getCachedGoogleAccessToken(): string | null {
  return inMemoryGoogleAccessToken;
}

export function setCachedGoogleAccessToken(token: string | null): void {
  inMemoryGoogleAccessToken = token;
}

const LOCAL_MODELS_STORAGE_KEY = 'celshade_saved_models_v1';
const LOCAL_USER_STORAGE_KEY = 'celshade_local_user_v1';

// Estado de salud del servicio de tokens / Firestore en la nube
let isCloudTokenServiceHealthy = true;

function isTokenServiceOrOfflineError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /token-service-api|securetoken|identitytoolkit|offline|Could not reach Cloud Firestore|network-request-failed|PERMISSION_DENIED/i.test(
    msg
  );
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  throw new Error(JSON.stringify(errInfo));
}

export interface CloudSavedModel {
  id: string;
  userId: string;
  title: string;
  summary: string;
  pythonCode: string;
  triangles?: number;
  vertices?: number;
  normalSmoothing?: number;
  shadingMode?: string;
  createdAt: string;
  updatedAt?: string;
}

function getLocalSavedModels(): CloudSavedModel[] {
  try {
    const raw = localStorage.getItem(LOCAL_MODELS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalSavedModels(models: CloudSavedModel[]): void {
  try {
    localStorage.setItem(LOCAL_MODELS_STORAGE_KEY, JSON.stringify(models));
  } catch {
    // ignorar errores de cuota de localStorage
  }
}

function saveLocalUserSession(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}): void {
  try {
    localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // ignorar
  }
}

function getLocalUserSession(): User | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.uid) {
      return parsed as User;
    }
    return null;
  } catch {
    return null;
  }
}

function clearLocalUserSession(): void {
  try {
    localStorage.removeItem(LOCAL_USER_STORAGE_KEY);
  } catch {
    // ignorar
  }
}

// Validar conexión con Firestore de forma silenciosa
export async function testFirestoreConnection(): Promise<boolean> {
  if (!isCloudTokenServiceHealthy) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (isTokenServiceOrOfflineError(error)) {
      isCloudTokenServiceHealthy = false;
    }
    return false;
  }
}

export async function signInWithGoogle(): Promise<{ user: User; accessToken: string | null }> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const user = cred.user;
    const credential = GoogleAuthProvider.credentialFromResult(cred);
    const accessToken = credential?.accessToken || null;
    inMemoryGoogleAccessToken = accessToken;

    saveLocalUserSession({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'Escultor 3D',
      photoURL: user.photoURL,
    });

    if (isCloudTokenServiceHealthy) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(
          userRef,
          {
            id: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'Escultor 3D',
            photoURL: user.photoURL || '',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (firestoreErr) {
        if (isTokenServiceOrOfflineError(firestoreErr)) {
          isCloudTokenServiceHealthy = false;
          // Desconectar el token roto en memoria para que Firestore no reintente securetoken.googleapis.com
          await signOut(auth).catch(() => {});
        }
      }
    }

    return { user, accessToken };
  } catch (error) {
    if (isTokenServiceOrOfflineError(error)) {
      isCloudTokenServiceHealthy = false;
      const fallbackUser = {
        uid: 'local_studio_user',
        email: 'NarciMarquez@gmail.com',
        displayName: 'Escultor 3D (Modo Local)',
        photoURL: null,
      };
      saveLocalUserSession(fallbackUser);
      return { user: fallbackUser as unknown as User, accessToken: null };
    }
    throw error;
  }
}

// Cerrar sesión
export async function signOutUser(): Promise<void> {
  clearLocalUserSession();
  inMemoryGoogleAccessToken = null;
  try {
    await signOut(auth);
  } catch {
    // ignorar errores de cierre de sesión
  }
}

// Suscribirse al estado de autenticación (combina sesión en memoria y sesión local persistente)
export function onAuthUserChanged(callback: (user: User | null) => void) {
  const cachedLocalUser = getLocalUserSession();
  if (cachedLocalUser) {
    callback(cachedLocalUser);
  }

  return onAuthStateChanged(
    auth,
    async (user) => {
      if (user) {
        try {
          // Verificar que el servicio de tokens responda antes de usar Firestore
          await user.getIdToken(false);
          saveLocalUserSession({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || 'Escultor 3D',
            photoURL: user.photoURL,
          });
          callback(user);
        } catch (tokenErr) {
          if (isTokenServiceOrOfflineError(tokenErr)) {
            isCloudTokenServiceHealthy = false;
            await signOut(auth).catch(() => {});
            callback(getLocalUserSession());
          } else {
            callback(user);
          }
        }
      } else {
        callback(getLocalUserSession());
      }
    },
    () => {
      isCloudTokenServiceHealthy = false;
      callback(getLocalUserSession());
    }
  );
}

// Guardar modelo 3D (guarda siempre en almacenamiento local instantáneo + sincroniza con Firestore si está disponible)
export async function saveModelToCloud(
  model: Omit<CloudSavedModel, 'id' | 'userId' | 'createdAt'>
): Promise<string> {
  const currentUser = auth.currentUser || getLocalUserSession();
  const userId = currentUser?.uid || 'local_studio_user';

  const modelId = `model_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  const docData: CloudSavedModel = {
    id: modelId,
    userId,
    title: model.title || 'Asset Procedural 3D',
    summary: model.summary || '',
    pythonCode: model.pythonCode,
    triangles: model.triangles || 0,
    vertices: model.vertices || 0,
    normalSmoothing: model.normalSmoothing ?? 0.92,
    shadingMode: model.shadingMode || 'cel',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Guardar siempre en almacenamiento local para disponibilidad inmediata sin fallos
  const existingLocal = getLocalSavedModels();
  setLocalSavedModels([docData, ...existingLocal]);

  // Intentar sincronizar en Firestore si el usuario tiene token activo y la API está habilitada
  if (auth.currentUser && isCloudTokenServiceHealthy) {
    try {
      await setDoc(doc(db, 'saved_models', modelId), docData);
    } catch (err) {
      if (isTokenServiceOrOfflineError(err)) {
        isCloudTokenServiceHealthy = false;
        await signOut(auth).catch(() => {});
      }
    }
  }

  return modelId;
}

// Cargar todos los modelos guardados del usuario actual (combina nube + almacenamiento local)
export async function getUserSavedModels(): Promise<CloudSavedModel[]> {
  const localModels = getLocalSavedModels();
  const currentUser = auth.currentUser;

  if (!currentUser || !isCloudTokenServiceHealthy) {
    return localModels.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  try {
    const q = query(collection(db, 'saved_models'), where('userId', '==', currentUser.uid));
    const snapshot = await getDocs(q);
    const mergedMap = new Map<string, CloudSavedModel>();

    for (const m of localModels) {
      mergedMap.set(m.id, m);
    }
    snapshot.forEach((d) => {
      const data = d.data() as CloudSavedModel;
      mergedMap.set(data.id, data);
    });

    const mergedList = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setLocalSavedModels(mergedList);
    return mergedList;
  } catch (err) {
    if (isTokenServiceOrOfflineError(err)) {
      isCloudTokenServiceHealthy = false;
      await signOut(auth).catch(() => {});
    }
    return localModels.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

// Eliminar un modelo guardado
export async function deleteSavedModel(modelId: string): Promise<void> {
  const filteredLocal = getLocalSavedModels().filter((m) => m.id !== modelId);
  setLocalSavedModels(filteredLocal);

  if (auth.currentUser && isCloudTokenServiceHealthy) {
    try {
      await deleteDoc(doc(db, 'saved_models', modelId));
    } catch (err) {
      if (isTokenServiceOrOfflineError(err)) {
        isCloudTokenServiceHealthy = false;
        await signOut(auth).catch(() => {});
      }
    }
  }
}
