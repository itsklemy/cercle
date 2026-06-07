// App.js — release-ready + intégration Pro
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

import { registerExpoPushToken } from "./src/notifications/registerPushToken";
import { setupNotificationListeners } from "./src/notifications/notifications";
import { supabase } from "./src/lib/supabase";
import { colors } from "./src/theme/colors";

import InterstitialVideoModal from "./src/ads/InterstitialVideoModal";
import { useInterstitialAds } from "./src/ads/useInterstitialAds";
import { PLACEMENTS } from "./src/ads/adCatalog";
import { incAppOpenCountToday } from "./src/ads/adStorage";

enableScreens(true);
Splash.preventAutoHideAsync().catch(() => {});

/* ─── Screen resolver ─── */
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
  const mod  = resolver();
  const Comp = pickExport(mod);
  if (!Comp) throw new Error(`[SCREEN BAD] ${name}: attendu un composant React valide.`);
  return Comp;
};

/* ─── Deep linking ─── */
const linking = {
  prefixes: [
    Linking.createURL("/"),
    "cercle://",
    "https://harmonious-griffin-ec8775.netlify.app",
  ],
  config: {
    screens: {
      Auth:                       "auth",
      Invite:                     "invite/:token",
      InventoryOnboardingScreen:  "inventory-onboarding",
      ProOnboardingScreen:        "pro-onboarding",   // ✅ NOUVEAU
      AppTabs:                    "app",
    },
  },
};

/* ─── Screens existants ─── */
const AuthScreen       = getScreen(() => require("./src/screens/AuthScreen"),       "AuthScreen");
const CircleScreen     = getScreen(() => require("./src/screens/CircleScreen"),     "CircleScreen");
const ProfileScreen    = getScreen(() => require("./src/screens/ProfileScreen"),    "ProfileScreen");
const AddItemScreen    = getScreen(() => require("./src/screens/AddItemScreen"),    "AddItemScreen");
const ItemDetailScreen = getScreen(() => require("./src/screens/ItemDetailScreen"), "ItemDetailScreen");
const InventoryUpdateScreen  = getScreen(() => require("./src/screens/InventoryUpdateScreen"),  "InventoryUpdateScreen");
const CategoryItemsScreen    = getScreen(() => require("./src/screens/CategoryItemsScreen"),    "CategoryItemsScreen");
const MembersScreen          = getScreen(() => require("./src/screens/MembersScreen"),          "MembersScreen");
const MyReservations         = getScreen(() => require("./src/screens/MyReservationsScreen"),   "MyReservationsScreen");
const CallDetailScreen       = getScreen(() => require("./src/screens/CallDetailScreen"),       "CallDetailScreen");
const ThreadScreen           = getScreen(() => require("./src/screens/ThreadScreen"),           "ThreadScreen");
const InviteScreen           = getScreen(() => require("./src/screens/InviteScreen"),           "InviteScreen");
const InventoryOnboardingScreen = getScreen(() => require("./src/screens/InventoryOnboardingScreen"), "InventoryOnboardingScreen");
const ForceUpdateScreen      = getScreen(() => require("./src/screens/ForceUpdateScreen"),      "ForceUpdateScreen");

// ✅ NOUVEAUX — Pro
const ProOnboardingScreen = getScreen(() => require("./src/screens/ProOnboardingScreen"), "ProOnboardingScreen");
const ProCircleScreen     = getScreen(() => require("./src/screens/ProCircleScreen"),     "ProCircleScreen");

