// src/screens/CircleTabScreen.js
// ✅ Composant wrapper — remplace la référence directe à CircleScreen dans AppTabs
// Lit user_mode depuis Supabase et rend le bon écran.
//
// Dans ton navigator :
//   import CircleTabScreen from "../screens/CircleTabScreen";
//   <Tab.Screen name="Circle" component={CircleTabScreen} />

import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import CircleScreen    from "./CircleScreen";
import ProCircleScreen from "./ProCircleScreen";

export default function CircleTabScreen(props) {
  const [mode,  setMode]  = useState(null);  // null = chargement
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (alive) { setMode("particulier"); setReady(true); } return; }
        const { data } = await supabase.from("profiles")
          .select("user_mode").eq("id", user.id).single();
        if (alive) {
          setMode(data?.user_mode || "particulier");
          setReady(true);
        }
      } catch {
        if (alive) { setMode("particulier"); setReady(true); }
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex:1, backgroundColor:"#07090F", alignItems:"center", justifyContent:"center" }}>
        <ActivityIndicator color="#5CFFB0"/>
      </View>
    );
  }

  return mode === "pro"
    ? <ProCircleScreen {...props}/>
    : <CircleScreen    {...props}/>;
}
