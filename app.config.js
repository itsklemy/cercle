// app.config.js
export default ({ config }) => {
  const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? "prod";
  const isDev = APP_ENV === "dev";

  const base = {
    ...config,

    name: "Cercle",
    slug: "cercle",
    scheme: "cercle",

    version: "7.0.6",
    runtimeVersion: "7.0.5",

    orientation: "portrait",

    // ✅ icon.png = icône iOS + fallback. Doit être 1024×1024, fond plein, sans arrondi.
    icon: "./assets/icon.png",

    userInterfaceStyle: "dark", // ✅ forcé dark — évite le flash blanc au démarrage
    assetBundlePatterns: ["**/*"],
    jsEngine: "hermes",

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.cercle.app",
      teamId: "HM95CV96WV",
      buildNumber: "18",

      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UISupportedInterfaceOrientations: ["UIInterfaceOrientationPortrait"],
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
      versionCode: 60,
      googleServicesFile: "./google-services.json",

      // ✅ CORRECTIF ICÔNE :
      // foregroundImage doit être une image dédiée adaptive (fond transparent,
      // sujet centré, marges ~33% de chaque côté) — PAS icon.png directement.
      // Si tu n'as pas encore assets/adaptive-icon.png, crée-le ou utilise
      // un outil comme https://adapticon.toasteddesign.com
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png", // ✅ fichier dédié
        monochromeImage: "./assets/adaptive-icon.png", // ✅ Android 13+ themed icons
        backgroundColor: "#07090F",                    // ✅ même couleur que BG app
      },

      // ✅ CORRECTIF BOUTONS/TEXTE COUPÉS sur Android récent (API 35+) :
      // Sans ça, le système force edge-to-edge et les insets ne sont pas
      // correctement transmis à React Native.
      softwareKeyboardLayoutMode: "pan", // ✅ évite que le clavier coupe les boutons

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

  const commonPlugins = [
    [
      "expo-build-properties",
      {
        ios: { deploymentTarget: "15.1" },
        // ✅ CORRECTIF EDGE-TO-EDGE Android 15 (API 35+) :
        // Désactive le comportement edge-to-edge forcé par le système
        // pour que SafeAreaView et KeyboardAvoidingView fonctionnent correctement.
       android: {
  compileSdkVersion: 35,
  targetSdkVersion: 35,
  minSdkVersion: 24,
  enableEdgeToEdge: true, // ✅ gère l'edge-to-edge proprement
},
      },
    ],

    [
      "expo-splash-screen",
      {
        preventAutoHide: false,
        backgroundColor: "#07090F", // ✅ même couleur que BG app (était #141827, incohérent)
        image: "./assets/splash.png",
        // ✅ "cover" remplit tout l'écran sans bandes noires sur les grands écrans
        resizeMode: "cover",
      },
    ],

    "@react-native-community/datetimepicker",
    "expo-contacts",
    "expo-image-picker",
    "expo-font",
    "expo-apple-authentication",
    "expo-web-browser",

    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#1DFFC2",
      },
    ],
  ];

  base.plugins = isDev
    ? ["expo-dev-client", ...commonPlugins]
    : [...commonPlugins];

  return base;
};