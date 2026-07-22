
'use strict';

window.CardSortStorage = (() => {
  const STORAGE_PREFIX = 'library-card-sort:v3';

  function validateDeck(deckId) {
    if (!window.CARD_DECKS || !window.CARD_DECKS[deckId]) {
      throw new Error(`Unknown deck: ${deckId}`);
    }
  }

  function storageKey(deckId) {
    validateDeck(deckId);
    return `${STORAGE_PREFIX}:${deckId}`;
  }

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    validateDeck(deckId);
    const now = new Date().toISOString();
    const cardIds = window.CARD_DECKS[deckId].cards.map(card => card.id);
    return {
      schemaVersion: 3,
      deckId,
      participantCode: String(participantCode || '').trim().slice(0, 32),
      createdAt: now,
      updatedAt: now,
      result: {
        categories: [1, 2, 3].map(() => ({id: makeId('category'), name: '', cards: []})),
        uncategorized: shuffle(cardIds),
      },
    };
  }

  function normalizeDraft(deckId, candidate) {
    validateDeck(deckId);
    if (!candidate || typeof candidate !== 'object' || candidate.deckId !== deckId) return null;
    const deckCardIds = new Set(window.CARD_DECKS[deckId].cards.map(card => card.id));
    const seen = new Set();
    const result = candidate.result && typeof candidate.result === 'object' ? candidate.result : {};
    const categories = Array.isArray(result.categories) ? result.categories : [];
    const normalizedCategories = categories.map(category => {
      const cards = Array.isArray(category.cards)
        ? category.cards.filter(cardId => deckCardIds.has(cardId) && !seen.has(cardId) && seen.add(cardId))
        : [];
      return {
        id: String(category.id || makeId('category')),
        name: String(category.name || '').slice(0, 120),
        cards,
      };
    });
    const uncategorized = Array.isArray(result.uncategorized)
      ? result.uncategorized.filter(cardId => deckCardIds.has(cardId) && !seen.has(cardId) && seen.add(cardId))
      : [];
    for (const cardId of deckCardIds) {
      if (!seen.has(cardId)) uncategorized.push(cardId);
    }
    return {
      schemaVersion: 3,
      deckId,
      participantCode: String(candidate.participantCode || '').trim().slice(0, 32),
      createdAt: candidate.createdAt || new Date().toISOString(),
      updatedAt: candidate.updatedAt || new Date().toISOString(),
      result: {categories: normalizedCategories, uncategorized},
    };
  }

  function loadDraft(deckId) {
    validateDeck(deckId);
    try {
      const raw = localStorage.getItem(storageKey(deckId));
      if (!raw) return null;
      return normalizeDraft(deckId, JSON.parse(raw));
    }
    catch (error) {
      console.error('Could not load saved card-sort draft.', error);
      return null;
    }
  }

  function saveDraft(deckId, draft) {
    const normalized = normalizeDraft(deckId, draft);
    if (!normalized) throw new Error('The card-sort draft is invalid.');
    normalized.updatedAt = new Date().toISOString();
    localStorage.setItem(storageKey(deckId), JSON.stringify(normalized));
    return normalized;
  }

  function clearDraft(deckId) {
    localStorage.removeItem(storageKey(deckId));
  }

  return {makeId, createNewDraft, normalizeDraft, loadDraft, saveDraft, clearDraft};
})();
