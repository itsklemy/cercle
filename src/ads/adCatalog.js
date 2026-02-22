// src/ads/adCatalog.js

// Placements supportés (à garder stable)
export const PLACEMENTS = {
  DASHBOARD_ENTER: 'dashboard_enter',
  OPEN_3RD_TODAY: 'open_3rd_today',
};

// Format d’une pub vidéo interstitial
// - skipAfterSec: bouton "Passer" après X secondes
// - maxPerDay: cap par jour et par placement
// - minIntervalSec: délai minimal entre 2 affichages (anti-spam)
export const DEFAULT_ADS = [
  {
    id: 'demo_dash_001',
    placement: PLACEMENTS.DASHBOARD_ENTER,
    active: true,
    title: 'Sponsorisé',
    videoUrl: 'https://your-cdn-or-storage/video-dashboard.mp4',
    clickUrl: 'https://cercle.app', // optionnel
    skipAfterSec: 5,
    maxPerDay: 1,
    minIntervalSec: 60 * 60, // 1h
  },
  {
    id: 'demo_open_001',
    placement: PLACEMENTS.OPEN_3RD_TODAY,
    active: true,
    title: 'Sponsorisé',
    videoUrl: 'https://your-cdn-or-storage/video-open.mp4',
    clickUrl: 'https://cercle.app',
    skipAfterSec: 5,
    maxPerDay: 1,
    minIntervalSec: 60 * 60,
  },
];

// Choix de la pub à afficher (plus tard tu remplaces par Supabase)
export function pickAdForPlacement(placement) {
  const candidates = DEFAULT_ADS.filter(a => a.active && a.placement === placement);
  if (!candidates.length) return null;
  return candidates[0];
}
