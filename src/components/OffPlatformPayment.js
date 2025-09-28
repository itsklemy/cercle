// src/components/OffPlatformPayment.js
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../theme/colors';
import { buildOffPlatformMessage, euro } from '../utils/paymentMessage';
import { supabase } from '../lib/supabase';

export default function OffPlatformPayment({ reservation, isOwner }){
  const [saving, setSaving] = useState(false);

  const msg = useMemo(()=>{
    return buildOffPlatformMessage({
      payToName: reservation.pay_to_name || reservation.owner_name || '',
      payToIban: reservation.pay_to_iban || '',
      amountCents: reservation.price_cents_snapshot || reservation.amount_cents || null,
      depositCents: reservation.deposit_cents_snapshot || null,
      feesCents: reservation.fees_cents_snapshot || null,
      dueIso: reservation.payment_due_at || reservation.start_at, // par défaut avant le début
      reservationId: reservation.id,
      itemTitle: reservation.item_title || 'Objet'
    });
  },[reservation]);

  const copy = async ()=>{ await Clipboard.setStringAsync(msg); Alert.alert('Copié','Le message est dans le presse-papiers.'); };
  const shareMsg = async ()=>{ await Share.share({ message: msg }); };

  const markPaid = async ()=>{
    try{
      setSaving(true);
      const { error } = await supabase.from('reservations').update({ payment_status:'awaiting' }).eq('id', reservation.id);
      if (error) throw error;
      Alert.alert('Merci','Tu as indiqué avoir payé. Le propriétaire confirmera.');
    }catch(e){ Alert.alert('Erreur', e.message||'Impossible de mettre à jour.'); }
    finally{ setSaving(false); }
  };

  const ownerConfirm = async ()=>{
    try{
      setSaving(true);
      const { error } = await supabase.from('reservations').update({ payment_status:'paid' }).eq('id', reservation.id);
      if (error) throw error;
      Alert.alert('Confirmé','Paiement confirmé.');
    }catch(e){ Alert.alert('Erreur', e.message||'Impossible de confirmer.'); }
    finally{ setSaving(false); }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Paiement (hors plateforme)</Text>
      {reservation.price_cents_snapshot ? (
        <Text style={styles.line}>Montant: <Text style={styles.bold}>{euro(reservation.price_cents_snapshot/100)}</Text></Text>
      ) : <Text style={styles.line}>Montant: <Text style={styles.bold}>à l’amiable / gratuit</Text></Text>}
      {!!reservation.deposit_cents_snapshot && <Text style={styles.line}>Dépôt: {euro(reservation.deposit_cents_snapshot/100)}</Text>}
      {!!reservation.fees_cents_snapshot && <Text style={styles.line}>Frais: {euro(reservation.fees_cents_snapshot/100)}</Text>}

      <View style={{ height:6 }} />
      <TouchableOpacity onPress={copy} style={styles.btnGhost}><Text style={styles.btnGhostTxt}>Copier le message</Text></TouchableOpacity>
      <TouchableOpacity onPress={shareMsg} style={styles.btn}><Text style={styles.btnTxt}>Partager…</Text></TouchableOpacity>

      <View style={{ height:8 }} />
      {reservation.payment_status === 'paid' ? (
        <Text style={styles.paid}>✅ Paiement confirmé</Text>
      ) : reservation.payment_status === 'awaiting' ? (
        isOwner ? (
          <TouchableOpacity onPress={ownerConfirm} disabled={saving} style={[styles.btn, { backgroundColor:'#10301f', borderColor:'#214a2f' }]}>
            <Text style={styles.btnTxt}>Confirmer la réception</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.info}>En attente de confirmation du propriétaire…</Text>
        )
      ) : (
        // unpaid
        isOwner ? (
          <Text style={styles.info}>Partage le message ci-dessus pour indiquer comment payer.</Text>
        ) : (
          <TouchableOpacity onPress={markPaid} disabled={saving} style={[styles.btn, { backgroundColor:'#10301f', borderColor:'#214a2f' }]}>
            <Text style={styles.btnTxt}>J’ai payé</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box:{ backgroundColor:'#101726', borderColor:'#202a44', borderWidth:1, borderRadius:14, padding:12 },
  title:{ color: colors.text, fontWeight:'800', marginBottom:6 },
  line:{ color: colors.subtext },
  bold:{ color: colors.text, fontWeight:'800' },
  btn:{ marginTop:8, backgroundColor: colors.mint, padding:12, borderRadius:12, alignItems:'center', borderWidth:1, borderColor:'#1e4035' },
  btnTxt:{ color: colors.bg, fontWeight:'900' },
  btnGhost:{ marginTop:6, padding:12, borderRadius:12, alignItems:'center', borderWidth:1, borderColor:'#2a3557', backgroundColor:'#0e172a' },
  btnGhostTxt:{ color: colors.text, fontWeight:'800' },
  info:{ color: colors.subtext, marginTop:8 },
  paid:{ color: colors.mint, fontWeight:'900', marginTop:8 },
});
