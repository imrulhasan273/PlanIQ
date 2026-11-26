import { BackupFormat, LogicalBackupMode } from '../../../../types/pgbackup';

function formatStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function detectSep(p: string): string {
  return p.includes('\\') && !p.includes('/') ? '\\' : p.includes('/') && !p.includes('\\') ? '/' : p.includes(':') ? '\\' : '/';
}

function trimTrailingSep(p: string): string {
  if (/^[A-Za-z]:[\\/]?$/.test(p)) return `${p[0]}:\\`;
  if (p === '/') return '/';
  return p.replace(/[\\/]+$/, '');
}

/**
 * Joins a fresh timestamped folder onto a chosen directory path cleanly for both Windows (`\`)
 * and Linux/macOS (`/`), preventing `Permission denied` when pg_dump/pg_basebackup tries to mkdir.
 */
export function buildTimestampedChildPath(parentDir: string, prefix: string): string {
  const cleanPrefix = (prefix || 'pg_backup').replace(/[^A-Za-z0-9_.-]+/g, '_');
  const trimmed = trimTrailingSep(parentDir.trim());
  if (!trimmed) return `${cleanPrefix}_${formatStamp()}`;
  const sep = detectSep(trimmed);
  if (trimmed === '/' || trimmed.endsWith('\\') || trimmed.endsWith('/')) {
    return `${trimmed}${cleanPrefix}_${formatStamp()}`;
  }
  return `${trimmed}${sep}${cleanPrefix}_${formatStamp()}`;
}

export function extForFormat(format: BackupFormat): string {
  switch (format) {
    case 'tar':
      return '.tar';
    case 'plain':
      return '.sql';
    case 'directory':
      return '';
    default:
      return '.dump';
  }
}

/**
 * Synchronizes an existing output path whenever the user toggles Archive Format or Mode
 * so `.dump` / `.tar` / `.sql` / fresh folder names match without overwriting existing dirs.
 */
export function syncOutputPathForFormat(
  currentPath: string,
  nextFormat: BackupFormat,
  mode: LogicalBackupMode,
  dbName: string,
): string {
  const raw = currentPath.trim();
  if (!raw) return '';
  const sep = detectSep(raw);
  const needsDir = nextFormat === 'directory' || mode === 'multi_db';
  const ext = mode.startsWith('cluster_') && mode !== 'cluster_full' ? '.sql' : extForFormat(nextFormat);

  const hasKnownFileExt = /\.(dump|backup|tar|sql)$/i.test(raw);
  if (needsDir) {
    if (hasKnownFileExt) {
      return raw.replace(/\.(dump|backup|tar|sql)$/i, '_dir');
    }
    if (/^[A-Za-z]:[\\/]?$/.test(raw) || raw === '/') {
      return buildTimestampedChildPath(raw, `${dbName || 'pg'}_${mode}`);
    }
    return raw;
  }

  // Needs a file extension (.dump / .tar / .sql)
  if (hasKnownFileExt) {
    return raw.replace(/\.(dump|backup|tar|sql)$/i, ext);
  }
  const clean = trimTrailingSep(raw);
  const baseName = `${(dbName || 'postgres').replace(/[^A-Za-z0-9_.-]+/g, '_')}_${mode}${ext}`;
  if (clean === '/' || clean.endsWith('\\')) {
    return `${clean}${baseName}`;
  }
  return `${clean}_backup${ext}`.replace(new RegExp(`\\${sep}_backup`), `${sep}${baseName}`);
}
