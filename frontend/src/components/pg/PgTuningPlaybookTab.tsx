import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  GitFork,
  Search,
  Filter,
  Flame,
  Code2,
  Copy,
  Check,
  Zap,
  ArrowRight,
  Database,
  Layers,
  Cpu,
  Sliders,
  ChevronDown,
  ChevronRight,
  Info,
  ExternalLink,
  ShieldAlert,
  Boxes,
  Compass
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis } from '../../types/plan';

interface PgTuningPlaybookTabProps {
  plan: PlanAnalysis | null;
  onNavigateToStatement?: (stmt: StatementAnalysis) => void;
}

interface PgAntiPatternItem {
  id: string;
  title: string;
  category: 'Scans & Indexes' | 'Memory & work_mem' | 'Sargability & Syntax' | 'Concurrency & Locks' | 'Planner & JIT';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
  summary: string;
  engineMechanics: string;
  badSql: string;
  goodSql: string;
  remedyList: string[];
}

export const PG_PLAYBOOK_PATTERNS: PgAntiPatternItem[] = [
  {
    id: 'pg-seq-scan-large',
    title: 'Sequential Scan on Large Relations with Filter Discard',
    category: 'Scans & Indexes',
    severity: 'CRITICAL',
    summary:
      'Sequential Scan reads every 8KB block from storage and discards 90%+ of rows via Filter, saturating shared_buffers and disk I/O.',
    engineMechanics:
      'PostgreSQL evaluates the WHERE filter row-by-row. When table size exceeds shared_buffers, it causes rapid buffer eviction of cached hot pages for other concurrent queries.',
    badSql: `SELECT customer_id, order_date, total_amount\nFROM orders\nWHERE status = 'COMPLETED' AND order_date >= '2025-01-01';\n-- EXPLAIN: Seq Scan on orders (cost=0.00..4820.00 rows=51940)\n-- Rows Removed by Filter: 74800`,
    goodSql: `-- 1. Safe concurrent index creation in production\nCREATE INDEX CONCURRENTLY idx_orders_status_date\nON orders (status, order_date)\nINCLUDE (total_amount);\n\n-- 2. Query now executes via Index-Only Scan with zero heap reads\nSELECT customer_id, order_date, total_amount\nFROM orders\nWHERE status = 'COMPLETED' AND order_date >= '2025-01-01';`,
    remedyList: [
      'Create multi-column composite B-Tree indexes matching equality and range filter columns.',
      'Always include the CONCURRENTLY keyword to prevent AccessExclusiveLock table locks.',
      'Consider Partial Indexes (WHERE status = "COMPLETED") if only specific status values are queried.',
      'Verify random_page_cost is set to 1.1 on SSD/NVMe storage so the planner prefers index seeks.'
    ]
  },
  {
    id: 'pg-work-mem-spill',
    title: 'work_mem Disk Run-File Spills in Sort and Hash Joins',
    category: 'Memory & work_mem',
    severity: 'CRITICAL',
    summary:
      'Sort or Hash Join exceeds allocated work_mem and spills intermediate rows to disk temporary files (external merge sort).',
    engineMechanics:
      'When working set exceeds work_mem (default 4MB), Sort switches from quicksort/top-N heapsort in RAM to "external merge" on disk. Hash Joins increase batches from 1 to 2, 4, or 8, writing partitions to temporary files.',
    badSql: `SELECT c.customer_id, c.company_name, COUNT(o.order_id)\nFROM customers c\nJOIN orders o ON c.customer_id = o.customer_id\nGROUP BY c.customer_id, c.company_name\nORDER BY c.customer_id;\n-- EXPLAIN: Sort Method: external merge  Disk: 3480kB`,
    goodSql: `-- Strategy A: Increase work_mem for this specific transaction only\nBEGIN;\nSET LOCAL work_mem = '64MB';\n\nSELECT c.customer_id, c.company_name, COUNT(o.order_id)\nFROM customers c\nJOIN orders o ON c.customer_id = o.customer_id\nGROUP BY c.customer_id, c.company_name\nORDER BY c.customer_id;\n\nCOMMIT;\n\n-- Strategy B: Eliminate sort entirely via supporting index on GROUP/ORDER BY keys\nCREATE INDEX CONCURRENTLY idx_customers_pk_sort ON customers (customer_id, company_name);`,
    remedyList: [
      'Use SET LOCAL work_mem within transaction blocks to avoid global server RAM exhaustion.',
      'Add supporting B-Tree indexes matching ORDER BY columns so PostgreSQL reads rows in pre-sorted order.',
      'Monitor pg_stat_database.temp_files and temp_bytes to identify repeat offending queries.',
      'Tune hash join work_mem separately if multi-batch hash joins are observed.'
    ]
  },
  {
    id: 'pg-visibility-map-heap-fetches',
    title: 'High Heap Fetches in Index-Only Scans',
    category: 'Scans & Indexes',
    severity: 'HIGH',
    summary:
      'Index-Only Scan cannot return rows purely from index pages because relation data pages are not marked all-visible in the Visibility Map.',
    engineMechanics:
      'PostgreSQL MVCC requires checking tuple visibility. If a data block has not been vacuumed since recent updates, the engine must perform random heap fetches for each matching index tuple.',
    badSql: `SELECT user_id, email FROM users WHERE is_active = true;\n-- EXPLAIN: Index Only Scan using idx_users_active on users\n-- Heap Fetches: 45,200 (Forced to read 45,200 heap pages despite index!)`,
    goodSql: `-- Run VACUUM to update the Visibility Map and freeze unchanged tuples\nVACUUM (VERBOSE, ANALYZE) users;\n\n-- Now the exact same query produces zero heap fetches:\n-- EXPLAIN: Index Only Scan using idx_users_active on users\n-- Heap Fetches: 0 (100% served from RAM index pages)`,
    remedyList: [
      'Run VACUUM on tables exhibiting high heap fetches in Index-Only Scans.',
      'Tune autovacuum settings: lower autovacuum_vacuum_scale_factor (e.g. from 0.20 to 0.05) on active tables.',
      'Ensure index covering columns are included via INCLUDE (col1, col2) syntax in PostgreSQL 11+.'
    ]
  },
  {
    id: 'pg-jit-overkill',
    title: 'Excessive LLVM JIT Compilation Overhead on Short Queries',
    category: 'Planner & JIT',
    severity: 'HIGH',
    summary:
      'LLVM JIT compiles expressions for a query, adding 50-200ms compilation latency on a query that executes in under 10ms.',
    engineMechanics:
      'When total estimated cost exceeds jit_above_cost (default 100,000), PostgreSQL invokes JIT. For complex queries executed frequently, compilation overhead dominates execution time.',
    badSql: `SELECT customer_id, SUM(total_amount)\nFROM orders\nWHERE order_date >= '2025-01-01'\nGROUP BY customer_id;\n-- Planning: 0.5ms | Execution: 12ms | JIT: 85ms (JIT added 85ms overhead!)`,
    goodSql: `-- Disable JIT for latency-sensitive OLTP queries or sessions:\nSET LOCAL jit = off;\n\nSELECT customer_id, SUM(total_amount)\nFROM orders\nWHERE order_date >= '2025-01-01'\nGROUP BY customer_id;\n-- Total runtime drops from 97ms to 12ms!`,
    remedyList: [
      'Disable JIT for OLTP connection pools: SET jit = off in postgresql.conf or session.',
      'Raise jit_above_cost from 100,000 to 500,000 to limit JIT to genuine data warehouse queries.',
      'Inspect JIT timing in EXPLAIN (ANALYZE): JIT Generation, Inlining, Optimization.'
    ]
  },
  {
    id: 'pg-non-sargable-type-casts',
    title: 'Non-Sargable Column Type Casts and Function Wrapping',
    category: 'Sargability & Syntax',
    severity: 'HIGH',
    summary:
      'Wrapping indexed columns in functions (e.g. DATE(created_at)) or explicit type casts ((col)::text) invalidates B-Tree index lookups.',
    engineMechanics:
      'PostgreSQL B-Tree indexes index raw column values. Applying a function or type conversion forces the planner to fall back to a full Sequential Scan.',
    badSql: `-- Bad: Function call on indexed timestamp column\nSELECT * FROM orders WHERE DATE(created_at) = '2025-01-01';\n\n-- Bad: Explicit type cast suppresses integer index\nSELECT * FROM accounts WHERE (account_number)::text = '10045';`,
    goodSql: `-- Good: Sargable half-open range condition\nSELECT * FROM orders\nWHERE created_at >= '2025-01-01 00:00:00' AND created_at < '2025-01-02 00:00:00';\n\n-- Good: Compare with matching data type\nSELECT * FROM accounts WHERE account_number = 10045;\n\n-- Alternative: Create Expression Index if function cannot be removed\nCREATE INDEX CONCURRENTLY idx_orders_created_date ON orders (DATE(created_at));`,
    remedyList: [
      'Rewrite date/timestamp filters as half-open ranges: col >= start AND col < end.',
      'Ensure application parameters match column data types without casting.',
      'Build Expression Indexes (CREATE INDEX ON table (func(col))) when SQL cannot be altered.'
    ]
  },
  {
    id: 'pg-unindexed-fk-locks',
    title: 'Unindexed Foreign Keys Causing Heavy Table Locks on DELETE',
    category: 'Concurrency & Locks',
    severity: 'CRITICAL',
    summary:
      'Deleting rows from parent tables triggers sequential scans and share locks on referencing child tables lacking FK indexes.',
    engineMechanics:
      'PostgreSQL automatically verifies referential integrity during DELETE/UPDATE on parent tables. Without an index on the foreign key column in the child table, PostgreSQL must sequentially scan the entire child table.',
    badSql: `-- Parent table deletion\nDELETE FROM customers WHERE customer_id = 99;\n-- Without index on orders(customer_id), PostgreSQL sequentially scans\n-- 10,000,000 rows in orders and acquires ShareLock, blocking incoming orders!`,
    goodSql: `-- Always index referencing Foreign Key columns in PostgreSQL\nCREATE INDEX CONCURRENTLY idx_orders_customer_id_fk\nON orders (customer_id);\n\n-- Now DELETE on customers executes an instant index seek on orders!`,
    remedyList: [
      'Audit all foreign key constraints in pg_constraint and ensure matching indexes exist on child tables.',
      'Always build foreign key indexes with CREATE INDEX CONCURRENTLY.',
      'Avoid cascading deletes on massive tables during peak online transaction hours.'
    ]
  },
  {
    id: 'pg-cte-optimization-fence',
    title: 'CTE Optimization Fencing (Pre-PG 12 Behavior)',
    category: 'Planner & JIT',
    severity: 'MEDIUM',
    summary:
      'Common Table Expressions (WITH cte AS (...)) acting as optimization fences, preventing predicate pushdown and join reordering.',
    engineMechanics:
      'In PostgreSQL 11 and earlier, all CTEs were materialized in memory as temporary tables. PostgreSQL 12+ inlines CTEs unless MATERIALIZED is explicitly requested.',
    badSql: `WITH recent_orders AS (\n  SELECT * FROM orders WHERE total_amount > 100\n)\nSELECT * FROM recent_orders WHERE customer_id = 500;\n-- If materialized, entire recent_orders table is built before filtering customer_id!`,
    goodSql: `-- Explicitly allow inlining and predicate pushdown in PostgreSQL 12+:\nWITH recent_orders AS NOT MATERIALIZED (\n  SELECT * FROM orders WHERE total_amount > 100\n)\nSELECT * FROM recent_orders WHERE customer_id = 500;\n-- Predicate customer_id = 500 is pushed directly into the scan!`,
    remedyList: [
      'Use WITH ... AS NOT MATERIALIZED when you want the planner to inline CTEs and push predicates down.',
      'Use WITH ... AS MATERIALIZED only when the CTE contains expensive volatile functions called multiple times.'
    ]
  },
  {
    id: 'pg-correlated-subquery-lateral',
    title: 'Correlated Scalar Subqueries vs LATERAL Joins',
    category: 'Scans & Indexes',
    severity: 'HIGH',
    summary:
      'Executing correlated scalar subqueries in SELECT clauses runs $N$ individual SubPlan loops instead of set-based hash/merge joins.',
    engineMechanics:
      'For every row processed by the outer query, the SubPlan is re-evaluated. If outer query produces 10,000 rows, subquery executes 10,000 times.',
    badSql: `SELECT c.customer_id, c.company_name,\n  (SELECT o.total_amount FROM orders o WHERE o.customer_id = c.customer_id ORDER BY o.order_date DESC LIMIT 1) AS last_order_amount\nFROM customers c;\n-- EXPLAIN: SubPlan 1 executed 5,000 times!`,
    goodSql: `-- Rewrite using LEFT JOIN LATERAL for single-pass indexed pipeline:\nSELECT c.customer_id, c.company_name, lo.total_amount AS last_order_amount\nFROM customers c\nLEFT JOIN LATERAL (\n  SELECT o.total_amount\n  FROM orders o\n  WHERE o.customer_id = c.customer_id\n  ORDER BY o.order_date DESC\n  LIMIT 1\n) lo ON true;`,
    remedyList: [
      'Replace correlated scalar subqueries with LEFT JOIN LATERAL.',
      'Use window functions (e.g. ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)) for latest record queries.',
      'Ensure index exists matching the LATERAL join correlation and ORDER BY keys.'
    ]
  }
];

