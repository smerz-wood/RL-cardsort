'use strict';

(() => {
  const KEY_PREFIX = 'card-sort:draft:';
  const LEGACY_KEY_PREFIX = 'library-card-sort:v3:';
  const memoryStore = new Map();
  let lastStorageMode = 'memory';

  const browserStores = [
    createBrowserStore('localStorage'),
    createBrowserStore('sessionStorage'),
  ].filter(Boolean);

  function createBrowserStore(name) {
    try {
      const storage = window[name];
      if (!storage) return null;

      const testKey = `${KEY_PREFIX}storage-test`;
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);

      return { name, storage };
    } catch (error) {
      console.warn(`${name} is unavailable; trying another storage mode.`, error);
      return null;
    }
  }

  function validateDeck(deckId) {
    const normalizedId = String(deckId || '').trim();
    if (!normalizedId) throw new TypeError('A deck ID is required.');

    if (window.CARD_DECKS && !window.CARD_DECKS[normalizedId]) {
      throw new Error(`Unknown card deck: ${normalizedId}`);
    }

    return normalizedId;
  }

  function draftKey(deckId) {
    return `${KEY_PREFIX}${validateDeck(deckId)}`;
  }

  function legacyDraftKey(deckId) {
    return `${LEGACY_KEY_PREFIX}${validateDeck(deckId)}`;
  }

  function makeId(prefix = 'id') {
    const cleanPrefix = String(prefix || 'id').replace(/[^a-z0-9_-]/gi, '-');

    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${cleanPrefix}-${window.crypto.randomUUID()}`;
    }

    const random = Math.random().toString(36).slice(2, 10);
    return `${cleanPrefix}-${Date.now().toString(36)}-${random}`;
  }

  function shuffle(values) {
    const result = Array.from(values);
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function createNewDraft(deckId, participantCode = '') {
    const normalizedId = validateDeck(deckId);
    const deck = window.CARD_DECKS?.[normalizedId];

    if (!deck || !Array.isArray(deck.cards)) {
      throw new Error(`Deck data is unavailable for ${normalizedId}.`);
    }

    const now = new Date().toISOString();

    return {
      schemaVersion: 3,
      deckId: normalizedId,
      participantCode: String(participantCode || '').trim().slice(0, 32),
      createdAt: now,
      updatedAt: now,
      result: {
        categories: [1, 2, 3].map(() => ({
          id: makeId('category'),
          name: '',
          cards: [],
        })),
        uncategorized: shuffle(deck.cards.map(card => card.id)),
      },
    };
  }

  function normalizeDraft(deckId, candidate) {
    const normalizedId = validateDeck(deckId);
    if (!candidate || typeof candidate !== 'object') return null;

    const deck = window.CARD_DECKS?.[normalizedId];
    if (!deck || !Array.isArray(deck.cards)) {
      return {
        ...clone(candidate),
        deckId: normalizedId,
      };
    }

    const validCardIds = new Map(deck.cards.map(card => [String(card.id), card.id]));
    const seenCardIds = new Set();
    const sourceResult = candidate.result && typeof candidate.result === 'object'
      ? candidate.result
      : {};

    function takeCardId(value) {
      const key = String(value);
      if (!validCardIds.has(key) || seenCardIds.has(key)) return null;
      seenCardIds.add(key);
      return validCardIds.get(key);
    }

    const categories = [];
    const sourceCategories = Array.isArray(sourceResult.categories)
      ? sourceResult.categories
      : [];

    for (const category of sourceCategories) {
      if (!category || typeof category !== 'object') continue;

      const cards = [];
      for (const cardId of Array.isArray(category.cards) ? category.cards : []) {
        const normalizedCardId = takeCardId(cardId);
        if (normalizedCardId !== null) cards.push(normalizedCardId);
      }

      categories.push({
        id: typeof category.id === 'string' && category.id
          ? category.id
          : makeId('category'),
        name: String(category.name || '').slice(0, 120),
        cards,
      });
    }

    const uncategorized = [];
    for (const cardId of Array.isArray(sourceResult.uncategorized) ? sourceResult.uncategorized : []) {
      const normalizedCardId = takeCardId(cardId);
      if (normalizedCardId !== null) uncategorized.push(normalizedCardId);
    }

    for (const card of deck.cards) {
      if (!seenCardIds.has(String(card.id))) uncategorized.push(card.id);
    }

    const now = new Date().toISOString();

    return {
      schemaVersion: 3,
      deckId: normalizedId,
      participantCode: String(candidate.participantCode || '').trim().slice(0, 32),
      createdAt: candidate.createdAt || now,
      updatedAt: candidate.updatedAt || now,
      result: { categories, uncategorized },
    };
  }

  function parseDraft(raw, key, storeName, deckId) {
    if (!raw) return null;

    try {
      return normalizeDraft(deckId, JSON.parse(raw));
    } catch (error) {
      console.warn(`Ignoring an invalid draft from ${storeName}.`, error);
      removeFromStore(key, storeName);
      return null;
    }
  }

  function removeFromStore(key, storeName) {
    if (storeName === 'memory') {
      memoryStore.delete(key);
      return;
    }

    const entry = browserStores.find(store => store.name === storeName);
    if (!entry) return;

    try {
      entry.storage.removeItem(key);
    } catch (error) {
      console.warn(`Could not remove an invalid draft from ${storeName}.`, error);
    }
  }

  function loadDraft(deckId) {
    const normalizedId = validateDeck(deckId);
    const key = draftKey(normalizedId);
    const legacyKey = legacyDraftKey(normalizedId);

    for (const entry of browserStores) {
      try {
        let draft = parseDraft(entry.storage.getItem(key), key, entry.name, normalizedId);

        if (!draft) {
          draft = parseDraft(entry.storage.getItem(legacyKey), legacyKey, entry.name, normalizedId);
          if (draft) {
            entry.storage.setItem(key, JSON.stringify(draft));
            entry.storage.removeItem(legacyKey);
          }
        }

        if (draft) {
          lastStorageMode = entry.name;
          return draft;
        }
      } catch (error) {
        console.warn(`Could not read a draft from ${entry.name}.`, error);
      }
    }

    const memoryDraft = memoryStore.get(key) || memoryStore.get(legacyKey);
    if (!memoryDraft) return null;

    lastStorageMode = 'memory';
    return normalizeDraft(normalizedId, clone(memoryDraft));
  }

  function saveDraft(deckId, candidate) {
    const normalizedId = validateDeck(deckId);
    const normalized = normalizeDraft(normalizedId, candidate);
    if (!normalized) throw new TypeError('The draft must be a valid object.');

    normalized.updatedAt = new Date().toISOString();
    const key = draftKey(normalizedId);
    const serialized = JSON.stringify(normalized);

    for (const entry of browserStores) {
      try {
        entry.storage.setItem(key, serialized);
        lastStorageMode = entry.name;
        return clone(normalized);
      } catch (error) {
        console.warn(`Could not save to ${entry.name}; trying another storage mode.`, error);
      }
    }

    memoryStore.set(key, clone(normalized));
    lastStorageMode = 'memory';
    return clone(normalized);
  }

  function clearDraft(deckId) {
    const key = draftKey(deckId);
    const legacyKey = legacyDraftKey(deckId);

    for (const entry of browserStores) {
      for (const storageKey of [key, legacyKey]) {
        try {
          entry.storage.removeItem(storageKey);
        } catch (error) {
          console.warn(`Could not remove the draft from ${entry.name}.`, error);
        }
      }
    }

    memoryStore.delete(key);
    memoryStore.delete(legacyKey);
  }

  function getStorageMode() {
    return lastStorageMode;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  window.CardSortStorage = Object.freeze({
    createNewDraft,
    normalizeDraft,
    loadDraft,
    saveDraft,
    clearDraft,
    deleteDraft: clearDraft,
    makeId,
    getStorageMode,
  });
})();
