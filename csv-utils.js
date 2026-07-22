
'use strict';

window.CardSortCsv = (() => {
  const HEADER = [
    'deck_id',
    'deck_title',
    'participant_code',
    'exported_at_utc',
    'category_name',
    'category_order',
    'card_id',
    'card_text',
    'card_order',
    'placement',
  ];

  function protectSpreadsheetCell(value) {
    const text = String(value ?? '');
    return /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  }

  function restoreProtectedCell(value) {
    const text = String(value ?? '');
    return /^'\s*[=+\-@]/.test(text) ? text.slice(1) : text;
  }

  function escapeCell(value) {
    const text = protectSpreadsheetCell(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function rowsForDraft(deck, draft, exportedAt = new Date().toISOString()) {
    const rows = [];
    draft.result.categories.forEach((category, categoryIndex) => {
      category.cards.forEach((cardId, cardIndex) => {
        const card = deck.cards.find(item => item.id === cardId);
        if (!card) return;
        rows.push({
          deck_id: deck.id,
          deck_title: deck.title,
          participant_code: draft.participantCode,
          exported_at_utc: exportedAt,
          category_name: category.name,
          category_order: categoryIndex + 1,
          card_id: card.id,
          card_text: card.text,
          card_order: cardIndex + 1,
          placement: 'categorized',
        });
      });
    });
    draft.result.uncategorized.forEach((cardId, cardIndex) => {
      const card = deck.cards.find(item => item.id === cardId);
      if (!card) return;
      rows.push({
        deck_id: deck.id,
        deck_title: deck.title,
        participant_code: draft.participantCode,
        exported_at_utc: exportedAt,
        category_name: '(Uncategorized)',
        category_order: '',
        card_id: card.id,
        card_text: card.text,
        card_order: cardIndex + 1,
        placement: 'uncategorized',
      });
    });
    return rows;
  }

  function toCsv(rows) {
    const lines = [HEADER.map(escapeCell).join(',')];
    for (const row of rows) {
      lines.push(HEADER.map(key => escapeCell(row[key])).join(','));
    }
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  function safeFilenamePart(value, fallback) {
    const cleaned = String(value || fallback).trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
    return cleaned || fallback;
  }

  function suggestedFilename(deckId, participantCode, exportedAt) {
    const date = exportedAt.replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
    return `${safeFilenamePart(deckId, 'deck')}-${safeFilenamePart(participantCode, 'anonymous')}-${date}.csv`;
  }

  function downloadDraft(deck, draft) {
    const exportedAt = new Date().toISOString();
    const csvText = toCsv(rowsForDraft(deck, draft, exportedAt));
    const blob = new Blob([csvText], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedFilename(deck.id, draft.participantCode, exportedAt);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function parse(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (inQuotes) {
        if (char === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        }
        else if (char === '"') inQuotes = false;
        else field += char;
      }
      else if (char === '"') inQuotes = true;
      else if (char === ',') {
        row.push(field);
        field = '';
      }
      else if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
      }
      else field += char;
    }
    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
    }
    if (!rows.length) return [];
    const headers = rows.shift().map(value => value.trim());
    return rows.filter(columns => columns.some(value => value !== '')).map(columns => {
      const record = {};
      headers.forEach((header, index) => record[header] = restoreProtectedCell(columns[index] ?? ''));
      return record;
    });
  }

  function validateRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('The CSV contains no result rows.');
    const required = ['deck_id', 'participant_code', 'category_name', 'card_id', 'card_text', 'placement'];
    for (const key of required) {
      if (!(key in rows[0])) throw new Error(`Missing required CSV column: ${key}`);
    }
    const deckIds = new Set(rows.map(row => row.deck_id));
    if (deckIds.size !== 1) throw new Error('One CSV file must contain exactly one deck.');
    return rows;
  }

  return {HEADER, rowsForDraft, toCsv, downloadDraft, parse, validateRows};
})();