export const PgTuningPlaybookTab: React.FC<PgTuningPlaybookTabProps> = ({ plan }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedPatternId, setExpandedPatternId] = useState<string | null>(null);

  const filteredPatterns = useMemo(() => {
    return PG_PLAYBOOK_PATTERNS.filter((pattern) => {
      const matchSearch =
        pattern.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pattern.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pattern.engineMechanics.toLowerCase().includes(searchTerm.toLowerCase());

      const matchCat = selectedCategory === 'all' || pattern.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [searchTerm, selectedCategory]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="tab-scroll-container">
      {/* Playbook Header */}
      <div className="verdict-hero-card glass-panel" style={{ borderLeft: '4px solid #38bdf8' }}>
        <div className="verdict-top-row">
          <div className="verdict-title-tag">
            <BookOpen size={16} color="#38bdf8" />
            <span>PostgreSQL Performance Playbook & Anti-Pattern Library</span>
          </div>
          <span className="badge badge-info" style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
            8 Core PostgreSQL Optimization Plays
          </span>
        </div>

        <h3 style={{ margin: '8px 0 4px 0', fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
          Production DBA Battlecard for PostgreSQL Execution Tuning
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
          Deep architectural explanations, MVCC mechanics, bad vs good SQL patterns, and concrete DBA remedies for PostgreSQL sequential scans, work_mem spills, JIT compilation, and locking.
        </p>

        {/* Search & Category Filter Bar */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-input-wrap" style={{ position: 'relative', minWidth: '220px' }}>
            <Search size={13} style={{ position: 'absolute', left: '8px', top: '8px', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search playbook patterns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '4px 8px 4px 28px',
                fontSize: '11px',
                color: '#f8fafc',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '11px',
              color: '#38bdf8',
              outline: 'none',
            }}
          >
            <option value="all">All Categories</option>
            <option value="Scans & Indexes">Scans & Indexes</option>
            <option value="Memory & work_mem">Memory & work_mem</option>
            <option value="Sargability & Syntax">Sargability & Syntax</option>
            <option value="Concurrency & Locks">Concurrency & Locks</option>
            <option value="Planner & JIT">Planner & JIT</option>
          </select>
        </div>
      </div>

      {/* Playbook Patterns List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
        {filteredPatterns.map((play) => {
          const isExpanded = expandedPatternId === play.id;
          return (
            <div
              key={play.id}
              className="glass-panel"
              style={{
                padding: '16px',
                borderLeft: `4px solid ${
                  play.severity === 'CRITICAL'
                    ? '#f43f5e'
                    : play.severity === 'HIGH'
                    ? '#fbbf24'
                    : '#38bdf8'
                }`,
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedPatternId(isExpanded ? null : play.id)}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="badge badge-info" style={{ fontSize: '10px' }}>
                      {play.category}
                    </span>
                    <span
                      className={`badge badge-${
                        play.severity === 'CRITICAL'
                          ? 'critical'
                          : play.severity === 'HIGH'
                          ? 'high'
                          : 'info'
                      }`}
                      style={{ fontSize: '10px' }}
                    >
                      {play.severity}
                    </span>
                  </div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                    {play.title}
                  </h4>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: '11px' }}>
                    {isExpanded ? 'Collapse' : 'Inspect Play'}
                  </button>
                  {isExpanded ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
                </div>
              </div>

              <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#cbd5e1' }}>
                {play.summary}
              </p>

              {/* Detailed Breakdown when expanded */}
              {isExpanded && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Engine Mechanics */}
                  <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px', padding: '12px', marginBottom: '14px' }}>
                    <strong style={{ fontSize: '12px', color: '#38bdf8' }}>Internal Engine Mechanics:</strong>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: '#cbd5e1', lineHeight: '1.5' }}>
                      {play.engineMechanics}
                    </p>
                  </div>

                  {/* Bad vs Good SQL Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                    {/* Bad SQL */}
                    <div style={{ background: 'rgba(244, 63, 94, 0.05)', border: '1px solid rgba(244, 63, 94, 0.2)', borderRadius: '6px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#f43f5e' }}>
                          ❌ Anti-Pattern (Problematic SQL / Plan):
                        </span>
                        <button
                          className="copy-action-btn"
                          onClick={() => handleCopy(play.badSql, `bad-${play.id}`)}
                        >
                          {copiedId === `bad-${play.id}` ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        </button>
                      </div>
                      <pre style={{ margin: 0, fontSize: '11px', color: '#fca5a5', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                        {play.badSql}
                      </pre>
                    </div>

                    {/* Good SQL */}
                    <div style={{ background: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: '6px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#34d399' }}>
                          ✅ PostgreSQL Optimized Solution:
                        </span>
                        <button
                          className="copy-action-btn"
                          onClick={() => handleCopy(play.goodSql, `good-${play.id}`)}
                        >
                          {copiedId === `good-${play.id}` ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        </button>
                      </div>
                      <pre style={{ margin: 0, fontSize: '11px', color: '#6ee7b7', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                        {play.goodSql}
                      </pre>
                    </div>
                  </div>

                  {/* Remedies */}
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#34d399' }}>PostgreSQL DBA Action Steps:</span>
                    <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: '11.5px', color: '#cbd5e1' }}>
                      {play.remedyList.map((rem, rIdx) => (
                        <li key={rIdx} style={{ marginBottom: '4px' }}>{rem}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
