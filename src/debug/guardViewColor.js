// src/debug/guardViewColor.js
import React from 'react';
import * as RN from 'react-native';

const origCreateElement = React.createElement;
function isRNView(type) {
  return (
    type === RN.View ||
    type?.displayName === 'RCTView' ||
    type?.displayName === 'View' ||
    type?.name === 'View'
  );
}

function stripColorFromStyle(style) {
  // Normalise en array puis nettoie
  const arr = Array.isArray(style) ? style : [style];
  let changed = false;
  const cleaned = arr.map((s) => {
    if (!s || typeof s !== 'object') return s;
    if ('color' in s) {
      const { color, ...rest } = s;
      changed = true;
      return rest;
    }
    return s;
  });
  return { style: Array.isArray(style) ? cleaned : cleaned[0], changed };
}

React.createElement = (type, props, ...children) => {
  if (props && isRNView(type)) {
    let flagged = false;
    let nextProps = props;

    // 1) prop direct
    if ('color' in props) {
      flagged = true;
      const { color, ...rest } = nextProps;
      nextProps = rest;
    }

    // 2) color dans style
    if (props?.style) {
      const { style, changed } = stripColorFromStyle(props.style);
      if (changed) {
        flagged = true;
        nextProps = { ...nextProps, style };
      }
    }

    if (flagged) {
      // logs + stack exploitable côté JS
      // eslint-disable-next-line no-console
      console.error('[DEBUG] Prop/style "color" détecté sur <View>.', {
        fromProps: 'color' in (props || {}),
        hasStyle: !!props?.style,
      });
      // eslint-disable-next-line no-console
      console.trace('[DEBUG] Stack JS (remonte à ton fichier fautif)');
    }

    return origCreateElement(type, nextProps, ...children);
  }

  return origCreateElement(type, props, ...children);
};

// eslint-disable-next-line no-console
console.log('[DEBUG] guardViewColor v2 actif (props + style)');
