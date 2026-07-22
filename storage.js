'use strict';

(() => {
  const KEY_PREFIX = 'card-sort:draft:';
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

  function draftKey(deckId) {
    const normalizedId = String(deckId || '').trim();
    if (!normalizedId) throw new TypeError('A deck ID is required.');
    return `${KEY_PREFIX}${normalizedId}`;
  }

  function parseDraft(raw, key, storeName) {
    if (!raw) return null;

    try {
      const value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : null;
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
    const key = draftKey(deckId);

    for (const entry of browserStores) {
      try {
        const draft = parseDraft(entry.storage.getItem(key), key, entry.name);
        if (draft) {
          lastStorageMode = entry.name;
          return draft;
        }
      } catch (error) {
        console.warn(`Could not read a draft from ${entry.name}.`, error);
      }
    }

    const memoryDraft = memoryStore.get(key);
    if (!memoryDraft) return null;

    lastStorageMode = 'memory';
    return clone(memoryDraft);
  }

  function saveDraft(deckId, candidate) {
    if (!candidate || typeof candidate !== 'object') {
      throw new TypeError('The draft must be an object.');
    }

    const key = draftKey(deckId);
    const now = new Date().toISOString();
    const draft = {
      ...candidate,
      deckId: String(deckId),
      createdAt: candidate.createdAt || now,
      updatedAt: now,
    };

    const serialized = JSON.stringify(draft);

    for (const entry of browserStores) {
      try {
        entry.storage.setItem(key, serialized);
        lastStorageMode = entry.name;
        return clone(draft);
      } catch (error) {
        console.warn(`Could not save to ${entry.name}; trying another storage mode.`, error);
      }
    }

    // Final fallback: the current page remains usable even when browser
    // persistence is blocked, such as in a sandboxed iframe or strict privacy mode.
    memoryStore.set(key, clone(draft));
    lastStorageMode = 'memory';
    return clone(draft);
  }

  function deleteDraft(deckId) {
    const key = draftKey(deckId);

    for (const entry of browserStores) {
      try {
        entry.storage.removeItem(key);
      } catch (error) {
        console.warn(`Could not remove the draft from ${entry.name}.`, error);
      }
    }

    memoryStore.delete(key);
  }

  function makeId(prefix = 'id') {
    const cleanPrefix = String(prefix || 'id').replace(/[^a-z0-9_-]/gi, '-');

    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${cleanPrefix}-${window.crypto.randomUUID()}`;
    }

    const random = Math.random().toString(36).slice(2, 10);
    return `${cleanPrefix}-${Date.now().toString(36)}-${random}`;
  }

  function getStorageMode() {
    return lastStorageMode;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  window.CardSortStorage = Object.freeze({
    loadDraft,
    saveDraft,
    deleteDraft,
    makeId,
    getStorageMode,
  });
})();
