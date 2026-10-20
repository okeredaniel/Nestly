import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { disableNetwork, enableNetwork, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDpkNlXsFdkPXN66lsHIwT8WWiCD3XmkxA',
  authDomain: 'nestly-app-2937f.firebaseapp.com',
  projectId: 'nestly-app-2937f',
  storageBucket: 'nestly-app-2937f.firebasestorage.app',
  messagingSenderId: '1003188060969',
  appId: '1:1003188060969:web:c094c7db0acef94cf86d38',
  measurementId: 'G-86Z8B12M6Q',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

const db = getFirestore(app);

export const setFirestoreOfflineMode = async (offline: boolean) => {
  if (offline) {
    await disableNetwork(db);
    return;
  }

  await enableNetwork(db);
};

export { app, auth, db };
