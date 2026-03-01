// app.config.js
export default ({ config }) => {
  const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? "prod";
  const isDev = APP_ENV === "dev";

  const base = {
    ...config,

    name: "Cercle",
    slug: "cercle",
    scheme: "cercle",

    version: "7.0.3",
    runtimeVersion: "7.0.3",

    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    assetBundlePatterns: ["**/*"],
    jsEngine: "hermes",

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.cercle.app",
      teamId: "HM95CV96WV",
      buildNumber: "14",

      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UISupportedInterfaceOrientations: ["UIInterfaceOrientationPortrait"],
        UIBackgroundModes: ["remote-notification"],
        UISupportedInterfaceOrientations: ["UIInterfaceOrientationPortrait"],
        // ✅ remote-notification toujours présent — nécessaire pour expo-notifications
        // en build natif (App Store ET dev-client).
        // Expo Go l'injecte lui-même, mais un build standalone en a besoin ici.
        UIBackgroundModes: ["remote-notification"],

        associatedDomains: ["applinks:stunning-pothos-07a3d3.netlify.app"],

        NSAppTransportSecurity: isDev
          ? {
              NSAllowsArbitraryLoads: true,
              NSExceptionDomains: {
                localhost: {
                  NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
                "127.0.0.1": {
                  NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
                "exp.host": {
                  NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
                "expo.dev": {
                  NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
                "exp.direct": {
                  NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
              },
            }
          : { NSAllowsArbitraryLoads: false },

        NSContactsUsageDescription:
          "Nous utilisons tes contacts pour inviter des proches dans ton cercle.",
        NSCameraUsageDescription: "Ajoute des photos à tes objets.",
        NSPhotoLibraryUsageDescription:
          "Sélectionne des photos pour tes annonces.",
        NSPhotoLibraryAddUsageDescription:
          "Enregistre des photos si nécessaire.",
        NSMicrophoneUsageDescription:
          "Enregistre de l'audio si une fonctionnalité le nécessite.",

        EXUpdatesEnabled: isDev ? false : true,
      },
    },

    android: {
      package: "com.cercle.app",
      versionCode: 56,

      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#141827",
      },

      permissions: [
        "INTERNET",
        "VIBRATE",
        "WAKE_LOCK",
        "READ_CONTACTS",
        "WRITE_CONTACTS",
        "android.permission.POST_NOTIFICATIONS",
      ],
    },

    web: { bundler: "metro" },

    extra: {
      EXPO_PUBLIC_APP_ENV: APP_ENV,
      eas: { projectId: "4de9ab1e-5c50-4931-b7a7-8c47a38d9f10" },
      EXPO_PUBLIC_SUPABASE_URL: "https://omfvrlcelpxoguonqzbb.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY:
        "sb_publishable_1ok4DF0c3OJ2yIozh8xvrw_6ny7xPwn",
    },
  };

  base.updates = isDev
    ? { enabled: false }
    : {
        enabled: true,
        url: "https://u.expo.dev/4de9ab1e-5c50-4931-b7a7-8c47a38d9f10",
      };

  // ✅ expo-notifications dans commonPlugins (pas seulement en prod)
  // Sans ça, le module natif n'est pas lié dans le build dev-client,
  // et Constants n'est pas initialisé correctement → erreur "constants doesn't exist"
  const commonPlugins = [
    ["expo-build-properties", { ios: { deploymentTarget: "15.1" } }],

    [
      "expo-splash-screen",
      {
        preventAutoHide: false,
        backgroundColor: "#141827",
        resizeMode: "contain",
      },
    ],

    "@react-native-community/datetimepicker",
    "expo-contacts",
    "expo-image-picker",
    "expo-font",

    // ✅ Déplacé ici : présent dans TOUS les builds (dev-client + prod)
    // L'icône de notif n'est utilisée que sur Android/prod, pas d'impact en dev.
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#57ffca",
      },
    ],
  ];

  base.plugins = isDev
    ? ["expo-dev-client", ...commonPlugins]
    : [...commonPlugins];

  return base;
};