import { useCallback, useRef, useState } from 'react';
import { getShownCountToday, incShownCountToday, getLastShownTs, setLastShownTs } from './adStorage';
import { pickAdForPlacement } from './adCatalog';

export function useInterstitialAds() {
  const [currentAd, setCurrentAd] = useState(null);
  const [visible, setVisible] = useState(false);
  const busyRef = useRef(false);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(() => setCurrentAd(null), 250);
  }, []);

  const maybeShow = useCallback(async (placement) => {
    if (busyRef.current) return false;
    busyRef.current = true;

    try {
      const ad = pickAdForPlacement(placement);
      if (!ad) return false;

      const maxPerDay = ad.maxPerDay ?? 1;
      const shownToday = await getShownCountToday(placement);
      if (shownToday >= maxPerDay) return false;

      const minIntervalSec = ad.minIntervalSec ?? 0;
      const lastTs = await getLastShownTs(placement);
      const now = Date.now();
      if (lastTs && minIntervalSec > 0) {
        const deltaSec = (now - lastTs) / 1000;
        if (deltaSec < minIntervalSec) return false;
      }

      await incShownCountToday(placement);
      await setLastShownTs(placement, now);

      setCurrentAd(ad);
      setVisible(true);
      return true;
    } finally {
      busyRef.current = false;
    }
  }, []);

  return { visible, currentAd, maybeShow, close };
}
