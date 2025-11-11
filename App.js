// App.js — robuste contre "Element type is invalid", Splash d’abord, toutes les routes
import 'react-native-gesture-handler';
import 'react-native-reanimated';

import React, { useEffect, useState } from 'react';
import {
  View,
  Platform,
  StatusBar,
  Text,
  StyleSheet,
  NativeModules,
  Image,
} from 'react-native';
import * as Splash from 'expo-splash-screen';
import Constants from 'expo-constants';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator as createStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { enableScreens } from 'react-native-screens';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from './src/theme/colors';
import { isValidElementType } from 'react-is';

enableScreens(true);
Splash.preventAutoHideAsync().catch(() => {});

// ----------------------
// Helper: charge un écran de façon tolérante (default, memo, forwardRef, named unique)
// ----------------------
const pickExport = (mod) => {
  if (!mod) return null;
  if (isValidElementType(mod.default)) return mod.default;
  if (isValidElementType(mod)) return mod;
  if (typeof mod === 'object') {
    const keys = Object.keys(mod);
    // si un seul export et que c'est un élément valide
    if (keys.length === 1 && isValidElementType(mod[keys[0]])) return mod[keys[0]];
  }
  return null;
};

const getScreen = (resolver, name) => {
  const mod = resolver();
  const Comp = pickExport(mod);

  if (__DEV__) {
    const rawKeys = mod && typeof mod === 'object' ? Object.keys(mod) : [];
    console.log(`[SCREEN TYPE] ${name}: valid=${!!Comp}`, 'raw keys=', rawKeys);
  }

  if (!Comp) {
    throw new Error(
      `[SCREEN BAD] ${name}: attendu un composant React valide (function/memo/forwardRef).` +
        ` Vérifie les exports (default vs named) et le chemin du fichier.`
    );
  }
  return Comp;
};

// ----------------------
// Charge tous les écrans via require (fiable pour Metro / iOS Release)
// ----------------------
const SplashScreen        = getScreen(() => require('./src/screens/SplashScreen'),          'SplashScreen');
const AuthScreen          = getScreen(() => require('./src/screens/AuthScreen'),            'AuthScreen');
const DashboardScreen     = getScreen(() => require('./src/screens/DashboardScreen'),       'DashboardScreen');
const CircleScreen        = getScreen(() => require('./src/screens/CircleScreen'),          'CircleScreen');
const ProfileScreen       = getScreen(() => require('./src/screens/ProfileScreen'),         'ProfileScreen');
const AddItemScreen       = getScreen(() => require('./src/screens/AddItemScreen'),         'AddItemScreen');
const ItemDetailScreen    = getScreen(() => require('./src/screens/ItemDetailScreen'),      'ItemDetailScreen');
const MembersScreen       = getScreen(() => require('./src/screens/MembersScreen'),         'MembersScreen');
const MyReservations      = getScreen(() => require('./src/screens/MyReservationsScreen'),  'MyReservationsScreen');
const CallDetailScreen    = getScreen(() => require('./src/screens/CallDetailScreen'),      'CallDetailScreen');

// ----------------------
// Stubs (si ces routes existent mais pas encore codées)
// ----------------------
function StubScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ color: colors.subtext }}>Écran en cours de construction</Text>
    </View>
  );
}

