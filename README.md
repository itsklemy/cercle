# Cercle (Expo SDK 53)

- Expo SDK: **53**
- React Native: **0.79**
- Push Notifications: remote push **not available in Expo Go (Android)** from SDK 53. Use a **development build** (EAS) for FCM/APNs tests. Local notifications still work in Expo Go.
- Configure env in `app.config.js` (SUPABASE_URL, SUPABASE_ANON_KEY, LYDIA_VENDOR_TOKEN, ...).
- Apply `supabase_schema.sql` in your Supabase project.
- Run:

```bash
npm install
npx expo prebuild --clean   # optional when preparing dev builds
npx expo start              # Metro server
```

To test push:
```bash
npx expo run:android   # or ios (Dev Client)
```

