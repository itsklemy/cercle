// src/utils/invite.js
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

/**
 * Invite UNE personne à rejoindre un cercle via la RPC create_invite.
 * Le serveur :
 *  - génère le token + expiry
 *  - nettoie PII via triggers
 *  - renvoie l'URL universelle prête à partager
 */
export async function inviteContactToCircle({ circleId, name, phone }) {
  if (!circleId) throw new Error('circleId requis');

  // Appelle la RPC qui retourne directement l’URL publique
  const { data: url, error } = await supabase.rpc('create_invite', {
    p_circle_id: circleId,
    p_phone: phone ?? null,
    p_name: name ?? null,
  });

  if (error) throw error;
  if (!url) throw new Error('URL d’invitation non générée');

  // Deep link (optionnel) si tu veux l’ajouter au message
  const deep = Linking.createURL(`invite?url=${encodeURIComponent(url)}`); 
  const message = `👋 ${name || ''} rejoins mon cercle sur Cercle : ${url}\n(Si l'app est installée : ${deep})`;

  // Partage natif + copie presse-papiers
  await Share.share({ message, url });
  await Clipboard.setStringAsync(url);

  return url;
}

/**
 * Invite PLUSIEURS contacts d’un coup.
 * contacts = [{ name, phone }, ...]
 * Retourne le tableau [{ idx, input_name, input_phone, invite_url }]
 */
export async function inviteContactsBulk({ circleId, contacts }) {
  if (!circleId) throw new Error('circleId requis');
  if (!Array.isArray(contacts)) throw new Error('contacts[] attendu');

  const { data, error } = await supabase.rpc('add_contacts_to_circle', {
    p_circle_id: circleId,
    p_contacts: contacts, // [{name, phone}]
  });

  if (error) throw error;
  return data || [];
}
