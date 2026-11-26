import React, { useState, useEffect, useRef, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { Play, X, Terminal, AlertTriangle, CheckCircle2, Database, Wand2, Search } from 'lucide-react';
import { PgQueryResult, PgSecurableCatalog } from '../../../../types/rbac';
import {
  DynamicTableFilter,
  DynamicColumnFilter,
  DynamicFilterColumn,
  applyDynamicFilters,
  createDefaultDynamicFilter,
} from '../components/DynamicTableFilter';
import {
  RunPgImpersonatedQuery,
  RunPgImpersonatedQueryInDB,
  GetPgTableColumns,
} from '../../../../../wailsjs/go/main/App';
import {
  formatPgSql,
  extractReferencedTables,
  detectSqlClauseBeforeCursor,
} from '../utils/sqlAutocomplete';

interface ImpersonationDrawerProps {
  roleName: string;
  catalog?: PgSecurableCatalog;
  activeDatabase?: string;
  onClose: () => void;
}

/**
 * Wraps single top-level SELECT / WITH queries with an outer LIMIT when no
 * explicit top-level LIMIT or FETCH clause is present.
 */
export function applyRowLimitToQuery(
  rawSql: string,
  limitNum: number,
): { sql: string; appliedLimit: number | null } {
  const stripped = rawSql.trim().replace(/;+\s*$/, '');
  if (!stripped || !Number.isInteger(limitNum) || limitNum < 1) {
    return { sql: rawSql, appliedLimit: null };
  }

  let depth = 0;
  let firstKeyword = '';
  let prevTopWord = '';
  let hasLimit = false;
  let hasInternalSemicolon = false;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    const next = stripped[i + 1];

    // Skip single-line comment
    if (ch === '-' && next === '-') {
      while (i < stripped.length && stripped[i] !== '\n') i++;
      continue;
    }
    // Skip block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < stripped.length && !(stripped[i] === '*' && stripped[i + 1] === '/')) i++;
      i++;
      continue;
    }
    // Skip single-quoted string
    if (ch === "'") {
      i++;
      while (i < stripped.length) {
        if (stripped[i] === "'" && stripped[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (stripped[i] === "'") break;
        i++;
      }
      continue;
    }
    // Skip double-quoted identifier
    if (ch === '"') {
      i++;
      while (i < stripped.length) {
        if (stripped[i] === '"' && stripped[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (stripped[i] === '"') break;
        i++;
      }
      continue;
    }

    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (ch === ';' && depth === 0) {
      hasInternalSemicolon = true;
      break;
    }

    if (depth === 0 && /[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < stripped.length && /[A-Za-z0-9_$]/.test(stripped[j])) j++;
      const upper = stripped.slice(i, j).toUpperCase();
      if (!firstKeyword) firstKeyword = upper;
      if (upper === 'LIMIT') hasLimit = true;
      if (prevTopWord === 'FETCH' && (upper === 'FIRST' || upper === 'NEXT')) {
        hasLimit = true;
      }
      prevTopWord = upper;
      i = j - 1;
    }
  }

  if (
    !hasInternalSemicolon &&
    !hasLimit &&
    (firstKeyword === 'SELECT' || firstKeyword === 'WITH')
  ) {
    return {
      sql: `SELECT * FROM (\n${stripped}\n) AS _planiq_q\nLIMIT ${limitNum};`,
      appliedLimit: limitNum,
    };
  }

  return { sql: rawSql, appliedLimit: null };
}

const PG_SQL_SNIPPETS = [
  { label: 'SELECT', insertText: 'SELECT ', detail: 'SQL clause' },
  { label: 'FROM', insertText: 'FROM ', detail: 'SQL clause' },
  { label: 'WHERE 1=1', insertText: 'WHERE 1 = 1\n  AND ', detail: 'Filter clause pattern' },
  { label: 'AND', insertText: 'AND ', detail: 'Logical operator' },
  { label: 'OR', insertText: 'OR ', detail: 'Logical operator' },
  { label: 'INNER JOIN', insertText: 'INNER JOIN ', detail: 'Join clause' },
  { label: 'LEFT JOIN', insertText: 'LEFT JOIN ', detail: 'Join clause' },
  { label: 'GROUP BY', insertText: 'GROUP BY ', detail: 'Aggregation' },
  { label: 'ORDER BY', insertText: 'ORDER BY ', detail: 'Sorting' },
  { label: 'LIMIT', insertText: 'LIMIT 50', detail: 'Row limit' },
  { label: 'COUNT(*)', insertText: 'COUNT(*)', detail: 'Aggregate function' },
  { label: 'COALESCE', insertText: 'COALESCE(', detail: 'Null fallback' },
  { label: 'CURRENT_USER', insertText: 'CURRENT_USER', detail: 'Effective role' },
  { label: 'SESSION_USER', insertText: 'SESSION_USER', detail: 'Authenticated user' },
  { label: 'NOW()', insertText: 'NOW()', detail: 'Current timestamp' },
];

export const ImpersonationDrawer: React.FC<ImpersonationDrawerProps> = ({
  roleName,
  catalog,
  activeDatabase,
  onClose,
}) => {
  const databases = useMemo(() => {
    const list = [...(catalog?.databases ?? [])];
    if (activeDatabase && !list.includes(activeDatabase)) {
      list.unshift(activeDatabase);
    }
    if (list.length === 0) list.push('postgres');
    return list;
  }, [catalog?.databases, activeDatabase]);

  const [selectedDb, setSelectedDb] = useState<string>(
    activeDatabase || databases[0] || 'postgres',
  );
  const [query, setQuery] = useState(
    'SELECT\n  current_user,\n  session_user,\n  current_database();',
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PgQueryResult | null>(null);
  const [ipcError, setIpcError] = useState<string | null>(null);
  const [rowLimit, setRowLimit] = useState<string>('200');
  const [appliedLimit, setAppliedLimit] = useState<number | null>(null);
  const [showResultFilters, setShowResultFilters] = useState<boolean>(true);
  const [resultFilters, setResultFilters] = useState<DynamicColumnFilter[]>(() => [
    createDefaultDynamicFilter('__any__'),
  ]);

  const editorRef = useRef<any>(null);
  const providerDisposableRef = useRef<any>(null);
  const catalogRef = useRef<PgSecurableCatalog | undefined>(catalog);
  const columnsCacheRef = useRef<Record<string, string[]>>({});
  const handleRunRef = useRef<(overrideLimit?: number) => void>(() => {});
  const queryRef = useRef(query);
  const rowLimitRef = useRef(rowLimit);
  const hasExecutedRef = useRef(false);

  catalogRef.current = catalog;
  queryRef.current = query;
  rowLimitRef.current = rowLimit;

  const isLightTheme =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('light-theme');

  useEffect(() => {
    if (activeDatabase) setSelectedDb(activeDatabase);
  }, [activeDatabase]);

  // Prefetch columns for any tables referenced in FROM / JOIN clauses
  useEffect(() => {
    const tables = catalog?.tables ?? [];
    if (tables.length === 0) return;
    const refs = extractReferencedTables(query, tables);
    if (refs.length === 0) return;

    const timer = setTimeout(() => {
      const app = (window as any)?.go?.main?.App;
      if (!app?.GetPgTableColumns) return;
      refs.forEach(({ schema, name }) => {
        const key = `${schema}.${name}`;
        if (!columnsCacheRef.current[key]) {
          columnsCacheRef.current[key] = []; // mark in-flight
          GetPgTableColumns(schema, name)
            .then((cols) => {
              columnsCacheRef.current[key] = cols ?? [];
            })
            .catch(() => {
              delete columnsCacheRef.current[key];
            });
        }
      });
    }, 180);

    return () => clearTimeout(timer);
  }, [query, catalog?.tables]);

  // Dispose Monaco completion provider cleanly on unmount
  useEffect(() => {
    return () => {
      if (providerDisposableRef.current?.dispose) {
        providerDisposableRef.current.dispose();
        providerDisposableRef.current = null;
      }
    };
  }, []);

  // Auto-reload when Row Limit changes after a query has already been run
  useEffect(() => {
    if (!hasExecutedRef.current) return;
    const n = Number(rowLimit.trim());
    if (!Number.isInteger(n) || n < 1) return;
    const timer = setTimeout(() => {
      handleRunRef.current(n);
    }, 450);
    return () => clearTimeout(timer);
  }, [rowLimit]);

  const handleRun = async (overrideLimit?: number) => {
    const currentSql = editorRef.current?.getValue?.() ?? queryRef.current;
    if (!currentSql.trim() || running) return;
    const app = (window as any)?.go?.main?.App;
    if (!app?.RunPgImpersonatedQueryInDB && !app?.RunPgImpersonatedQuery) {
      setIpcError('RunPgImpersonatedQuery IPC unavailable.');
      return;
    }

    const parsedLimit = Number(rowLimitRef.current.trim());
    const effectiveLimit =
      typeof overrideLimit === 'number'
        ? Math.max(1, Math.min(50000, Math.floor(overrideLimit)))
        : Number.isInteger(parsedLimit) && parsedLimit >= 1
          ? Math.min(50000, parsedLimit)
          : 200;

    const prepared = applyRowLimitToQuery(currentSql, effectiveLimit);
    hasExecutedRef.current = true;
    setRunning(true);
    setIpcError(null);
    setResult(null);
    setAppliedLimit(prepared.appliedLimit);
    setResultFilters([createDefaultDynamicFilter('__any__')]);
    try {
      const res = app.RunPgImpersonatedQueryInDB
        ? await RunPgImpersonatedQueryInDB(roleName, selectedDb, prepared.sql)
        : await RunPgImpersonatedQuery(roleName, prepared.sql);
      setResult(res ?? null);
    } catch (e: any) {
      setIpcError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  handleRunRef.current = handleRun;

  const handleFormat = () => {
    const raw = editorRef.current?.getValue?.() ?? query;
    const formatted = formatPgSql(raw);
    if (!formatted) return;
    setQuery(formatted);
    if (editorRef.current) {
      editorRef.current.setValue(formatted);
      editorRef.current.focus();
    }
  };

  const resultFilterColumns = useMemo<DynamicFilterColumn[]>(() => {
    const cols = result?.columns ?? [];
    if (cols.length === 0) return [];
    return [
      { id: '__any__', label: 'All Columns', placeholder: 'Search across all result columns...' },
      ...cols.map((col, idx) => ({
        id: `col:${idx}`,
        label: col,
      })),
    ];
  }, [result?.columns]);

  const filteredResultRows = useMemo(() => {
    const rawRows = result?.rows ?? [];
    if (resultFilterColumns.length === 0) return rawRows;
    return applyDynamicFilters(rawRows, resultFilters, resultFilterColumns, (row, colId) => {
      if (!colId.startsWith('col:')) return '';
      const idx = Number(colId.slice(4));
      return row[idx] as any;
    });
  }, [result?.rows, resultFilters, resultFilterColumns]);

  const activeResultFilterCount = resultFilters.filter((f) => f.value.trim().length > 0).length;

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // Ctrl+Enter executes query; Shift+Alt+F formats SQL
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleRunRef.current();
    });
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      const raw = editor.getValue();
      const formatted = formatPgSql(raw);
      if (formatted) editor.setValue(formatted);
    });

    if (providerDisposableRef.current?.dispose) {
      providerDisposableRef.current.dispose();
    }

    const editorUriStr = editor.getModel()?.uri?.toString();

    providerDisposableRef.current = monaco.languages.registerCompletionItemProvider('pgsql', {
      triggerCharacters: ['.', ' '],
      provideCompletionItems(model: any, position: any) {
        if (editorUriStr && model.uri?.toString() !== editorUriStr) {
          return { suggestions: [] };
        }

        const fullText: string = model.getValue();
        const textBeforeCursor: string = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const lineUntilPos: string = model
          .getLineContent(position.lineNumber)
          .slice(0, position.column - 1);

        const wordInfo = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endColumn: wordInfo.endColumn,
        };

        const cat = catalogRef.current;
        const schemas = cat?.schemas ?? [];
        const tables = cat?.tables ?? [];
        const refs = extractReferencedTables(fullText, tables);
        const suggestions: any[] = [];

        // Case 1: "<ident>." right before cursor -> schema tables OR table/alias columns
        const dotMatch = lineUntilPos.match(/([A-Za-z_][A-Za-z0-9_$]*)\.\s*[A-Za-z0-9_$]*$/);
        if (dotMatch) {
          const ident = dotMatch[1];

          // Match schema name
          const matchedSchema = schemas.find((s) => s.toLowerCase() === ident.toLowerCase());
          if (matchedSchema) {
            tables
              .filter((t) => t.schema === matchedSchema)
              .forEach((t) => {
                suggestions.push({
                  label: t.name,
                  kind: monaco.languages.CompletionItemKind.Class,
                  insertText: t.name,
                  detail: `${t.schema}.${t.name} (${t.objectType})`,
                  range,
                });
              });
          }

          // Match table alias or table name in FROM/JOIN
          const matchedRefs = refs.filter(
            (r) =>
              r.alias?.toLowerCase() === ident.toLowerCase() ||
              r.name.toLowerCase() === ident.toLowerCase(),
          );
          matchedRefs.forEach((r) => {
            const cols = columnsCacheRef.current[`${r.schema}.${r.name}`] ?? [];
            cols.forEach((col) => {
              suggestions.push({
                label: col,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col,
                detail: `${r.schema}.${r.name}.${col}`,
                range,
              });
            });
          });

          return { suggestions };
        }

        // Case 2: Determine SQL clause before cursor
        const clause = detectSqlClauseBeforeCursor(textBeforeCursor);
        const preferTables = clause === 'FROM' || clause === 'JOIN';

        if (preferTables) {
          schemas.forEach((s) => {
            suggestions.push({
              label: s,
              kind: monaco.languages.CompletionItemKind.Module,
              insertText: `${s}.`,
              detail: 'schema',
              sortText: `0_${s}`,
              range,
            });
          });
          tables.forEach((t) => {
            const full = `${t.schema}.${t.name}`;
            suggestions.push({
              label: full,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: full,
              detail: `${t.objectType} (owner: ${t.owner || 'unknown'})`,
              sortText: `1_${full}`,
              range,
            });
          });
        } else {
          // SELECT / WHERE / AND / OR / ON / GROUP BY / ORDER BY / HAVING -> prioritize referenced table columns!
          refs.forEach((r) => {
            const cols = columnsCacheRef.current[`${r.schema}.${r.name}`] ?? [];
            cols.forEach((col) => {
              const prefix = r.alias ? `${r.alias}.` : '';
              suggestions.push({
                label: prefix ? `${col} (${r.alias})` : col,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: `${prefix}${col}`,
                filterText: `${col} ${prefix}${col}`,
                detail: `column · ${r.schema}.${r.name}`,
                sortText: `0_${col}`,
                range,
              });
            });
          });

          // Also include schema.table hints in case user hasn't picked a clause keyword yet
          tables.forEach((t) => {
            const full = `${t.schema}.${t.name}`;
            suggestions.push({
              label: full,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: full,
              detail: t.objectType,
              sortText: `2_${full}`,
              range,
            });
          });
        }

        // Add SQL keywords & helper snippets
        PG_SQL_SNIPPETS.forEach((kw) => {
          suggestions.push({
            label: kw.label,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw.insertText,
            detail: kw.detail,
            sortText: `3_${kw.label}`,
            range,
          });
        });

        return { suggestions };
      },
    });
  };

  return (
    <div className="rbac-modal-backdrop" onClick={onClose}>
      <div
        className="rbac-modal"
        style={{
          width: '92vw',
          maxWidth: 1120,
          height: '86vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rbac-modal-header" style={{ flexShrink: 0 }}>
          <Terminal size={16} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ flex: 1 }}>
            Role Impersonation Sandbox —{' '}
            <span className="rbac-mono" style={{ color: 'var(--accent-cyan)' }}>
              {roleName}
            </span>
          </span>
          <button type="button" onClick={onClose} className="rbac-icon-btn" title="Close">
            <X size={14} />
          </button>
        </div>

        <div
          className="rbac-modal-body"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Context Bar + Database Selector */}
          <div
            className="rbac-card"
            style={{
              padding: '8px 12px',
              fontSize: 12,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Database size={13} style={{ color: 'var(--accent-cyan)' }} />
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Database:</span>
              <select
                value={selectedDb}
                onChange={(e) => setSelectedDb(e.target.value)}
                className="rbac-select rbac-mono"
                title="Target database to execute query in"
              >
                {databases.map((db) => (
                  <option key={db} value={db}>
                    {db}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ height: 14, width: 1, background: 'var(--border-subtle)' }} />

            <div>
              <span style={{ color: 'var(--text-muted)' }}>Active context: </span>
              <code className="rbac-mono" style={{ color: 'var(--accent-cyan)' }}>
                SET ROLE &quot;{roleName}&quot;;
              </code>
              <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>
                (auto-resets after query)
              </span>
            </div>
          </div>

          {/* Monaco PostgreSQL Editor */}
          <div style={{ flexShrink: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <label
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                }}
              >
                PostgreSQL Query Editor — schema, table &amp; column IntelliSense active
              </label>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                Ctrl+Space for suggestions · Shift+Alt+F to format
              </span>
            </div>

            <div
              style={{
                height: 220,
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid var(--border-medium)',
              }}
            >
              <Editor
                height="220px"
                language="pgsql"
                theme={isLightTheme ? 'vs' : 'vs-dark'}
                value={query}
                onChange={(val) => setQuery(val ?? '')}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  quickSuggestions: { other: true, comments: false, strings: false },
                  suggestOnTriggerCharacters: true,
                  padding: { top: 8, bottom: 8 },
                }}
              />
            </div>
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => handleRun()}
              disabled={running || !query.trim()}
              className="rbac-btn rbac-btn-primary"
            >
              <Play size={12} />
              {running ? 'Running…' : `Run as ${roleName}`}
            </button>
            <button type="button" className="rbac-btn" onClick={handleFormat} title="Format SQL (Shift+Alt+F)">
              <Wand2 size={12} />
              Format SQL
            </button>
            <button
              type="button"
              className="rbac-btn"
              onClick={() => {
                const sample = formatPgSql(
                  "select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') order by table_schema, table_name limit 50;",
                );
                setQuery(sample);
                editorRef.current?.setValue?.(sample);
              }}
            >
              List Visible Tables
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
              Tip: Ctrl+Enter to execute
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
              <label
                htmlFor="rbac-impersonate-limit"
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
              >
                Row Limit:
              </label>
              <input
                id="rbac-impersonate-limit"
                type="number"
                min={1}
                max={50000}
                value={rowLimit}
                onChange={(e) => setRowLimit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const n = Number(rowLimit.trim());
                    if (Number.isInteger(n) && n >= 1) {
                      handleRun(n);
                    }
                  }
                }}
                className="rbac-input rbac-mono"
                style={{ width: 84, padding: '4px 8px', fontSize: 12 }}
                title="Default row limit for SELECT queries (auto-reloads on edit)"
              />
            </div>
          </div>

          {ipcError && <div className="rbac-empty-error-box" style={{ flexShrink: 0 }}>{ipcError}</div>}

          {result?.error && (
            <div
              className="rbac-empty-error-box"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}
            >
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{result.error}</span>
            </div>
          )}

          {result && !result.error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: 'var(--accent-emerald)',
                  fontWeight: 600,
                  flexShrink: 0,
                  flexWrap: 'wrap',
                }}
              >
                <CheckCircle2 size={14} />
                <span>
                  Query succeeded in <code className="rbac-mono">{selectedDb}</code> — {result.rowsAffected} row{result.rowsAffected === 1 ? '' : 's'} returned
                  {appliedLimit !== null && (
                    <span style={{ color: 'var(--text-dim)', fontWeight: 500, marginLeft: 6 }}>
                      (capped at LIMIT {appliedLimit})
                    </span>
                  )}
                </span>
                {(result.columns ?? []).length > 0 && (
                  <button
                    type="button"
                    className={`rbac-btn ${showResultFilters ? 'rbac-btn-primary' : ''}`}
                    style={{ marginLeft: 'auto', padding: '3px 9px', fontSize: 11 }}
                    onClick={() => setShowResultFilters((v) => !v)}
                    title="Toggle dynamic multi-column result filters"
                  >
                    <Search size={11} />
                    <span>Search{activeResultFilterCount > 0 ? ` (${activeResultFilterCount})` : ''}</span>
                  </button>
                )}
              </div>

              {(result.columns ?? []).length > 0 && showResultFilters && (
                <DynamicTableFilter
                  columns={resultFilterColumns}
                  filters={resultFilters}
                  onChange={setResultFilters}
                  totalCount={(result.rows ?? []).length}
                  filteredCount={filteredResultRows.length}
                  itemLabel="rows"
                  compact
                />
              )}

              {(result.columns ?? []).length > 0 && (
                <div
                  className="rbac-table-wrap"
                  style={{ flex: 1, minHeight: 160, overflow: 'auto' }}
                >
                  <table className="rbac-table">
                    <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                      <tr>
                        {result.columns.map((col, idx) => (
                          <th key={idx} style={{ whiteSpace: 'nowrap' }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResultRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={result.columns.length}
                            style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}
                          >
                            No rows match the active multi-column filters.
                          </td>
                        </tr>
                      ) : (
                        filteredResultRows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="rbac-mono" style={{ whiteSpace: 'nowrap' }}>
                                {cell === null || cell === undefined ? (
                                  <span style={{ color: 'var(--text-dim)' }}>NULL</span>
                                ) : (
                                  String(cell)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
