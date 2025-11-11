// app.config.js
export default ({ config }) => {
  const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'dev';
  const isDev = APP_ENV === 'dev';

  const base = {
    ...config,
    name: isDev ? 'Cercle Dev' : 'Cercle',
    slug: 'cercle',
    scheme: isDev ? 'cercledev' : 'cercle',
    version: '1.1.0',
    runtimeVersion: '1.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    assetBundlePatterns: ['**/*'],
    jsEngine: 'hermes',

    ios: {
      supportsTablet: true,
      bundleIdentifier: isDev ? 'com.cercle.dev' : 'com.cercle.app',
      teamId: 'HM95CV96WV',
      buildNumber: '1',
      deploymentTarget: '15.1',
      infoPlist: {
        UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
        // En PROD on laisse les remote notifications, en DEV on évite (cf. plus bas)
        UIBackgroundModes: isDev ? [] : ['remote-notification'],
        ITSAppUsesNonExemptEncryption: false,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
          NSExceptionDomains: {
            localhost: { NSTemporaryExceptionAllowsInsecureHTTPLoads: true, NSIncludesSubdomains: true },
            '127.0.0.1': { NSTemporaryExceptionAllowsInsecureHTTPLoads: true, NSIncludesSubdomains: true },
            'exp.host': { NSTemporaryExceptionAllowsInsecureHTTPLoads: true, NSIncludesSubdomains: true },
            'expo.dev': { NSTemporaryExceptionAllowsInsecureHTTPLoads: true, NSIncludesSubdomains: true },
            'exp.direct': { NSTemporaryExceptionAllowsInsecureHTTPLoads: true, NSIncludesSubdomains: true },
          },
        },
        NSContactsUsageDescription: 'Nous utilisons tes contacts pour inviter des proches dans ton cercle.',
        NSCameraUsageDescription: 'Ajoute des photos à tes objets.',
        NSPhotoLibraryUsageDescription: 'Sélectionne des photos pour tes annonces.',
        NSPhotoLibraryAddUsageDescription: 'Enregistre des photos si nécessaire.',
        NSMicrophoneUsageDescription: 'Enregistre de l’audio si une fonctionnalité le nécessite.',

        // 🔒 coupe expo-updates en Debug (évite le bundle embedded)
        EXUpdatesEnabled: false,
      },
    },

    android: {
      package: isDev ? 'com.cercle.dev' : 'com.cercle.app',
      adaptiveIcon: { foregroundImage: './assets/icon.png', backgroundColor: '#141827' },
      permissions: ['READ_CONTACTS', 'WRITE_CONTACTS', 'INTERNET', 'VIBRATE', 'WAKE_LOCK'],
    },

    web: { bundler: 'metro' },

    extra: {
      EXPO_PUBLIC_APP_ENV: APP_ENV,
      eas: { projectId: '4de9ab1e-5c50-4931-b7a7-8c47a38d9f10' },

      // Supabase (publishable côté client)
      EXPO_PUBLIC_SUPABASE_URL: 'https://omfvrlcelpxoguonqzbb.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_1ok4DF0c3OJ2yIozh8xvrw_6ny7xPwn',
      // ⚠️ La clé secrète reste côté serveur (env EAS uniquement)
    },
  };

  // updates: désactivé en DEV, activé + URL en PROD
  base.updates = isDev
    ? { enabled: false }
    : { enabled: true, url: 'https://u.expo.dev/4de9ab1e-5c50-4931-b7a7-8c47a38d9f10' };

  // Plugins : on évite expo-notifications en DEV pour ne pas exiger les entitlements Push
  base.plugins = isDev
    ? [
        'expo-dev-client',
        ['expo-splash-screen', { preventAutoHide: false, backgroundColor: '#141827', image: null, resizeMode: 'contain' }],
        'expo-contacts',
        'expo-image-picker',
        'expo-font',
      ]
    : [
        'expo-dev-client',
        ['expo-splash-screen', { preventAutoHide: false, backgroundColor: '#141827', image: null, resizeMode: 'contain' }],
        ['expo-notifications', { icon: './assets/notification-icon.png', color: '#57ffca' }],
        'expo-contacts',
        'expo-image-picker',
        'expo-font',
      ];

  return base;
};
