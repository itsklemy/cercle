// src/ads/adStorage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'ads_v1';

function dayKeyLocal() {
  // Date "jour" basé sur le téléphone (suffisant ici)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function k(...parts) {
  return [PREFIX, ...parts].join(':');
}

export async function incAppOpenCountToday() {
  const day = dayKeyLocal();
  const key = k('openCount', day);
  const raw = await AsyncStorage.getItem(key);
  const n = raw ? parseInt(raw, 10) || 0 : 0;
  const next = n + 1;
  await AsyncStorage.setItem(key, String(next));
  return next;
}

export async function getAppOpenCountToday() {
  const day = dayKeyLocal();
  const raw = await AsyncStorage.getItem(k('openCount', day));
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export async function getShownCountToday(placement) {
  const day = dayKeyLocal();
  const raw = await AsyncStorage.getItem(k('shown', placement, day));
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export async function incShownCountToday(placement) {
  const day = dayKeyLocal();
  const key = k('shown', placement, day);
  const n = (await getShownCountToday(placement)) || 0;
  const next = n + 1;
  await AsyncStorage.setItem(key, String(next));
  return next;
}

export async function getLastShownTs(placement) {
  const raw = await AsyncStorage.getItem(k('lastShownTs', placement));
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export async function setLastShownTs(placement, ts = Date.now()) {
  await AsyncStorage.setItem(k('lastShownTs', placement), String(ts));
}
