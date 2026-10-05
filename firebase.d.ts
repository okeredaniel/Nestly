declare module 'firebase/app' {
  export * from '@firebase/app';
}

declare module 'firebase/auth' {
  export * from '@firebase/auth';
  export function getReactNativePersistence(storage: any): any;
}

declare module 'firebase/firestore' {
  export * from '@firebase/firestore';
}

declare module 'firebase/auth/react-native' {
  export * from '@firebase/auth';
  export function getReactNativePersistence(storage: any): any;
}
