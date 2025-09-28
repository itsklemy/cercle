// src/utils/paymentMessage.js
export function euro(n){
  return Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR' }).format(n || 0);
}

export function buildOffPlatformMessage({ 
  payToName, payToIban, amountCents, depositCents, feesCents, dueIso, reservationId, itemTitle 
}){
  const lines = [];
  lines.push(`🔔 Règlement pour "${itemTitle}"`);
  if (amountCents) lines.push(`Montant: ${euro(amountCents/100)}`);
  if (depositCents) lines.push(`Dépôt: ${euro(depositCents/100)}`);
  if (feesCents) lines.push(`Frais: ${euro(feesCents/100)}`);
  if (dueIso){
    const due = new Date(dueIso);
    lines.push(`À régler avant le ${due.toLocaleString('fr-FR',{ day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}`);
  }
  if (payToName) lines.push(`Bénéficiaire: ${payToName}`);
  if (payToIban) lines.push(`IBAN: ${payToIban}`);
  lines.push(`Référence: RES-${reservationId}`);
  lines.push('');
  lines.push(`👉 Paiement hors plateforme (virement / Lydia / ce que tu préfères).`);
  return lines.join('\n');
}
