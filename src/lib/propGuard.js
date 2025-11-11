// src/lib/propGuard.js
import React from 'react';

// On garde l'original
const _create = React.createElement;

// Types de composants "View-like" sur lesquels "color" est illégitime
const BAD_NAME_RE = /(View|TouchableOpacity|Pressable|SafeAreaView|ScrollView|FlatList)/i;

export function installPropGuard() {
  if (!__DEV__) return;
  React.createElement = (type, props, ...children) => {
    try {
      // Nom lisible
      const name =
        typeof type === 'string'
          ? type
          : (type && (type.displayName || type.name)) || 'Unknown';

      // Si un prop "color" est passé à un conteneur -> log très visible
      if (props && Object.prototype.hasOwnProperty.call(props, 'color') && BAD_NAME_RE.test(name)) {
        // On tronque pour ne pas noyer le log
        const { color, style, ...rest } = props || {};
        // Evite d'afficher des fonctions/éléments énormes
        const summarized = Object.keys(rest || {}).slice(0, 6);
        // Log terminal + redbox
        console.error(`❌ [COLOR-PROP-ON-VIEW] "${name}" a reçu un prop "color".`);
        console.error('   color =', color);
        console.error('   autres props =', summarized);
      }
    } catch {}
    return _create(type, props, ...children);
  };
}
