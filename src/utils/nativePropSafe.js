// utils/nativePropSafe.js
import { Platform } from "react-native";

export function nativePropSafe(props, allowlistIOS = [], allowlistAndroid = []) {
  const allow = Platform.OS === "ios" ? allowlistIOS : allowlistAndroid;
  return Object.fromEntries(Object.entries(props).filter(([k]) => allow.includes(k)));
}
