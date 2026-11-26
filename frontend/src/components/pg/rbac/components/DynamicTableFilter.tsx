import React, { useId } from 'react';
import { Filter, Plus, X } from 'lucide-react';

export type DynamicFilterOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'gte'
  | 'lte';

export interface DynamicFilterColumn {
  id: string;
  label: string;
  type?: 'text' | 'number';
  options?: string[];
  placeholder?: string;
}

export interface DynamicColumnFilter {
  id: string;
  columnId: string;
  operator: DynamicFilterOperator;
  value: string;
}

export function createDefaultDynamicFilter(columnId = '__any__'): DynamicColumnFilter {
  return {
    id: `df-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    columnId,
    operator: 'contains',
    value: '',
  };
}

function evaluateSinglePredicate(
  rawCell: string | number | boolean | null | undefined,
  colDef: DynamicFilterColumn | undefined,
  operator: DynamicFilterOperator,
  needleRaw: string,
): boolean {
  const cellStr = rawCell === null || rawCell === undefined ? '' : String(rawCell);

  if (colDef?.type === 'number' && (operator === 'gte' || operator === 'lte' || operator === 'equals')) {
    const cellNum = Number(cellStr);
    const needleNum = Number(needleRaw);
    if (Number.isFinite(cellNum) && Number.isFinite(needleNum)) {
      if (operator === 'gte') return cellNum >= needleNum;
      if (operator === 'lte') return cellNum <= needleNum;
      return cellNum === needleNum;
    }
  }

  const haystack = cellStr.toLowerCase();
  const needle = needleRaw.toLowerCase();

  switch (operator) {
    case 'contains':
      return haystack.includes(needle);
    case 'not_contains':
      return !haystack.includes(needle);
    case 'equals':
      return haystack === needle;
    case 'not_equals':
      return haystack !== needle;
    case 'starts_with':
      return haystack.startsWith(needle);
    case 'gte':
      return Number(cellStr) >= Number(needleRaw);
    case 'lte':
      return Number(cellStr) <= Number(needleRaw);
    default:
      return haystack.includes(needle);
  }
}

/**
 * Applies multi-column AND predicates against an array of table rows.
 * Empty filter values are treated as no-op. `__any__` matches across all columns.
 */
export function applyDynamicFilters<T>(
  items: T[],
  filters: DynamicColumnFilter[],
  columns: DynamicFilterColumn[],
  getCellValue: (item: T, columnId: string) => string | number | boolean | null | undefined,
): T[] {
  const active = filters.filter((f) => f.value.trim().length > 0);
  if (active.length === 0) return items;

  const colMap = new Map(columns.map((c) => [c.id, c]));
  const searchableCols = columns.filter((c) => c.id !== '__any__');

  return items.filter((item) =>
    active.every((f) => {
      const needle = f.value.trim();
      if (f.columnId === '__any__') {
        const joined = searchableCols
          .map((c) => {
            const v = getCellValue(item, c.id);
            return v === null || v === undefined ? '' : String(v);
          })
          .join(' ');
        return evaluateSinglePredicate(joined, undefined, f.operator, needle);
      }
      const colDef = colMap.get(f.columnId);
      const cellVal = getCellValue(item, f.columnId);
      return evaluateSinglePredicate(cellVal, colDef, f.operator, needle);
    }),
  );
}

interface DynamicTableFilterProps {
  columns: DynamicFilterColumn[];
  filters: DynamicColumnFilter[];
  onChange: (next: DynamicColumnFilter[]) => void;
  totalCount: number;
  filteredCount: number;
  itemLabel: string;
  compact?: boolean;
}

export const DynamicTableFilter: React.FC<DynamicTableFilterProps> = ({
  columns,
  filters,
  onChange,
  totalCount,
  filteredCount,
  itemLabel,
  compact = false,
}) => {
  const uid = useId();
  const effectiveColumns = columns.length > 0 ? columns : [{ id: '__any__', label: 'All Columns' }];
  const defaultColId = effectiveColumns[0].id;

  const updateFilter = (id: string, patch: Partial<DynamicColumnFilter>) => {
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFilter = (id: string) => {
    if (filters.length <= 1) {
      onChange([createDefaultDynamicFilter(defaultColId)]);
      return;
    }
    onChange(filters.filter((f) => f.id !== id));
  };

  const addFilter = () => {
    const usedCols = new Set(filters.map((f) => f.columnId));
    const nextCol =
      effectiveColumns.find((c) => !usedCols.has(c.id)) ?? effectiveColumns[0];
    onChange([
      ...filters,
      {
        id: `df-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        columnId: nextCol.id,
        operator: nextCol.type === 'number' ? 'gte' : 'contains',
        value: '',
      },
    ]);
  };

  const clearAll = () => {
    onChange([createDefaultDynamicFilter(defaultColId)]);
  };

  const hasAnyActiveOrMultiple =
    filters.length > 1 || filters.some((f) => f.value.trim().length > 0);

  const usedCols = new Set(filters.map((f) => f.columnId));

  return (
    <div
      className="radar-filter-bar-container"
      style={{
        flexShrink: 0,
        marginBottom: compact ? 8 : 10,
        padding: compact ? '8px 10px' : '10px 12px',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Filter size={13} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-main)' }}>
            Dynamic Multi-Column Filters:
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Showing <strong style={{ color: 'var(--accent-cyan)' }}>{filteredCount}</strong> of {totalCount} {itemLabel}
          </span>
        </div>

        {hasAnyActiveOrMultiple && (
          <button
            type="button"
            className="rbac-btn"
            style={{ padding: '3px 8px', fontSize: 11 }}
            onClick={clearAll}
            title="Reset all column filters"
          >
            <X size={11} />
            <span>Clear All</span>
          </button>
        )}
      </div>

      <div className="radar-filter-row" style={{ marginTop: 8 }}>
        {filters.map((filter) => {
          const colDef = effectiveColumns.find((c) => c.id === filter.columnId) ?? effectiveColumns[0];
          const unusedCols = effectiveColumns.filter(
            (c) => !usedCols.has(c.id) || c.id === filter.columnId,
          );
          const alreadyUsedCols = effectiveColumns.filter(
            (c) => usedCols.has(c.id) && c.id !== filter.columnId,
          );
          const listId = colDef?.options?.length ? `${uid}-${filter.id}` : undefined;

          return (
            <div key={filter.id} className="radar-filter-chip">
              <select
                className="radar-filter-select"
                value={filter.columnId}
                onChange={(e) => {
                  const newCol = e.target.value;
                  const newDef = effectiveColumns.find((c) => c.id === newCol);
                  updateFilter(filter.id, {
                    columnId: newCol,
                    operator: newDef?.type === 'number' ? 'gte' : 'contains',
                    value: '',
                  });
                }}
                aria-label="Filter column"
              >
                <optgroup label="Available Columns">
                  {unusedCols.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
                {alreadyUsedCols.length > 0 && (
                  <optgroup label="Already Filtered">
                    {alreadyUsedCols.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} (in use)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {colDef?.type === 'number' ? (
                <select
                  className="radar-filter-operator"
                  value={filter.operator}
                  onChange={(e) =>
                    updateFilter(filter.id, { operator: e.target.value as DynamicFilterOperator })
                  }
                  aria-label="Numeric operator"
                >
                  <option value="gte">&gt;=</option>
                  <option value="lte">&lt;=</option>
                  <option value="equals">=</option>
                  <option value="not_equals">!=</option>
                </select>
              ) : (
                <select
                  className="radar-filter-operator"
                  value={filter.operator}
                  onChange={(e) =>
                    updateFilter(filter.id, { operator: e.target.value as DynamicFilterOperator })
                  }
                  aria-label="Text operator"
                >
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="starts_with">starts with</option>
                  <option value="not_contains">not contains</option>
                  <option value="not_equals">not equals</option>
                </select>
              )}

              <input
                type={colDef?.type === 'number' ? 'number' : 'text'}
                className="radar-filter-input"
                placeholder={
                  colDef?.placeholder ??
                  (colDef?.type === 'number' ? 'Enter value...' : `Filter ${colDef?.label ?? 'rows'}...`)
                }
                value={filter.value}
                onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                list={listId}
                style={{ minWidth: 130 }}
              />
              {listId && colDef?.options && (
                <datalist id={listId}>
                  {colDef.options.map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              )}

              <button
                type="button"
                className="radar-filter-remove-btn"
                onClick={() => removeFilter(filter.id)}
                title={filters.length > 1 ? 'Remove this filter' : 'Clear filter'}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="radar-add-filter-btn"
          onClick={addFilter}
          title="Add another column filter side-by-side"
        >
          <Plus size={12} />
          <span>Add Column Filter</span>
        </button>
      </div>
    </div>
  );
};
