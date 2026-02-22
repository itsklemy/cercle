// App.js — release-ready
import "react-native-gesture-handler";
import "react-native-reanimated";

import React, { useEffect, useRef, useState } from "react";
import { View, Platform, StatusBar, Text, StyleSheet, Image } from "react-native";

import * as Notifications from "expo-notifications";
import * as Splash from "expo-splash-screen";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Updates from "expo-updates";

import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator as createStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { enableScreens } from "react-native-screens";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { isValidElementType } from "react-is";

import { registerForPushTokenAsync } from "./src/notifications/notifications";
import { registerExpoPushToken } from "./src/notifications/registerPushToken"; // ✅ NEW
import { supabase } from "./src/lib/supabase"; // (gardé tel quel)
import { colors } from "./src/theme/colors";

import InterstitialVideoModal from "./src/ads/InterstitialVideoModal";
import { useInterstitialAds } from "./src/ads/useInterstitialAds";
import { PLACEMENTS } from "./src/ads/adCatalog";
import { incAppOpenCountToday } from "./src/ads/adStorage";

// ✅ Optimisations natives
enableScreens(true);

// ✅ Splash: on empêche l’auto-hide dès le chargement du module
Splash.preventAutoHideAsync().catch(() => {});

// ---------- Notifications handler ----------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ---------- Util pour sécuriser les écrans ----------
const pickExport = (mod) => {
  if (!mod) return null;
  if (isValidElementType(mod.default)) return mod.default;
  if (isValidElementType(mod)) return mod;
  if (typeof mod === "object") {
    const keys = Object.keys(mod);
    if (keys.length === 1 && isValidElementType(mod[keys[0]])) return mod[keys[0]];
  }
  return null;
};

const getScreen = (resolver, name) => {
  const mod = resolver();
  const Comp = pickExport(mod);
  if (!Comp) {
    throw new Error(`[SCREEN BAD] ${name}: attendu un composant React valide.`);
  }
  return Comp;
};

// ---------- Deep linking ----------
const linking = {
  prefixes: [Linking.createURL("/"), "cercle://", "https://harmonious-griffin-ec8775.netlify.app"],
  config: {
    screens: {
      Invite: "invite/:token",
    },
  },
};

// ---------- Screens ----------
const SplashScreen = getScreen(() => require("./src/screens/SplashScreen"), "SplashScreen");
const AuthScreen = getScreen(() => require("./src/screens/AuthScreen"), "AuthScreen");
const DashboardScreen = getScreen(() => require("./src/screens/DashboardScreen"), "DashboardScreen");
const CircleScreen = getScreen(() => require("./src/screens/CircleScreen"), "CircleScreen");
const ProfileScreen = getScreen(() => require("./src/screens/ProfileScreen"), "ProfileScreen");
const AddItemScreen = getScreen(() => require("./src/screens/AddItemScreen"), "AddItemScreen");
const ItemDetailScreen = getScreen(() => require("./src/screens/ItemDetailScreen"), "ItemDetailScreen");
const InventoryUpdateScreen = getScreen(
  () => require("./src/screens/InventoryUpdateScreen"),
  "InventoryUpdateScreen"
);
const CategoryItemsScreen = getScreen(
  () => require("./src/screens/CategoryItemsScreen"),
  "CategoryItemsScreen"
);
const MembersScreen = getScreen(() => require("./src/screens/MembersScreen"), "MembersScreen");
const MyReservations = getScreen(
  () => require("./src/screens/MyReservationsScreen"),
  "MyReservationsScreen"
);
const CallDetailScreen = getScreen(() => require("./src/screens/CallDetailScreen"), "CallDetailScreen");
const ThreadScreen = getScreen(() => require("./src/screens/ThreadScreen"), "ThreadScreen");
const InviteScreen = getScreen(() => require("./src/screens/InviteScreen"), "InviteScreen");
const InventoryOnboardingScreen = getScreen(
  () => require("./src/screens/InventoryOnboardingScreen"),
  "InventoryOnboardingScreen"
);

// ---------- Stub ----------
function StubScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <Text style={{ color: colors.subtext }}>Écran en cours de construction</Text>
    </View>
  );
}

// ---------- Header ----------
function AppHeader({ title }) {
  const TOP_H = 56;
  return (
    <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.card }}>
      <View style={[styles.header, { height: TOP_H }]}>
        <View style={styles.headerLeft}>
          <Image source={require("./assets/icon.png")} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>
    </SafeAreaView>
  );
}

// ---------- Tabs ----------
const Tab = createBottomTabNavigator();