function StubScreen() {
  return (
    <View style={{ flex:1, alignItems:"center", justifyContent:"center", backgroundColor:colors.bg }}>
      <Text style={{ color:colors.subtext }}>Écran en cours de construction</Text>
    </View>
  );
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/* ─── Header ─── */
function AppHeader({ title }) {
  return (
    <SafeAreaView edges={["top"]} style={{ backgroundColor:colors.card }}>
      <View style={[styles.header,{height:56}]}>
        <View style={styles.headerLeft}>
          <Image source={require("./assets/icon.png")} style={styles.headerLogo} resizeMode="contain"/>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        </View>
        <View style={{width:24}}/>
      </View>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────
   CIRCLE TAB — switcher Particulier / Pro
   Lit user_mode depuis Supabase une seule fois
   et rend le bon écran sans modifier la nav.
───────────────────────────────────────────── */
function CircleTabScreen(props) {
  const [mode,  setMode]  = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data:{ user } } = await supabase.auth.getUser();
        if (!user) { if (alive) { setMode("particulier"); setReady(true); } return; }
        const { data } = await supabase.from("profiles")
          .select("user_mode").eq("id", user.id).single();
        if (alive) { setMode(data?.user_mode || "particulier"); setReady(true); }
      } catch {
        if (alive) { setMode("particulier"); setReady(true); }
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex:1, backgroundColor:colors.bg, alignItems:"center", justifyContent:"center" }}>
        <Text style={{ color:colors.subtext, fontSize:13 }}>Chargement…</Text>
      </View>
    );
  }

  return mode === "pro"
    ? <ProCircleScreen {...props}/>
    : <CircleScreen    {...props}/>;
}

/* ─── Tabs ─── */
const Tab = createBottomTabNavigator();

