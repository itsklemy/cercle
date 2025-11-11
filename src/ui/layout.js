import { useWindowDimensions } from 'react-native';

export const useResponsive = () => {
  const { width } = useWindowDimensions();
  const contentMax = width > 600 ? 600 : null; // Limite sur desktop/large screens
  return { contentMax };
};