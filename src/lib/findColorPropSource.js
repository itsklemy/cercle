// Traqueur "color" → View/Text/etc. pour afficher la stack exacte en RedBox
import React from 'react';
import { View, Text, ScrollView, TextInput, Image, Pressable } from 'react-native';

// Active/désactive le crash volontaire sur la 1ʳᵉ occurrence
const KILL_ON_FIRST_HIT = true;

const NativeTypes = new Set([View, Text, ScrollView, TextInput, Image, Pressable]);
const _createElement = React.createElement;

let killed = false;
const seen = new Set();

function reportAndMaybeCrash(typeName, value) {
  // Nettoie la stack pour sauter le traqueur lui-même
  const err = new Error(
    `[findColorPropSource] Prop "color" passé à <${typeName}> — ` +
    `utilise "style={{ color: ... }}" ou filtre ce prop avant de le spreader. ` +
    `(valeur: ${JSON.stringify(value)})`
  );

  // Affiche la stack complète dans Metro
  console.error(err);

  // Crash volontaire (une seule fois) pour RedBox avec fichier/ligne exacts
  if (KILL_ON_FIRST_HIT && !killed) {
    killed = true;
    // Lancer en fin de tick pour que la stack remonte proprement dans RN
    setTimeout(() => { throw err; }, 0);
  }
}

function scrubProps(type, props) {
  if (!props || typeof props !== 'object') return props;
  if (!('color' in props)) return props;

  const typeName = typeof type === 'string' ? type : (type?.displayName || type?.name || 'Unknown');

  // Évite le spam si on reste en mode warn uniquement
  const key = `${typeName}`;
  if (!seen.has(key)) {
    seen.add(key);
    reportAndMaybeCrash(typeName, props.color);
  } else {
    // Même si déjà vu, on crash sur la première occurrence globale quand KILL_ON_FIRST_HIT = true
    if (KILL_ON_FIRST_HIT && !killed) reportAndMaybeCrash(typeName, props.color);
  }

  // On ne supprime rien ici : le but est d’obtenir la stack exacte
  return props;
}

React.createElement = function patchedCreateElement(type, props, ...rest) {
  try {
    if (typeof type === 'string' || NativeTypes.has(type)) {
      props = scrubProps(type, props ? { ...props } : props);
    }
  } catch (e) {
    console.warn('[findColorPropSource] patch error:', e);
  }
  return _createElement(type, props, ...rest);
};
