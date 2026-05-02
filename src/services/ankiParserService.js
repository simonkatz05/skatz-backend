const AdmZip = require('adm-zip');
// Lazy-load better-sqlite3 so a native compilation failure doesn't crash startup
let Database;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

/**
 * Parses an Anki .apkg Buffer and extracts cards.
 * Returns [{ ankiNoteId, front, back }]
 */
async function parseApkg(buffer) {
  const tmpDir = path.join(os.tmpdir(), `anki-${randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const zip = new AdmZip(buffer);
    zip.extractAllTo(tmpDir, true);

    // Try Anki 21 format first, fall back to legacy
    const dbPath =
      fs.existsSync(path.join(tmpDir, 'collection.anki21'))
        ? path.join(tmpDir, 'collection.anki21')
        : path.join(tmpDir, 'collection.anki2');

    if (!fs.existsSync(dbPath)) {
      throw Object.assign(new Error('Invalid .apkg file: no collection database found'), { status: 400 });
    }

    if (!Database) {
      try {
        Database = require('better-sqlite3');
      } catch {
        throw Object.assign(
          new Error('Anki import is unavailable: better-sqlite3 native module could not be loaded'),
          { status: 503 }
        );
      }
    }
    const db = new Database(dbPath, { readonly: true });

    // flds is a \x1f-separated string of fields; first = front, second = back
    const notes = db.prepare('SELECT id, flds FROM notes').all();
    db.close();

    const cards = notes.map(note => {
      const fields = note.flds.split('\x1f');
      return {
        ankiNoteId: note.id,
        front: stripHtml(fields[0] || '').trim(),
        back: stripHtml(fields[1] || '').trim(),
      };
    }).filter(c => c.front || c.back);

    return cards;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

module.exports = { parseApkg };
