import type { FirebaseOptions } from 'firebase/app'

/**
 * Konfigurasi Firebase project "kasir-qjt".
 * Nilai ini memang publik (tertanam di aplikasi web); keamanan data dijaga oleh
 * login + aturan Firestore (lihat firestore.rules).
 */
export const FIREBASE_CONFIG: FirebaseOptions = {
  apiKey: 'AIzaSyD8MF4dhQh3MzSS_dcso-8A2Q6nZvEqZBk',
  authDomain: 'kasir-qjt.firebaseapp.com',
  projectId: 'kasir-qjt',
  storageBucket: 'kasir-qjt.firebasestorage.app',
  messagingSenderId: '212285552168',
  appId: '1:212285552168:web:93d46c46f59f214c9fe71d',
}