function Tabs() {
  const insets     = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 10);

  return (
    <Tab.Navigator
      initialRouteName="Circle"
      screenOptions={{
        header: ({ route }) => {
          const titles = { Circle:"Cercle", Profile:"Moi" };
          return <AppHeader title={titles[route.name] ?? "Cercle"}/>;
        },
        sceneContainerStyle: { backgroundColor:colors.bg },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor:  colors.stroke,
          height:          56 + safeBottom,
          paddingTop:      8,
          paddingBottom:   safeBottom,
        },
        tabBarActiveTintColor:   colors.mint,
        tabBarInactiveTintColor: colors.subtext,
        tabBarLabelStyle: { fontSize:12, fontWeight:"700" },
      }}
    >
      {/* ✅ CircleTabScreen remplace CircleScreen — auto-switche selon user_mode */}
      <Tab.Screen
        name="Circle"
        component={CircleTabScreen}
        options={{
          title: "Cercle",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group-outline" color={color} size={size}/>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "Moi",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={size}/>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const TabsC = getScreen(() => ({ default: Tabs }), "Tabs");

/* ─── Root Stack ─── */
const Stack = createStackNavigator();

export default function App() {
  const [navReady, setNavReady] = useState(false);
  const navRef    = useRef(null);
  const lastRoute = useRef(null);
  const { visible:adVisible, currentAd, maybeShow, close } = useInterstitialAds();

  /* Push token */
  useEffect(() => {
    let mounted = true;

    const initPush = async () => {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name:               "default",
            importance:         Notifications.AndroidImportance.MAX,
            vibrationPattern:   [0,250,250,250],
            enableVibrate:      true,
            enableLights:       true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
          console.log("[push] android channel ready");
        }
        const { data:{ session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || null;
        console.log("[push] initial session userId =", userId);
        if (mounted && userId) {
          const res = await registerExpoPushToken();
          console.log("[push] initial register result =", res);
        }
      } catch (e) { console.log("[push] init error =", e?.message||e); }
    };

    initPush();
    const detachNotifications = setupNotificationListeners();

    const { data:authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const userId = session?.user?.id || null;
      console.log("[push] auth event =", event, "userId =", userId);
      if (!mounted) return;
      if (userId) {
        try {
          const res = await registerExpoPushToken();
          console.log("[push] auth register result =", res);
        } catch (e) { console.log("[push] auth register error =", e?.message||e); }
      }
    });

    return () => {
      mounted = false;
      detachNotifications?.();
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  /* Splash */
  useEffect(() => { Splash.hideAsync().catch(() => {}); }, []);

  /* Pub 3e ouverture */
  useEffect(() => {
    (async () => {
      try {
        const n = await incAppOpenCountToday();
        if (n >= 3) await maybeShow(PLACEMENTS.OPEN_3RD_TODAY);
      } catch {}
    })();
  }, [maybeShow]);

  const androidTop = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.bg,
      card:       colors.card,
      text:       colors.text,
      border:     colors.stroke,
      primary:    colors.mint,
    },
  };

  return (
    <SafeAreaProvider>
      <View style={{ flex:1, paddingTop:androidTop, backgroundColor:colors.bg }}>
        <NavigationContainer
          ref={navRef}
          linking={linking}
          theme={navTheme}
          onReady={() => setNavReady(true)}
          onStateChange={() => {
            const route = navRef.current?.getCurrentRoute?.();
            const name  = route?.name || null;
            if (!name || name === lastRoute.current) return;
            lastRoute.current = name;
            if (name === "Circle") {
              (async () => {
                try { await maybeShow(PLACEMENTS.DASHBOARD_ENTER); } catch {}
              })();
            }
          }}
        >
          <ExpoStatusBar style="light"/>
          <Stack.Navigator
            initialRouteName="Auth"
            screenOptions={{ headerShown:false, contentStyle:{ backgroundColor:colors.bg } }}
          >
            {/* ── Auth & onboarding ── */}
            <Stack.Screen name="Splash"  component={AuthScreen}/>
            <Stack.Screen name="Auth"    component={AuthScreen}/>
            <Stack.Screen name="Invite"  component={InviteScreen}/>

            {/* ── Onboarding Particulier (existant) ── */}
            <Stack.Screen name="InventoryOnboardingScreen" component={InventoryOnboardingScreen}/>

            {/* ── ✅ Onboarding Pro (nouveau) ── */}
            <Stack.Screen name="ProOnboardingScreen" component={ProOnboardingScreen}/>

            {/* ── App principale ── */}
            <Stack.Screen name="AppTabs" component={TabsC}/>

            {/* ── Stack screens ── */}
            <Stack.Screen name="AddItem"         component={AddItemScreen}/>
            <Stack.Screen name="ItemDetail"      component={ItemDetailScreen}/>
            <Stack.Screen name="CategoryItems"   component={CategoryItemsScreen}/>
            <Stack.Screen name="CallDetail"      component={CallDetailScreen}/>
            <Stack.Screen name="Members"         component={MembersScreen}/>
            <Stack.Screen name="MyReservations"  component={MyReservations}/>
            <Stack.Screen name="InventoryUpdate" component={InventoryUpdateScreen}/>
            <Stack.Screen name="Thread"          component={ThreadScreen}/>
            <Stack.Screen name="ForceUpdate"     component={ForceUpdateScreen}/>

            {/* ── Stubs ── */}
            <Stack.Screen name="CreateCall"    component={StubScreen}/>
            <Stack.Screen name="ManageMembers" component={StubScreen}/>
            <Stack.Screen name="PickCircle"    component={StubScreen}/>
            <Stack.Screen name="EditCircle"    component={StubScreen}/>
            <Stack.Screen name="CallsList"     component={StubScreen}/>
            <Stack.Screen name="RespondCall"   component={StubScreen}/>
          </Stack.Navigator>
        </NavigationContainer>

        <InterstitialVideoModal visible={adVisible} ad={currentAd} onClose={close}/>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:"row", alignItems:"center", justifyContent:"space-between",
    backgroundColor:colors.card, paddingHorizontal:12,
    borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:colors.stroke,
  },
  headerLeft:  { flexDirection:"row", alignItems:"center", gap:10 },
  headerLogo:  { width:28, height:28, borderRadius:6 },
  headerTitle: { color:colors.text, fontSize:16, fontWeight:"900", maxWidth:220 },
});