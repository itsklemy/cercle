// src/hooks/useResponsive.js
import { useMemo } from 'react';
import { useWindowDimensions, Platform } from 'react-native';

export const useResponsive = () => {
  const { width: w, height: h, fontScale } = useWindowDimensions();

  // Dimensions utiles
  const shortest = Math.min(w, h);
  const longest  = Math.max(w, h);

  // Détection plates-formes
  const isIOS  = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';
  const isWeb  = Platform.OS === 'web';

  // Règles simples et robustes :
  // - iPad natif : Platform.isPad (iOS)
  // - iPad en Split View : largeur < 768 mais device iPad -> reste iPad
  // - Tablette Android : seuil standard 600dp sur le plus petit côté
  const isIPadDevice = isIOS && (Platform.isPad === true);
  const isAndroidTablet = isAndroid && shortest >= 600;

  // Classes de taille façon iOS (utile pour UI "compact"/"regular")
  const horizontalRegular = w >= 768;  // iPad plein écran, ou large split
  const verticalRegular   = h >= 768;

  // Flags finaux
  const flags = useMemo(() => {
    const isSmallPhone = shortest < 360;
    const isPhone = !isIPadDevice && !isAndroidTablet;
    const isIPad  = isIPadDevice;               // vrai même en split view
    const isTablet = isIPadDevice || isAndroidTablet;
    const isLargeScreen = longest >= 1024 || isWeb; // grands écrans & web

    // Échelle “douce” basée sur une largeur de référence 390 (iPhone 12/13)
    const scale = Math.min(Math.max(w / 390, 0.85), 1.3);

    // Proposition de colonnes adaptatives (cartes, grilles…)
    const columns =
      isLargeScreen ? 3 :
      horizontalRegular ? 2 : 1;

    return {
      isSmallPhone,
      isPhone,
      isIPad,
      isTablet,
      isLargeScreen,
      horizontalRegular,
      verticalRegular,
      scale,
      columns,
    };
  }, [w, h, shortest, longest, isIPadDevice, isAndroidTablet, isWeb]);

  return {
    w, h, fontScale,
    platform: Platform.OS,
    ...flags,
  };
};

export default useResponsive;
