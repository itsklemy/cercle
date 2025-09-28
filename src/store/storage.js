import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getOnboarded(){ const v = await AsyncStorage.getItem('cercle_onboarded'); return v === '1'; }
export async function setOnboarded(b){ await AsyncStorage.setItem('cercle_onboarded', b ? '1' : '0'); }

export async function getItems(){ const raw = await AsyncStorage.getItem('cercle_items'); return raw ? JSON.parse(raw) : []; }
export async function saveItems(items){ await AsyncStorage.setItem('cercle_items', JSON.stringify(items)); }

export async function getReservations(){ const raw = await AsyncStorage.getItem('cercle_res'); return raw ? JSON.parse(raw) : []; }
export async function saveReservations(list){ await AsyncStorage.setItem('cercle_res', JSON.stringify(list)); }

export async function getMembers(){ const raw = await AsyncStorage.getItem('cercle_members'); return raw ? JSON.parse(raw) : []; }
export async function saveMembers(m){ await AsyncStorage.setItem('cercle_members', JSON.stringify(m)); }

// Seeders (only used when offline/no cloud)
export async function seedIfEmpty(){ const x = await getItems(); if (x.length) return; await saveItems([]); }
export async function seedMembersIfEmpty(){ const x = await getMembers(); if (x.length) return; await saveMembers([]); }
