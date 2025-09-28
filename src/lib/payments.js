import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

const { LYDIA_VENDOR_TOKEN, LYDIA_REDIRECT_URL, STRIPE_PUBLISHABLE_KEY } = (Constants?.expoConfig?.extra || {});

/**
 * Create a payment link for an intent.
 * provider: 'lydia' | 'stripe' (stripe here is a placeholder to integrate with your server / Stripe Checkout)
 */
export async function createPaymentLink({ amountCents, label, provider='lydia', metadata={} }){
  if (provider === 'lydia' && LYDIA_VENDOR_TOKEN){
    // Lydia collect deeplink (no server): opens Lydia app or web
    const amount = (amountCents/100).toFixed(2);
    const params = new URLSearchParams({
      vendor_token: LYDIA_VENDOR_TOKEN,
      amount,
      currency: 'EUR',
      message: label || 'Paiement Cercle',
      type: 'phone',
      redirect_url: LYDIA_REDIRECT_URL || 'cercle://payments/callback'
    }).toString();
    // Using collect web url as a simple fallback
    return `https://lydia-app.com/collect/${label ? encodeURIComponent(label) : 'cercle'}?` + params;
  }
  // Stripe: expect your backend to create a Checkout Session and return url
  if (provider === 'stripe' && STRIPE_PUBLISHABLE_KEY){
    throw new Error('Stripe côté client non configuré. Créez une session côté serveur et retournez son URL.');
  }
  throw new Error('Aucun fournisseur de paiement configuré.');
}

export async function openPaymentLink(url){
  const can = await Linking.canOpenURL(url);
  if (!can) throw new Error('Impossible d’ouvrir le lien de paiement.');
  return Linking.openURL(url);
}
