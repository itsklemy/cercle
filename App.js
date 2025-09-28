import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import SplashScreen from './src/screens/SplashScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import CircleScreen from './src/screens/CircleScreen';
import AddItemScreen from './src/screens/AddItemScreen';
import ItemDetailScreen from './src/screens/ItemDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MembersScreen from './src/screens/MembersScreen';
import AuthScreen from './src/screens/AuthScreen';
import MyReservationsScreen from './src/screens/MyReservationsScreen'; // ✅ import
import { colors } from './src/theme/colors';
import { supabase, hasSupabaseConfig } from './src/lib/supabase';
import { registerForPush } from './src/lib/notify'; // ✅ une seule fois

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs() {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.stroke,
          height: 70,
          paddingBottom: 25,
        },
        tabBarActiveTintColor: colors.mint,
        tabBarInactiveTintColor: colors.subtext,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="view-dashboard-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Circle"
        component={CircleScreen}
        options={{
          title: 'Cercle',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="account-group-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="account-circle-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      if (hasSupabaseConfig() && supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setUser(session?.user || null);
        supabase.auth.onAuthStateChange((_event, session) =>
          setUser(session?.user || null)
        );
      }
      await registerForPush(); // ✅ appelé une seule fois
      setChecking(false);
    })();
  }, []);

  if (checking) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color={colors.mint} />
        <StatusBar style="light" />
      </View>
    );
  }

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.stroke,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.text,
        }}
      >
        {!user ? (
          <Stack.Screen
            name="Splash"
            component={SplashScreen}
            options={{ headerShown: false }}
          />
        ) : null}
        {!user ? (
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ title: 'Connexion', headerShown: true }}
          />
        ) : null}
        <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Ajouter' }} />
        <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: 'Détail' }} />
        <Stack.Screen name="Members" component={MembersScreen} options={{ title: 'Membres du cercle' }} />
        <Stack.Screen
          name="MyReservations" // ✅ enregistré dans le Stack
          component={MyReservationsScreen}
          options={{ title: 'Mes réservations' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
