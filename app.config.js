// app.config.js
export default ({ config }) => {
  // Par défaut on est en PROD ; mets EXPO_PUBLIC_APP_ENV=dev pour un build dev interne
  const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'prod';
  const isDev = APP_ENV === 'dev';

  const base = {
    ...config,

    // 🔹 Nom affiché sur l’app (toujours "Cercle")
    name: 'Cercle',
    slug: 'cercle',
    scheme: 'cercle',

    // ✅ Version App Store (train) — change ici quand Apple ferme une version
    version: '2.1.2',

    // ✅ Runtime version (OTA) — tu peux la garder alignée sur la version
    runtimeVersion: '2.1.2',

    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    assetBundlePatterns: ['**/*'],
    jsEngine: 'hermes',

    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.cercle.app',
      teamId: 'HM95CV96WV',

      // ✅ Incrémente à CHAQUE upload vers App Store Connect
      buildNumber: '5',

      infoPlist: {
        UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
        UIBackgroundModes: isDev ? [] : ['remote-notification'],
        ITSAppUsesNonExemptEncryption: false,

        // Universal Links (à laisser ici si tu en as besoin)
        associatedDomains: ['applinks:stunning-pothos-07a3d3.netlify.app'],

        // ATS: permissif en dev, strict en prod
        NSAppTransportSecurity: isDev
          ? {
              NSAllowsArbitraryLoads: true,
              NSExceptionDomains: {
                localhost: {
                  NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
                '127.0.0.1': {
                  NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
                'exp.host': {
                  NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
                'expo.dev': {
                  NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
                'exp.direct': {
                  NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
              },
            }
          : { NSAllowsArbitraryLoads: false },

        // Permissions strings
        NSContactsUsageDescription:
          'Nous utilisons tes contacts pour inviter des proches dans ton cercle.',
        NSCameraUsageDescription: 'Ajoute des photos à tes objets.',
        NSPhotoLibraryUsageDescription:
          'Sélectionne des photos pour tes annonces.',
        NSPhotoLibraryAddUsageDescription:
          'Enregistre des photos si nécessaire.',
        NSMicrophoneUsageDescription:
          'Enregistre de l’audio si une fonctionnalité le nécessite.',

        // Updates
        EXUpdatesEnabled: isDev ? false : true,
      },
    },

    android: {
      package: 'com.cercle.app',

      // ✅ Incrémente à CHAQUE upload Google Play
      versionCode: 3,

      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#141827',
      },
      permissions: [
        'INTERNET',
        'VIBRATE',
        'WAKE_LOCK',
        'READ_CONTACTS',
        'WRITE_CONTACTS',
        'android.permission.POST_NOTIFICATIONS', // Android 13+
      ],
    },

    web: { bundler: 'metro' },

    extra: {
      EXPO_PUBLIC_APP_ENV: APP_ENV,
      eas: { projectId: '4de9ab1e-5c50-4931-b7a7-8c47a38d9f10' },

      // Supabase (publishable côté client)
      EXPO_PUBLIC_SUPABASE_URL: 'https://omfvrlcelpxoguonqzbb.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_1ok4DF0c3OJ2yIozh8xvrw_6ny7xPwn',
    },
  };

  // OTA updates : OFF en dev, ON en prod
  base.updates = isDev
    ? { enabled: false }
    : {
        enabled: true,
        url: 'https://u.expo.dev/4de9ab1e-5c50-4931-b7a7-8c47a38d9f10',
      };

  // Plugins communs (deploymentTarget iOS fixé ici)
  const commonPlugins = [
    ['expo-build-properties', { ios: { deploymentTarget: '15.1' } }],
    [
      'expo-splash-screen',
      {
        preventAutoHide: false,
        backgroundColor: '#141827',
        image: null,
        resizeMode: 'contain',
      },
    ],
    'expo-contacts',
    'expo-image-picker',
    'expo-font',
  ];

  base.plugins = isDev
    ? ['expo-dev-client', ...commonPlugins]
    : [
        ...commonPlugins,
        [
          'expo-notifications',
          { icon: './assets/notification-icon.png', color: '#57ffca' },
        ],
      ];

  return base;
};
