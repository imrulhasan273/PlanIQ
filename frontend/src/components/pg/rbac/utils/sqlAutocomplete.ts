// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL Query Formatter & Table-Reference Parser for RBAC Sandbox
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferencedTable {
  schema: string;
  name: string;
  alias?: string;
}

const MULTI_WORD_KEYWORDS = [
  'LEFT OUTER JOIN',
  'RIGHT OUTER JOIN',
  'FULL OUTER JOIN',
  'INNER JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'FULL JOIN',
  'CROSS JOIN',
  'GROUP BY',
  'ORDER BY',
  'UNION ALL',
  'IS NOT NULL',
  'IS NULL',
  'NOT IN',
];

const SINGLE_KEYWORDS = new Set([
  'SELECT',
  'DISTINCT',
  'FROM',
  'JOIN',
  'WHERE',
  'AND',
  'OR',
  'ON',
  'AS',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION',
  'IN',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'ASC',
  'DESC',
  'NULL',
  'TRUE',
  'FALSE',
  'EXISTS',
  'NOT',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'COALESCE',
  'CURRENT_USER',
  'SESSION_USER',
]);

const RESERVED_ALIAS_WORDS = new Set([
  'WHERE',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'CROSS',
  'ON',
  'GROUP',
  'ORDER',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION',
  'AND',
  'OR',
  'SET',
]);

/**
 * Formats a PostgreSQL SQL query with clean uppercase keywords, clause newlines,
 * and indented AND/OR predicates while leaving quoted strings/identifiers untouched.
 */
export function formatPgSql(sql: string): string {
  const input = sql.trim();
  if (!input) return '';

  // Tokenize preserving quoted strings, double-quoted identifiers, and comments
  const tokens: Array<{ type: 'code' | 'literal'; text: string }> = [];
  let i = 0;
  let codeBuf = '';

  const flushCode = () => {
    if (codeBuf) {
      tokens.push({ type: 'code', text: codeBuf });
      codeBuf = '';
    }
  };

  while (i < input.length) {
    const ch = input[i];
    if (ch === "'" || ch === '"') {
      flushCode();
      const quote = ch;
      let lit = quote;
      i++;
      while (i < input.length) {
        lit += input[i];
        if (input[i] === quote) {
          if (i + 1 < input.length && input[i + 1] === quote) {
            lit += input[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      tokens.push({ type: 'literal', text: lit });
      continue;
    }

    if (ch === '-' && i + 1 < input.length && input[i + 1] === '-') {
      flushCode();
      let comment = '';
      while (i < input.length && input[i] !== '\n') {
        comment += input[i];
        i++;
      }
      tokens.push({ type: 'literal', text: comment });
      continue;
    }

    codeBuf += ch;
    i++;
  }
  flushCode();

  // Format code segments safely while keeping literals via placeholders
  const placeholders: string[] = [];
  let masked = tokens
    .map((t) => {
      if (t.type === 'literal') {
        const idx = placeholders.length;
        placeholders.push(t.text);
        return `__PLIQ_LIT_${idx}__`;
      }
      return t.text;
    })
    .join('');

  // Collapse excess whitespace outside literals
  masked = masked.replace(/\s+/g, ' ').trim();

  // Uppercase single keywords (avoid touching __PLIQ_LIT_n__ placeholders)
  masked = masked.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (word) => {
    const upper = word.toUpperCase();
    return SINGLE_KEYWORDS.has(upper) ? upper : word;
  });

  // Ensure multi-word keywords are normalized cleanly
  for (const kw of MULTI_WORD_KEYWORDS) {
    const re = new RegExp(`\\b${kw.replace(/ /g, '\\s+')}\\b`, 'gi');
    masked = masked.replace(re, kw);
  }

  // Insert structured clause breaks
  masked = masked
    .replace(/\bSELECT\b\s*/gi, 'SELECT\n  ')
    .replace(/\s*\bFROM\b\s*/gi, '\nFROM ')
    .replace(
      /\s*\b(LEFT OUTER JOIN|RIGHT OUTER JOIN|FULL OUTER JOIN|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|CROSS JOIN|JOIN)\b\s*/gi,
      (_m, j) => `\n${j.toUpperCase()} `,
    )
    .replace(/\s*\bON\b\s*/gi, '\n  ON ')
    .replace(/\s*\bWHERE\b\s*/gi, '\nWHERE ')
    .replace(/\s*\b(AND|OR)\b\s*/gi, (_m, op) => `\n  ${op.toUpperCase()} `)
    .replace(/\s*\bGROUP BY\b\s*/gi, '\nGROUP BY ')
    .replace(/\s*\bHAVING\b\s*/gi, '\nHAVING ')
    .replace(/\s*\bORDER BY\b\s*/gi, '\nORDER BY ')
    .replace(/\s*\bLIMIT\b\s*/gi, '\nLIMIT ')
    .replace(/\s*\bOFFSET\b\s*/gi, '\nOFFSET ')
    .replace(/\s*\b(UNION ALL|UNION)\b\s*/gi, (_m, u) => `\n${u.toUpperCase()}\n`);

  // Clean comma spacing without splitting function args too aggressively on single-line SELECT
  masked = masked.replace(/\s*,\s*/g, ', ');

  // Restore literals
  return masked.replace(/__PLIQ_LIT_(\d+)__/g, (_m, idx) => placeholders[Number(idx)] ?? '');
}

/**
 * Extracts table references (schema.table or bare table) and their optional aliases
 * following FROM / JOIN clauses so Monaco autocomplete can suggest columns cleanly.
 */
export function extractReferencedTables(
  sql: string,
  knownTables: Array<{ schema: string; name: string }>,
): ReferencedTable[] {
  // Strip single-quoted literals & line comments before regex scan
  const cleaned = sql
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/--[^\n]*/g, ' ');

  const refs: ReferencedTable[] = [];
  const seen = new Set<string>();

  const re = /\b(?:FROM|JOIN)\s+(?:"?([A-Za-z_][A-Za-z0-9_$]*)"?\.)?"?([A-Za-z_][A-Za-z0-9_$]*)"?(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_$]*))?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    let schema = match[1] || '';
    const tableName = match[2];
    const rawAlias = match[3];

    if (!schema) {
      const found =
        knownTables.find((t) => t.name === tableName && t.schema === 'public') ??
        knownTables.find((t) => t.name === tableName);
      schema = found?.schema || 'public';
    }

    const alias =
      rawAlias && !RESERVED_ALIAS_WORDS.has(rawAlias.toUpperCase()) ? rawAlias : undefined;

    const dedupeKey = `${schema}.${tableName}:${alias ?? ''}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      refs.push({ schema, name: tableName, alias });
    }
  }

  return refs;
}

/**
 * Returns the last SQL clause keyword before the cursor so autocomplete knows
 * whether to prioritize tables (FROM/JOIN) or columns (SELECT/WHERE/AND/ON/...).
 */
export function detectSqlClauseBeforeCursor(textBeforeCursor: string): string {
  const cleaned = textBeforeCursor
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/--[^\n]*/g, ' ');

  const clauseRe = /\b(SELECT|FROM|JOIN|ON|WHERE|AND|OR|GROUP\s+BY|ORDER\s+BY|HAVING|SET)\b/gi;
  let last = '';
  let m: RegExpExecArray | null;
  while ((m = clauseRe.exec(cleaned)) !== null) {
    last = m[1].toUpperCase().replace(/\s+/g, ' ');
  }
  return last;
}
