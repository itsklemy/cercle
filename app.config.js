// Expo app config
export default {
  name: "Cercle",
  slug: "cercle",
  scheme: "cercle",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  updates: { fallbackToCacheTimeout: 0 },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.cercle.app" // <-- IMPORTANT
  },
  android: {
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#141827" },
    package: "com.cercle.app"
  },
  web: { bundler: "metro" },
  extra: {
    SUPABASE_URL: process.env.SUPABASE_URL || "https://omfvrlcelpxoguonqzbb.supabase.co",
    SUPABASE_ANON_KEY:
      process.env.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tZnZybGNlbHB4b2d1b25xemJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NzQzODgsImV4cCI6MjA3NDQ1MDM4OH0.h4-qoyRPuzu7h7XOnNasVheW970gMl73LQxFbmxlTYo",
    LYDIA_VENDOR_TOKEN: process.env.LYDIA_VENDOR_TOKEN || "",
    LYDIA_REDIRECT_URL: process.env.LYDIA_REDIRECT_URL || "cercle://payments/callback",
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",
    eas: {
      projectId: "4de9ab1e-5c50-4931-b7a7-8c47a38d9f10" // <-- IMPORTANT
    }
  },
  plugins: [
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#57ffca"
      }
    ]
  ]
};
