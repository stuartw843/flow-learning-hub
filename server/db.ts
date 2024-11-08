import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database | null = null;

export async function initializeDatabase() {
  if (db) return db;
  
  const dbPath = join(__dirname, '..', 'database.sqlite');
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      plain_content TEXT DEFAULT '',
      style TEXT DEFAULT '',
      persona TEXT DEFAULT '',
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Set initial order for existing modules if needed
  await db.exec(`
    UPDATE modules 
    SET display_order = id 
    WHERE display_order = 0
  `);

  return db;
}

export async function getDb() {
  if (!db) {
    await initializeDatabase();
  }
  return db;
}
