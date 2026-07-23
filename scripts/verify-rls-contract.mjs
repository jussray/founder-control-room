import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = path.join(root, 'supabase', 'migrations');
const baselinePath = path.join(root, 'config', 'rls-known-gaps.json');

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ');
}

function normalizeIdentifier(value) {
  return value.replace(/^"|"$/g, '').toLowerCase();
}

function parseQualifiedTable(match) {
  const schema = normalizeIdentifier(match.groups?.schema ?? 'public');
  const table = normalizeIdentifier(match.groups?.table ?? '');
  return schema === 'public' && table ? table : null;
}

function collectOperations(sql, file) {
  const text = stripSqlComments(sql);
  const identifier = String.raw`"?[A-Za-z_][A-Za-z0-9_$]*"?`;
  const qualified = String.raw`(?:(?<schema>${identifier})\s*\.\s*)?(?<table>${identifier})`;
  const patterns = [
    {
      kind: 'create',
      regex: new RegExp(
        String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${qualified}`,
        'gi',
      ),
    },
    {
      kind: 'drop',
      regex: new RegExp(
        String.raw`\bdrop\s+table\s+(?:if\s+exists\s+)?${qualified}`,
        'gi',
      ),
    },
    {
      kind: 'enable',
      regex: new RegExp(
        String.raw`\balter\s+table\s+(?:if\s+exists\s+)?${qualified}\s+enable\s+row\s+level\s+security\b`,
        'gi',
      ),
    },
    {
      kind: 'disable',
      regex: new RegExp(
        String.raw`\balter\s+table\s+(?:if\s+exists\s+)?${qualified}\s+disable\s+row\s+level\s+security\b`,
        'gi',
      ),
    },
  ];

  const operations = [];
  for (const { kind, regex } of patterns) {
    for (const match of text.matchAll(regex)) {
      const table = parseQualifiedTable(match);
      if (!table) continue;
      operations.push({
        kind,
        table,
        file,
        index: match.index ?? 0,
      });
    }
  }

  return operations.sort((left, right) => left.index - right.index);
}

async function loadBaseline() {
  const raw = JSON.parse(await readFile(baselinePath, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error('config/rls-known-gaps.json must contain an array');
  }

  const seen = new Set();
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`RLS gap ${index} must be an object`);
    }

    const table = typeof entry.table === 'string'
      ? normalizeIdentifier(entry.table.trim())
      : '';
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    const sourceMigration = typeof entry.sourceMigration === 'string'
      ? entry.sourceMigration.trim()
      : '';

    if (!table || !reason || !sourceMigration) {
      throw new Error(
        `RLS gap ${index} requires non-empty table, reason, and sourceMigration`,
      );
    }
    if (seen.has(table)) throw new Error(`Duplicate RLS gap baseline entry: ${table}`);
    seen.add(table);
    return { table, reason, sourceMigration };
  });
}

async function inventoryMigrations() {
  const files = (await readdir(migrationsDirectory))
    .filter(file => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  const tables = new Map();
  let sequence = 0;

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
    for (const operation of collectOperations(sql, file)) {
      sequence += 1;
      const existing = tables.get(operation.table) ?? {
        table: operation.table,
        exists: false,
        rlsEnabled: false,
        sourceMigration: null,
        lastOperation: null,
      };

      if (operation.kind === 'create') {
        existing.exists = true;
        existing.rlsEnabled = false;
        existing.sourceMigration ??= file;
      } else if (operation.kind === 'drop') {
        existing.exists = false;
        existing.rlsEnabled = false;
      } else if (operation.kind === 'enable' && existing.exists) {
        existing.rlsEnabled = true;
      } else if (operation.kind === 'disable' && existing.exists) {
        existing.rlsEnabled = false;
      }

      existing.lastOperation = {
        kind: operation.kind,
        file,
        sequence,
      };
      tables.set(operation.table, existing);
    }
  }

  return [...tables.values()]
    .filter(table => table.exists)
    .sort((left, right) => left.table.localeCompare(right.table));
}

function formatRows(rows) {
  return rows
    .map(row => `- ${row.table} (created in ${row.sourceMigration})`)
    .join('\n');
}

const baseline = await loadBaseline();
const inventory = await inventoryMigrations();
const missing = inventory.filter(table => !table.rlsEnabled);
const missingByName = new Map(missing.map(table => [table.table, table]));
const baselineByName = new Map(baseline.map(entry => [entry.table, entry]));

const unexpected = missing.filter(table => !baselineByName.has(table.table));
const stale = baseline.filter(entry => !missingByName.has(entry.table));
const sourceDrift = baseline.filter(entry => {
  const table = missingByName.get(entry.table);
  return table && table.sourceMigration !== entry.sourceMigration;
});

if (unexpected.length || stale.length || sourceDrift.length) {
  console.error('RLS migration contract failed.');

  if (unexpected.length) {
    console.error('\nUnreviewed public tables without final RLS enablement:');
    console.error(formatRows(unexpected));
    console.error(
      '\nAdd a corrective migration, or document the temporary gap in config/rls-known-gaps.json with a precise reason.',
    );
  }

  if (stale.length) {
    console.error('\nStale known-gap entries that are no longer missing RLS:');
    for (const entry of stale) console.error(`- ${entry.table}`);
    console.error('\nRemove fixed entries so the baseline cannot fossilize old risk.');
  }

  if (sourceDrift.length) {
    console.error('\nKnown-gap source migrations no longer match inventory:');
    for (const entry of sourceDrift) {
      const actual = missingByName.get(entry.table);
      console.error(`- ${entry.table}: baseline=${entry.sourceMigration}, actual=${actual?.sourceMigration}`);
    }
  }

  process.exitCode = 1;
} else {
  const protectedCount = inventory.length - missing.length;
  console.log(
    `RLS contract verified: ${inventory.length} public tables, ${protectedCount} protected, ${missing.length} reviewed gaps.`,
  );
  for (const entry of baseline) {
    console.log(`- reviewed gap ${entry.table}: ${entry.reason}`);
  }
}
