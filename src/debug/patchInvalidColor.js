// src/debug/patchInvalidColor.js
import React from 'react';
import {
  View, ScrollView, FlatList, SectionList, SafeAreaView,
  Pressable, TouchableOpacity, Modal, Text
} from 'react-native';

// garde l'original
const _createEl = React.createElement;

// util: sait-on si c'est un "texte" ?
const isTextLike = (type) =>
  type === Text || type?.displayName?.includes?.('Text') || type?.name === 'Text';

// util: est-ce un conteneur (View & co) ?
const isContainerLike = (type) =>
  type === View ||
  type === ScrollView ||
  type === FlatList ||
  type === SectionList ||
  type === SafeAreaView ||
  type === Pressable ||
  type === TouchableOpacity ||
  type === Modal ||
  type?.displayName?.includes?.('View') ||
  type?.name === 'View';

React.createElement = (type, props, ...children) => {
  try {
    if (props && !isTextLike(type) && isContainerLike(type) && Object.prototype.hasOwnProperty.call(props, 'color')) {
      // LOG très parlant (avec stack)
      const culprit = type?.displayName || type?.name || 'Unknown';
      const keys = Object.keys(props);
      const stack = new Error('[patchInvalidColor] stack').stack;
      // eslint-disable-next-line no-console
      console.error(
        `[patchInvalidColor] Prop "color" supprimé sur <${culprit}>. Props=${JSON.stringify(keys)}`
      );
      // eslint-disable-next-line no-console
      console.error(stack);

      // retire la prop fautive
      const { color, ...rest } = props;
      return _createEl(type, rest, ...children);
    }
  } catch (e) {
    // en cas de souci, on ne bloque pas le rendu
  }
  return _createEl(type, props, ...children);
};
