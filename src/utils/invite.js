// src/utils/invite.js
import 'react-native-get-random-values';
import { randomUUID } from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

/**
 * Invite un contact à rejoindre un cercle.
 * - Crée une entrée dans `invites`
 * - Génère un token + expiration
 * - Partage un lien universel et un deep link
 */
export async function inviteContactToCircle({ circleId, name, email, phone }) {
  const token = randomUUID();
  const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 jours

  // crée l’invitation dans Supabase
  const { data, error } = await supabase
    .from('invites')
    .insert([
      {
        circle_id: circleId,
        phone: phone || '',
        name: name || null,
        status: 'pending',
        token,
        expires_at
      }
    ])
    .select('id')
    .single();

  if (error) throw error;

  // lien universel (web) + deep link (app)
  const universal = `https://cercle.app/i/${token}`;
  const deep = Linking.createURL(`invite?token=${token}`); // ex: cercle://invite?token=...

  const message = `👋 ${name || ''}, rejoins mon cercle sur Cercle : ${universal}\n(Si l'app est installée : ${deep})`;

  // feuille de partage native
  await Share.share({ message, url: universal });

  // copie auto dans le presse-papiers
  await Clipboard.setStringAsync(universal);

  return data?.id;
}