// ----------------------
// Badge runtime (debug build info)
// ----------------------
function EnvBadge() {
  const scriptURL = NativeModules?.SourceCode?.scriptURL ?? 'embedded';
  const isFromMetro = typeof scriptURL === 'string' && scriptURL.startsWith('http');
  const source = isFromMetro ? 'Metro/Dev Server' : 'Embedded bundle (binaire/OTA)';

  const expoCfg = Constants?.expoConfig ?? {};
  const extra = expoCfg?.extra ?? {};
  const env = extra?.APP_ENV ?? extra?.EXPO_PUBLIC_APP_ENV ?? 'dev';

  const info = {
    dev: __DEV__,
    source,
    version: expoCfg?.version ?? 'N/A',
    buildNumber: Platform.OS === 'ios'
      ? (expoCfg?.ios?.buildNumber ?? 'N/A')
      : (expoCfg?.android?.versionCode ?? 'N/A'),
    appName: expoCfg?.name ?? 'Cercle',
    env,
    scriptURL,
    sdk: expoCfg?.sdkVersion ?? 'unknown',
  };

  if (__DEV__) console.log('🔎 Runtime info:', info);

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLine}>
        {`Source: ${info.source} | dev=${info.dev ? 'true' : 'false'}`}
      </Text>
      <Text style={styles.badgeLine}>
        {`app=${info.appName} | sdk=${info.sdk}`}
      </Text>
      <Text style={styles.badgeLine}>
        {`version=${info.version} | build=${info.buildNumber} | env=${info.env}`}
      </Text>
      <Text style={styles.badgeUrl} numberOfLines={1}>
        {info.scriptURL}
      </Text>
    </View>
  );
}

// ----------------------
// Header custom commun
// ----------------------
function AppHeader({ title }) {
  const TOP_H = 56;
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.card }}>
      <View style={[styles.header, { height: TOP_H }]}>
        <View style={styles.headerLeft}>
          <Image
            source={require('./assets/icon.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>
    </SafeAreaView>
  );
}

// ----------------------
// Tabs principales
// ----------------------
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
          const mapTitle = { Dashboard: 'Accueil', Circle: 'Cercle', Profile: 'Profil' };
          return <AppHeader title={mapTitle[route.name] ?? 'Cercle'} />;
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
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Circle"
        component={CircleScreen}
        options={{
          title: 'Cercle',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// On passe Tabs via le loader aussi (si un bundling exotique l’enveloppe)
const TabsC = getScreen(() => ({ default: Tabs }), 'Tabs');

// ----------------------
// Navigation root
// ----------------------
const Stack = createStackNavigator();

export default function App() {
  const [navReady, setNavReady] = useState(false);

  useEffect(() => {
    if (navReady) Splash.hideAsync().catch(() => {});
  }, [navReady]);

  // Safety net: auto-hide splash si on ne reçoit pas onReady (par ex. en dev)
  useEffect(() => {
    const t = setTimeout(() => {
      Splash.hideAsync().catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  const androidTop = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

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
        <NavigationContainer theme={navTheme} onReady={() => setNavReady(true)}>
          <ExpoStatusBar style="light" />
          <EnvBadge />

          <Stack.Navigator
            initialRouteName="Splash" // Splash en premier
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
          >
            {/* Auth / Boot */}
            <Stack.Screen name="Splash"           component={SplashScreen} />
            <Stack.Screen name="Auth"             component={AuthScreen} />

            {/* App principale avec tabs */}
            <Stack.Screen name="AppTabs"          component={TabsC} />

            {/* Flots fonctionnels */}
            <Stack.Screen name="AddItem"          component={AddItemScreen} />
            <Stack.Screen name="ItemDetail"       component={ItemDetailScreen} />
            <Stack.Screen name="CallDetail"       component={CallDetailScreen} />
            <Stack.Screen name="Members"          component={MembersScreen} />
            <Stack.Screen name="MyReservations"   component={MyReservations} />

            {/* Stubs temporaires (si ces routes sont référencées par d’autres écrans) */}
            <Stack.Screen name="CreateCall"       component={StubScreen} />
            <Stack.Screen name="ManageMembers"    component={StubScreen} />
            <Stack.Screen name="PickCircle"       component={StubScreen} />
            <Stack.Screen name="EditCircle"       component={StubScreen} />
            <Stack.Screen name="CallsList"        component={StubScreen} />
            <Stack.Screen name="RespondCall"      component={StubScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

// ----------------------
// Styles
// ----------------------
const styles = StyleSheet.create({
  // Badge runtime
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 9999,
    backgroundColor: 'black',
    opacity: 0.9,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  badgeLine: { color: 'white', fontWeight: '600', fontSize: 12 },
  badgeUrl: { color: '#BBB', fontSize: 10 },

  // Header custom
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 28, height: 28, borderRadius: 6 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '900', maxWidth: 220 },
});
