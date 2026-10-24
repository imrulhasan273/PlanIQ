import React, { useState, useMemo } from 'react';
import {
  Layers,
  Database,
  AlertTriangle,
  ArrowRight,
  Zap,
  Clock,
  Cpu,
  Search,
  Filter,
  Flame,
  CheckCircle2,
  HardDrive,
  GitFork,
  Sparkles,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Table,
  Tag,
  Code2
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis, PlanNode } from '../types/plan';

interface BatchFlowTabProps {
  plan: PlanAnalysis;
  onSelectStatement: (stmt: StatementAnalysis, targetTab: 'visualizer' | 'advisor') => void;
}

interface TempTableLifecycle {
  tableName: string;
  createdInStmt?: string;
  createMethod?: 'SELECT_INTO' | 'CREATE_TABLE' | 'UNKNOWN';
  isUnindexedHeap: boolean;
  insertedInStmts: { stmtId: string; estRows: number }[];
  readInStmts: string[];
  indexedInStmts: string[];
  droppedInStmt?: string;
  totalReferences: number;
}

interface TempDbSpillEvent {
  stmtId: string;
  nodeId: number;
  physicalOp: string;
  warningText: string;
}

export const BatchFlowTab: React.FC<BatchFlowTabProps> = ({
  plan,
  onSelectStatement,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'culprits' | 'tempdb' | 'warnings'>('all');
  const [sortOrder, setSortOrder] = useState<'sequence' | 'cost_desc'>('sequence');
  const [expandedStmtId, setExpandedStmtId] = useState<string | null>(null);

  // 1. Analyze batch statements and cumulative cost progression
  const processedStatements = useMemo(() => {
    // Sort statements in actual chronological execution order in the batch / stored procedure
    const chronological = [...plan.statements].sort((a, b) => {
      const idA = parseInt(a.statementId, 10);
      const idB = parseInt(b.statementId, 10);
      if (!isNaN(idA) && !isNaN(idB)) {
        return idA - idB;
      }
      return 0;
    });

    let runningCost = 0;
    const totalCost = plan.totalSubTreeCost > 0 ? plan.totalSubTreeCost : 1;

    return chronological.map((stmt, idx) => {
      runningCost += stmt.statementSubTreeCost;
      const cumulativePct = Math.min(100, (runningCost / totalCost) * 100);

      // Check TempDB activities in this statement
      const text = stmt.statementText || '';
      const textUpper = text.toUpperCase();

      // Detect temp tables mentioned (e.g., #Table)
      const tempMatches = Array.from(new Set(text.match(/#[A-Za-z0-9_]+/g) || []));

      const createsSelectInto = /SELECT[\s\S]+?INTO\s+#[A-Za-z0-9_]+/i.test(text);
      const createsExplicit = /CREATE\s+TABLE\s+#[A-Za-z0-9_]+/i.test(text);
      const insertsInto = /INSERT\s+(?:INTO\s+)?#[A-Za-z0-9_]+/i.test(text);
      const readsTemp = /(?:FROM|JOIN)\s+#[A-Za-z0-9_]+/i.test(text);
      const dropsTemp = /DROP\s+TABLE\s+#[A-Za-z0-9_]+/i.test(text);
      const createsIndexOnTemp = /CREATE\s+(?:UNIQUE\s+)?(?:CLUSTERED\s+|NONCLUSTERED\s+)?INDEX[\s\S]+?ON\s+#[A-Za-z0-9_]+/i.test(text);

      // Detect spills in warnings
      const hasSpill = (stmt.warnings || []).some(
        (w) =>
          w.kind === 'SpillToTempDb' ||
          (w.issue && w.issue.toLowerCase().includes('spill')) ||
          (w.description && w.description.toLowerCase().includes('spill'))
      );

      // Node-level scan for temp table and spill operations
      let nodeSpillsCount = 0;
      const traverseNodes = (node?: PlanNode) => {
        if (!node) return;
        if (node.warnings && node.warnings.some((w) => w.toLowerCase().includes('spill'))) {
          nodeSpillsCount++;
        }
        if (node.children) {
          node.children.forEach(traverseNodes);
        }
      };
      if (stmt.rootNode) traverseNodes(stmt.rootNode);

      return {
        ...stmt,
        originalStmt: stmt,
        sequenceIndex: idx + 1,
        cumulativeCost: runningCost,
        cumulativePct: Number(cumulativePct.toFixed(1)),
        tempTablesMentioned: tempMatches,
        createsSelectInto,
        createsExplicit,
        insertsInto,
        readsTemp,
        dropsTemp,
        createsIndexOnTemp,
        hasSpill: hasSpill || nodeSpillsCount > 0,
        hasTempActivity:
          tempMatches.length > 0 ||
          createsSelectInto ||
          createsExplicit ||
          insertsInto ||
          readsTemp ||
          dropsTemp ||
          createsIndexOnTemp,
      };
    });
  }, [plan.statements, plan.totalSubTreeCost]);

  // 2. Aggregate TempDB Table Lifecycle across all batch statements
  const tempTablesLifecycle = useMemo(() => {
    const tableMap = new Map<string, TempTableLifecycle>();

    processedStatements.forEach((stmt) => {
      const text = stmt.statementText || '';

      // Check for creation
      const selectIntoMatch = text.match(/SELECT[\s\S]+?INTO\s+(#[A-Za-z0-9_]+)/i);
      if (selectIntoMatch) {
        const name = selectIntoMatch[1];
        const entry = tableMap.get(name) || {
          tableName: name,
          isUnindexedHeap: true,
          insertedInStmts: [],
          readInStmts: [],
          indexedInStmts: [],
          totalReferences: 0,
        };
        entry.createdInStmt = stmt.statementId;
        entry.createMethod = 'SELECT_INTO';
        entry.totalReferences++;
        tableMap.set(name, entry);
      }

      const explicitCreateMatch = text.match(/CREATE\s+TABLE\s+(#[A-Za-z0-9_]+)/i);
      if (explicitCreateMatch) {
        const name = explicitCreateMatch[1];
        const hasPkOrClustered = /PRIMARY\s+KEY|CLUSTERED/i.test(text);
        const entry = tableMap.get(name) || {
          tableName: name,
          isUnindexedHeap: !hasPkOrClustered,
          insertedInStmts: [],
          readInStmts: [],
          indexedInStmts: [],
          totalReferences: 0,
        };
        entry.createdInStmt = stmt.statementId;
        entry.createMethod = 'CREATE_TABLE';
        entry.totalReferences++;
        tableMap.set(name, entry);
      }

      // Check for insertions
      const insertMatches = text.match(/INSERT\s+(?:INTO\s+)?(#[A-Za-z0-9_]+)/gi);
      if (insertMatches) {
        insertMatches.forEach((m) => {
          const parts = m.split(/\s+/);
          const name = parts[parts.length - 1];
          const entry = tableMap.get(name) || {
            tableName: name,
            isUnindexedHeap: true,
            insertedInStmts: [],
            readInStmts: [],
            indexedInStmts: [],
            totalReferences: 0,
          };
          if (!entry.insertedInStmts.some((s) => s.stmtId === stmt.statementId)) {
            entry.insertedInStmts.push({ stmtId: stmt.statementId, estRows: stmt.statementEstRows });
          }
          entry.totalReferences++;
          tableMap.set(name, entry);
        });
      }

      // Check for reads / joins
      const readMatches = text.match(/(?:FROM|JOIN)\s+(#[A-Za-z0-9_]+)/gi);
      if (readMatches) {
        readMatches.forEach((m) => {
          const parts = m.split(/\s+/);
          const name = parts[parts.length - 1];
          const entry = tableMap.get(name) || {
            tableName: name,
            isUnindexedHeap: true,
            insertedInStmts: [],
            readInStmts: [],
            indexedInStmts: [],
            totalReferences: 0,
          };
          if (!entry.readInStmts.includes(stmt.statementId)) {
            entry.readInStmts.push(stmt.statementId);
          }
          entry.totalReferences++;
          tableMap.set(name, entry);
        });
      }

      // Check for index creation on temp table
      const indexMatches = text.match(/INDEX[\s\S]+?ON\s+(#[A-Za-z0-9_]+)/gi);
      if (indexMatches) {
        indexMatches.forEach((m) => {
          const parts = m.split(/\s+/);
          const name = parts[parts.length - 1];
          const entry = tableMap.get(name);
          if (entry) {
            if (!entry.indexedInStmts.includes(stmt.statementId)) {
              entry.indexedInStmts.push(stmt.statementId);
            }
            entry.isUnindexedHeap = false;
            entry.totalReferences++;
          }
        });
      }

      // Check for drop table
      const dropMatch = text.match(/DROP\s+TABLE\s+(#[A-Za-z0-9_]+)/i);
      if (dropMatch) {
        const name = dropMatch[1];
        const entry = tableMap.get(name);
        if (entry) {
          entry.droppedInStmt = stmt.statementId;
          entry.totalReferences++;
        }
      }
    });

    return Array.from(tableMap.values()).sort((a, b) => b.totalReferences - a.totalReferences);
  }, [processedStatements]);

  // 3. Extract TempDB Spills
  const tempDbSpills = useMemo<TempDbSpillEvent[]>(() => {
    const spills: TempDbSpillEvent[] = [];
    processedStatements.forEach((stmt) => {
      // From warnings
      (stmt.warnings || []).forEach((w) => {
        if (
          w.kind === 'SpillToTempDb' ||
          (w.issue && w.issue.toLowerCase().includes('spill')) ||
          (w.description && w.description.toLowerCase().includes('spill'))
        ) {
          spills.push({
            stmtId: stmt.statementId,
            nodeId: w.nodeId,
            physicalOp: w.issue || 'SpillToTempDb',
            warningText: w.description || 'Execution engine spilled worktable data to TempDB disk.',
          });
        }
      });

      // From nodes
      const traverse = (node?: PlanNode) => {
        if (!node) return;
        if (node.warnings && node.warnings.some((w) => w.toLowerCase().includes('spill'))) {
          const spillWarn = node.warnings.find((w) => w.toLowerCase().includes('spill')) || '';
          if (!spills.some((s) => s.stmtId === stmt.statementId && s.nodeId === node.nodeId)) {
            spills.push({
              stmtId: stmt.statementId,
              nodeId: node.nodeId,
              physicalOp: node.physicalOp,
              warningText: spillWarn,
            });
          }
        }
        if (node.children) node.children.forEach(traverse);
      };
      if (stmt.rootNode) traverse(stmt.rootNode);
    });
    return spills;
  }, [processedStatements]);

  // 4. Filter and sort statements
  const filteredStatements = useMemo(() => {
    let result = [...processedStatements];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.statementText.toLowerCase().includes(q) ||
          s.statementId.toLowerCase().includes(q) ||
          s.statementType.toLowerCase().includes(q) ||
          s.tempTablesMentioned.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (filterType === 'culprits') {
      result = result.filter((s) => s.costPercentage >= 5);
    } else if (filterType === 'tempdb') {
      result = result.filter((s) => s.hasTempActivity || s.hasSpill);
    } else if (filterType === 'warnings') {
      result = result.filter((s) => (s.warnings && s.warnings.length > 0) || s.hasSpill);
    }

    if (sortOrder === 'cost_desc') {
      result.sort((a, b) => b.statementSubTreeCost - a.statementSubTreeCost);
    } else {
      result.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    }

    return result;
  }, [processedStatements, searchTerm, filterType, sortOrder]);

  const dominantStmt = useMemo(() => {
    if (processedStatements.length === 0) return null;
    return [...processedStatements].sort((a, b) => b.statementSubTreeCost - a.statementSubTreeCost)[0];
  }, [processedStatements]);

  const maxSubtreeCost = dominantStmt ? dominantStmt.statementSubTreeCost : 1;

  const toggleExpand = (id: string) => {
    setExpandedStmtId(expandedStmtId === id ? null : id);
  };

  const getStatementTypeBadgeColor = (type: string) => {
    const t = type.toUpperCase();
    if (t.includes('SELECT')) return 'badge-cyan';
    if (t.includes('INSERT')) return 'badge-emerald';
    if (t.includes('UPDATE')) return 'badge-amber';
    if (t.includes('DELETE')) return 'badge-rose';
    if (t.includes('CREATE')) return 'badge-purple';
    if (t.includes('DROP')) return 'badge-slate';
    return 'badge-indigo';
  };

  return (
    <div className="batchflow-tab-container">
      {/* 1. Header KPIs */}
      <div className="batchflow-header glass-panel">
        <div className="batchflow-title-row">
          <div className="batchflow-title-group">
            <div className="batchflow-icon-badge">
              <Layers size={22} color="#38bdf8" />
            </div>
            <div>
              <h1 className="batchflow-headline">Batch Execution Flow & TempDB Lifecycle</h1>
              <p className="batchflow-subtext">
                Sequential statement execution waterfall, cumulative subtree cost progression, and TempDB physical usage.
              </p>
            </div>
          </div>

          <div className="batchflow-quick-stats">
            <div className="quick-stat-box">
              <span className="quick-stat-label">Total Statements</span>
              <span className="quick-stat-val text-cyan">{plan.totalStatements}</span>
            </div>
            <div className="quick-stat-box">
              <span className="quick-stat-label">Total Batch Cost</span>
              <span className="quick-stat-val text-amber">
                {plan.totalSubTreeCost.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
            </div>
            <div className="quick-stat-box">
              <span className="quick-stat-label">Temp Tables Active</span>
              <span className="quick-stat-val text-purple">{tempTablesLifecycle.length}</span>
            </div>
            <div className="quick-stat-box">
              <span className="quick-stat-label">TempDB Spills</span>
              <span className={`quick-stat-val ${tempDbSpills.length > 0 ? 'text-rose' : 'text-emerald'}`}>
                {tempDbSpills.length}
              </span>
            </div>
          </div>
        </div>

        {/* Culprit Warning Banner */}
        {dominantStmt && dominantStmt.costPercentage >= 15 && (
          <div className="batchflow-culprit-callout">
            <div className="culprit-callout-icon">
              <Flame size={20} color="#f43f5e" />
            </div>
            <div className="culprit-callout-content">
              <div className="culprit-callout-title">
                Bottleneck Statement #{dominantStmt.statementId} (Step #{dominantStmt.sequenceIndex} of {processedStatements.length}) consumes {dominantStmt.costPercentage.toFixed(1)}% of the entire batch cost!
              </div>
              <p className="culprit-callout-desc">
                Subtree cost of {dominantStmt.statementSubTreeCost.toFixed(1)} out of {plan.totalSubTreeCost.toFixed(1)}. Tuning this single statement will deliver up to a {dominantStmt.costPercentage.toFixed(1)}% overall runtime reduction.
              </p>
            </div>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => onSelectStatement(dominantStmt.originalStmt, 'visualizer')}
            >
              <GitFork size={13} />
              <span>Inspect in Tree</span>
            </button>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => onSelectStatement(dominantStmt.originalStmt, 'advisor')}
            >
              <Sparkles size={13} color="#c084fc" />
              <span>AI Rewrite</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Cumulative Cost Timeline Progress Bar */}
      <div className="glass-panel batchflow-progression-card">
        <div className="progression-header">
          <div className="progression-title-wrap">
            <TrendingUp size={16} color="#38bdf8" />
            <span className="section-title">Cumulative Subtree Cost Progression Across Batch</span>
          </div>
          <span className="progression-hint">Hover over markers to inspect statement checkpoints</span>
        </div>

        <div className="progression-bar-wrapper">
          <div className="progression-bar-track">
            {processedStatements.map((stmt) => {
              const widthPct = Math.max(0.6, (stmt.statementSubTreeCost / (plan.totalSubTreeCost || 1)) * 100);
              const isDominant = stmt.costPercentage >= 20;
              const hasWarnings = stmt.warnings && stmt.warnings.length > 0;
              return (
                <div
                  key={stmt.statementId}
                  className={`progression-step-segment ${isDominant ? 'segment-dominant' : ''} ${hasWarnings ? 'segment-warning' : ''}`}
                  style={{ width: `${widthPct}%` }}
                  title={`Step #${stmt.sequenceIndex} (Stmt #${stmt.statementId}): ${stmt.costPercentage}% cost (${stmt.statementSubTreeCost.toFixed(1)})`}
                  onClick={() => {
                    setExpandedStmtId(stmt.statementId);
                    const el = document.getElementById(`stmt-card-${stmt.statementId}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="progression-legend-row">
          <div className="legend-item">
            <span className="legend-dot dot-normal" />
            <span>Normal Execution (&lt;10% Cost)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot dot-dominant" />
            <span>Dominant Bottleneck (&ge;20% Cost)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot dot-warning" />
            <span>Engine Warnings / TempDB Spills</span>
          </div>
          <div className="legend-item ml-auto">
            <span className="text-muted">Total: {processedStatements.length} Sequential Steps</span>
          </div>
        </div>
      </div>

      {/* 3. TempDB `#temp` Table Lifecycle Section */}
      <div className="glass-panel tempdb-lifecycle-panel">
        <div className="lifecycle-panel-header">
          <div className="lifecycle-title-group">
            <Database size={18} color="#c084fc" />
            <div>
              <h2 className="section-headline">TempDB `#temp` Table Lifecycle Tracker</h2>
              <span className="section-subtext">
                Physical analysis of temporary tables created, populated, queried, and dropped across this execution batch.
              </span>
            </div>
          </div>
          <div className="badge-pill purple-badge">
            <Table size={13} />
            <span>{tempTablesLifecycle.length} Temp Tables Monitored</span>
          </div>
        </div>

        {tempTablesLifecycle.length > 0 ? (
          <div className="tempdb-table-cards-grid">
            {tempTablesLifecycle.map((t) => (
              <div key={t.tableName} className="temp-table-card">
                <div className="temp-card-header">
                  <div className="temp-card-title-row">
                    <span className="temp-table-name">{t.tableName}</span>
                    {t.isUnindexedHeap ? (
                      <span className="heap-warning-badge" title="Created without a clustered index. Downstream nested loop joins will perform repetitive full table scans!">
                        <AlertTriangle size={12} />
                        <span>Unindexed Heap</span>
                      </span>
                    ) : (
                      <span className="heap-ok-badge">
                        <CheckCircle2 size={12} />
                        <span>Indexed</span>
                      </span>
                    )}
                  </div>
                  <span className="temp-table-refs">{t.totalReferences} Operations in Batch</span>
                </div>

                <div className="temp-card-lifecycle-steps">
                  {/* Phase 1: Creation */}
                  <div className="lifecycle-step-row">
                    <span className="step-phase-label">Creation:</span>
                    {t.createdInStmt ? (
                      <span className="step-phase-val">
                        Stmt #{t.createdInStmt}{' '}
                        {t.createMethod === 'SELECT_INTO' ? (
                          <span className="text-amber">(SELECT ... INTO unindexed)</span>
                        ) : (
                          <span className="text-cyan">(Explicit CREATE TABLE)</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">Pre-existing or Implicit</span>
                    )}
                  </div>

                  {/* Phase 2: Ingestion */}
                  <div className="lifecycle-step-row">
                    <span className="step-phase-label">Ingested:</span>
                    {t.insertedInStmts.length > 0 ? (
                      <span className="step-phase-val">
                        {t.insertedInStmts.map((ins, i) => (
                          <span key={i} className="ref-pill">
                            Stmt #{ins.stmtId} ({ins.estRows.toLocaleString()} rows)
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted">Direct in creation</span>
                    )}
                  </div>

                  {/* Phase 3: Reads / Joins */}
                  <div className="lifecycle-step-row">
                    <span className="step-phase-label">Queried / Joined:</span>
                    {t.readInStmts.length > 0 ? (
                      <span className="step-phase-val">
                        {t.readInStmts.map((sid) => (
                          <span key={sid} className="ref-pill blue-pill">
                            Stmt #{sid}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted">No down-stream reads detected</span>
                    )}
                  </div>

                  {/* Phase 4: Explicit Indexing */}
                  <div className="lifecycle-step-row">
                    <span className="step-phase-label">Indexed:</span>
                    {t.indexedInStmts.length > 0 ? (
                      <span className="step-phase-val text-emerald">
                        {t.indexedInStmts.map((sid) => (
                          <span key={sid} className="ref-pill green-pill">
                            Stmt #{sid}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-amber">⚠️ Never explicitly indexed</span>
                    )}
                  </div>

                  {/* Phase 5: Dropped */}
                  <div className="lifecycle-step-row">
                    <span className="step-phase-label">Cleanup:</span>
                    {t.droppedInStmt ? (
                      <span className="step-phase-val text-emerald">
                        Dropped in Stmt #{t.droppedInStmt}
                      </span>
                    ) : (
                      <span className="text-muted" title="Not explicitly dropped. SQL Server will clean up upon connection release.">
                        Implicit session teardown
                      </span>
                    )}
                  </div>
                </div>

                {/* Prescription Box */}
                <div className="temp-card-remedy">
                  <strong>DBA Recommendation: </strong>
                  {t.isUnindexedHeap ? (
                    <span>
                      Replace <code>SELECT ... INTO {t.tableName}</code> with an explicit{' '}
                      <code>CREATE TABLE {t.tableName} (ID INT NOT NULL PRIMARY KEY CLUSTERED, ...)</code> prior to inserting rows. This eliminates heap page locks and enables Seek joins.
                    </span>
                  ) : (
                    <span>
                      Temp table is indexed. Ensure statistics are updated if row counts vary wildly between execution batches.
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-sub-state">
            <CheckCircle2 size={24} color="#34d399" />
            <span>No explicit <code>#temp</code> tables detected in this execution plan. Workloads are using direct relational pipelines or table variables.</span>
          </div>
        )}

        {/* TempDB Spills Notification */}
        {tempDbSpills.length > 0 && (
          <div className="tempdb-spills-alert-box">
            <div className="spills-alert-header">
              <HardDrive size={18} color="#f43f5e" />
              <span className="spills-alert-title">
                {tempDbSpills.length} TempDB Worktable Disk Spill(s) Detected
              </span>
            </div>
            <p className="spills-alert-desc">
              When SQL Server’s memory grant is insufficient for Hash Join build tables or Sort operations, data pages spill to physical disk TempDB, creating massive I/O serialization delays.
            </p>
            <div className="spill-items-list">
              {tempDbSpills.map((spill, idx) => (
                <div key={idx} className="spill-item-row">
                  <span className="spill-badge">Stmt #{spill.stmtId} (Node #{spill.nodeId})</span>
                  <span className="spill-op">{spill.physicalOp}</span>
                  <span className="spill-reason">{spill.warningText}</span>
                  <button
                    className="btn btn-xs btn-outline"
                    onClick={() => {
                      const stmt = plan.statements.find((s) => s.statementId === spill.stmtId);
                      if (stmt) onSelectStatement(stmt, 'visualizer');
                    }}
                  >
                    View Node
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Sequential Statement Waterfall List */}
      <div className="batchflow-statements-section">
        <div className="statements-controls-bar glass-panel">
          <div className="search-box-wrap">
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              className="statement-search-input"
              placeholder="Search batch statements, SQL text, or #temp tables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
                ✕
              </button>
            )}
          </div>

          <div className="filter-chips-row">
            <button
              className={`filter-chip ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              All Steps ({processedStatements.length})
            </button>
            <button
              className={`filter-chip ${filterType === 'culprits' ? 'active' : ''}`}
              onClick={() => setFilterType('culprits')}
            >
              High Cost (&ge;5%)
            </button>
            <button
              className={`filter-chip ${filterType === 'tempdb' ? 'active' : ''}`}
              onClick={() => setFilterType('tempdb')}
            >
              TempDB Ops
            </button>
            <button
              className={`filter-chip ${filterType === 'warnings' ? 'active' : ''}`}
              onClick={() => setFilterType('warnings')}
            >
              With Warnings
            </button>
          </div>

          <div className="sort-controls-wrap">
            <span className="sort-label">Sort:</span>
            <button
              className={`sort-toggle-btn ${sortOrder === 'sequence' ? 'active' : ''}`}
              onClick={() => setSortOrder('sequence')}
              title="Execution timeline order"
            >
              Sequence
            </button>
            <button
              className={`sort-toggle-btn ${sortOrder === 'cost_desc' ? 'active' : ''}`}
              onClick={() => setSortOrder('cost_desc')}
              title="Descending subtree cost"
            >
              Cost %
            </button>
          </div>
        </div>

        {/* Statement Waterfall Cards */}
        <div className="waterfall-cards-list">
          {filteredStatements.map((stmt) => {
            const isExpanded = expandedStmtId === stmt.statementId;
            const costBarWidth = Math.max(2, (stmt.statementSubTreeCost / maxSubtreeCost) * 100);
            const isHighCost = stmt.costPercentage >= 15;

            return (
              <div
                id={`stmt-card-${stmt.statementId}`}
                key={stmt.statementId}
                className={`waterfall-step-card glass-panel ${isHighCost ? 'card-high-cost' : ''} ${isExpanded ? 'card-expanded' : ''}`}
              >
                <div
                  className="step-card-main-row"
                  onClick={() => toggleExpand(stmt.statementId)}
                >
                  {/* Left: Step Index & Status */}
                  <div className="step-index-column">
                    <span className="step-seq-num">#{stmt.sequenceIndex}</span>
                    <span className="step-id-badge">Stmt {stmt.statementId}</span>
                  </div>

                  {/* Middle: Type & SQL Snippet */}
                  <div className="step-info-column">
                    <div className="step-tags-row">
                      <span className={`badge ${getStatementTypeBadgeColor(stmt.statementType)}`}>
                        {stmt.statementType}
                      </span>
                      {stmt.costPercentage >= 15 && (
                        <span className="badge badge-rose">
                          <Flame size={11} />
                          <span>{stmt.costPercentage.toFixed(1)}% Cost Dominant</span>
                        </span>
                      )}
                      {stmt.createsSelectInto && (
                        <span className="badge badge-amber" title="Creates unindexed heap table">
                          <Table size={11} />
                          <span>SELECT ... INTO #temp</span>
                        </span>
                      )}
                      {stmt.hasSpill && (
                        <span className="badge badge-rose" title="Spills to disk TempDB">
                          <HardDrive size={11} />
                          <span>TempDB Spill</span>
                        </span>
                      )}
                      {stmt.tempTablesMentioned.length > 0 && (
                        <span className="badge badge-purple">
                          <Tag size={11} />
                          <span>{stmt.tempTablesMentioned.join(', ')}</span>
                        </span>
                      )}
                      {stmt.warnings && stmt.warnings.length > 0 && (
                        <span className="badge badge-amber">
                          <AlertTriangle size={11} />
                          <span>{stmt.warnings.length} Warnings</span>
                        </span>
                      )}
                    </div>

                    <div className="step-sql-snippet">
                      {stmt.statementText ? stmt.statementText.slice(0, 140) : '<No Statement Text>'}
                      {stmt.statementText && stmt.statementText.length > 140 && '...'}
                    </div>
                  </div>

                  {/* Cost & Progress Metrics */}
                  <div className="step-cost-column">
                    <div className="step-cost-header">
                      <span className="cost-val">{stmt.statementSubTreeCost.toFixed(1)}</span>
                      <span className="cost-pct">
                        ({stmt.costPercentage >= 1 ? stmt.costPercentage.toFixed(1) : stmt.costPercentage >= 0.01 ? stmt.costPercentage.toFixed(2) : '<0.01'}%)
                      </span>
                    </div>

                    {/* Relative Cost Bar */}
                    <div className="step-relative-bar-track">
                      <div
                        className={`step-relative-bar-fill ${isHighCost ? 'fill-rose' : stmt.costPercentage >= 5 ? 'fill-amber' : 'fill-cyan'}`}
                        style={{ width: `${costBarWidth}%` }}
                      />
                    </div>

                    <div className="step-cumulative-badge">
                      <span>Cumulative: {stmt.cumulativePct}%</span>
                    </div>
                  </div>

                  {/* Expand Toggle */}
                  <div className="step-expand-column">
                    {isExpanded ? <ChevronDown size={18} color="#94a3b8" /> : <ChevronRight size={18} color="#94a3b8" />}
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="step-expanded-drawer">
                    <div className="drawer-metrics-grid">
                      <div className="drawer-metric-card">
                        <span className="drawer-metric-label">Subtree Cost</span>
                        <span className="drawer-metric-val text-cyan">
                          {stmt.statementSubTreeCost.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </span>
                      </div>
                      <div className="drawer-metric-card">
                        <span className="drawer-metric-label">Estimated Rows</span>
                        <span className="drawer-metric-val text-emerald">
                          {stmt.statementEstRows.toLocaleString()}
                        </span>
                      </div>
                      <div className="drawer-metric-card">
                        <span className="drawer-metric-label">Compile CPU</span>
                        <span className="drawer-metric-val text-indigo">{stmt.compileCpuMs} ms</span>
                      </div>
                      <div className="drawer-metric-card">
                        <span className="drawer-metric-label">Compile Time</span>
                        <span className="drawer-metric-val text-purple">{stmt.compileTimeMs} ms</span>
                      </div>
                      <div className="drawer-metric-card">
                        <span className="drawer-metric-label">Optimization Level</span>
                        <span className="drawer-metric-val text-amber">{stmt.optimizationLevel || 'FULL'}</span>
                      </div>
                    </div>

                    {/* Full SQL Statement Block */}
                    <div className="drawer-sql-block">
                      <div className="drawer-sql-header">
                        <Code2 size={14} color="#38bdf8" />
                        <span>Full T-SQL Statement</span>
                        <button
                          className="btn-copy-mini"
                          onClick={() => {
                            if (navigator.clipboard) navigator.clipboard.writeText(stmt.statementText);
                          }}
                        >
                          Copy SQL
                        </button>
                      </div>
                      <pre className="drawer-sql-code">{stmt.statementText}</pre>
                    </div>

                    {/* Warnings List if present */}
                    {stmt.warnings && stmt.warnings.length > 0 && (
                      <div className="drawer-warnings-block">
                        <div className="drawer-warnings-title">
                          <AlertTriangle size={14} color="#f59e0b" />
                          <span>Detected Engine Warnings in this Statement</span>
                        </div>
                        <div className="drawer-warnings-list">
                          {stmt.warnings.map((w, wIdx) => (
                            <div key={wIdx} className="drawer-warning-item">
                              <span className="warning-kind-pill">{w.kind || 'Warning'}</span>
                              <span className="warning-desc-text">{w.description || w.issue || w.expression}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="drawer-actions-row">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onSelectStatement(stmt.originalStmt, 'visualizer')}
                      >
                        <GitFork size={14} />
                        <span>Inspect in Plan Tree Visualizer</span>
                      </button>

                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onSelectStatement(stmt.originalStmt, 'advisor')}
                      >
                        <Sparkles size={14} color="#c084fc" />
                        <span>AI Performance Doctor & Rewrite</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