function Tabs() {
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 10);
  const TAB_H = 56 + safeBottom;

  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        header: ({ route }) => {
          const mapTitle = { Dashboard: "Accueil", Circle: "Cercle", Profile: "Profil" };
          return <AppHeader title={mapTitle[route.name] ?? "Cercle"} />;
        },
        sceneContainerStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.stroke,
          height: TAB_H,
          paddingTop: 8,
          paddingBottom: safeBottom,
        },
        tabBarActiveTintColor: colors.mint,
        tabBarInactiveTintColor: colors.subtext,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: "Accueil",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Circle"
        component={CircleScreen}
        options={{
          title: "Cercle",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const TabsC = getScreen(() => ({ default: Tabs }), "Tabs");

// ---------- Stack ----------
const Stack = createStackNavigator();

export default function App() {
  const [navReady, setNavReady] = useState(false);

  const navRef = useRef(null);
  const lastRouteRef = useRef(null);
  const { visible: adVisible, currentAd, maybeShow, close } = useInterstitialAds();

  // ✅ IMPORTANT: ce useEffect DOIT être dans le composant (sinon Invalid hook call)
  useEffect(() => {
    (async () => {
      try {
        console.log("[updates] enabled:", Updates.isEnabled);
        console.log("[updates] channel:", Updates.channel);
        console.log("[updates] runtime:", Updates.runtimeVersion);
        console.log("[updates] updateId:", Updates.updateId);

        const res = await Updates.checkForUpdateAsync();
        console.log("[updates] check:", res);

        if (res.isAvailable) {
          await Updates.fetchUpdateAsync();
          console.log("[updates] fetched, reloading…");
          await Updates.reloadAsync();
        }
      } catch (e) {
        console.log("[updates] error:", e?.message || e);
      }
    })();
  }, []);

  // ✅ 1) Enregistrement token (Expo) + save dans profiles
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Ton helper existant (permission + token)
        const token = await registerForPushTokenAsync();
        console.log("APP GOT TOKEN =", token);

        // ✅ Sauvegarde en base (profiles.expo_push_token)
        // On attend une micro-latence au cas où la session n'est pas encore prête
        setTimeout(async () => {
          try {
            if (!mounted) return;
            const res = await registerExpoPushToken();
            console.log("[push] register token to profiles:", res);
          } catch (e) {
            console.log("[push] registerExpoPushToken error:", e?.message || e);
          }
        }, 400);
      } catch (e) {
        console.log("[push] registerForPushTokenAsync error:", e?.message || e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ✅ (optionnel) listener quand user clique une notif
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp?.notification?.request?.content?.data || {};
      console.log("[push] opened notification data:", data);
      // plus tard: navigation selon data.type
    });

    return () => {
      try {
        sub.remove?.();
      } catch {}
    };
  }, []);

  // Cache splash quand prêt
  useEffect(() => {
    if (navReady) Splash.hideAsync().catch(() => {});
  }, [navReady]);

  // filet sécurité splash
  useEffect(() => {
    const t = setTimeout(() => {
      Splash.hideAsync().catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // pub 3e ouverture
  useEffect(() => {
    (async () => {
      try {
        const n = await incAppOpenCountToday();
        if (n >= 3) {
          await maybeShow(PLACEMENTS.OPEN_3RD_TODAY);
        }
      } catch {}
    })();
  }, [maybeShow]);

  const androidTop = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.stroke,
      primary: colors.mint,
    },
  };

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, paddingTop: androidTop, backgroundColor: colors.bg }}>
        <NavigationContainer
          ref={navRef}
          linking={linking}
          theme={navTheme}
          onReady={() => setNavReady(true)}
          onStateChange={() => {
            const route = navRef.current?.getCurrentRoute?.();
            const name = route?.name || null;
            if (!name || name === lastRouteRef.current) return;
            lastRouteRef.current = name;

            if (name === "Dashboard") {
              (async () => {
                try {
                  await maybeShow(PLACEMENTS.DASHBOARD_ENTER);
                } catch {}
              })();
            }
          }}
        >
          <ExpoStatusBar style="light" />
          <Stack.Navigator
            initialRouteName="Splash"
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
          >
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen name="Invite" component={InviteScreen} />
            <Stack.Screen name="AppTabs" component={TabsC} />
            <Stack.Screen name="InventoryOnboarding" component={InventoryOnboardingScreen} />
            <Stack.Screen name="AddItem" component={AddItemScreen} />
            <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
            <Stack.Screen name="CategoryItems" component={CategoryItemsScreen} />
            <Stack.Screen name="CallDetail" component={CallDetailScreen} />
            <Stack.Screen name="Members" component={MembersScreen} />
            <Stack.Screen name="MyReservations" component={MyReservations} />
            <Stack.Screen name="InventoryUpdate" component={InventoryUpdateScreen} />
            <Stack.Screen name="Thread" component={ThreadScreen} />
            <Stack.Screen name="CreateCall" component={StubScreen} />
            <Stack.Screen name="ManageMembers" component={StubScreen} />
            <Stack.Screen name="PickCircle" component={StubScreen} />
            <Stack.Screen name="EditCircle" component={StubScreen} />
            <Stack.Screen name="CallsList" component={StubScreen} />
            <Stack.Screen name="RespondCall" component={StubScreen} />
          </Stack.Navigator>
        </NavigationContainer>

        <InterstitialVideoModal visible={adVisible} ad={currentAd} onClose={close} />
      </View>
    </SafeAreaProvider>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogo: { width: 28, height: 28, borderRadius: 6 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: "900", maxWidth: 220 },
});