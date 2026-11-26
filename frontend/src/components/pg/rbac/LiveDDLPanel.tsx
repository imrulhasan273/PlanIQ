import React, { useState, useMemo, useEffect } from 'react';
import {
  Copy,
  Check,
  CheckCircle2,
  Zap,
  Trash2,
  FileCode2,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { DDLOperation } from '../../../types/rbac';
import { ApplyDDLModal } from './modals/ApplyDDLModal';

// ─── Props ────────────────────────────────────────────────────────────────────

interface LiveDDLPanelProps {
  ops: DDLOperation[];
  roleName?: string;
  allowRbacWrite?: boolean;
  onRemoveOp: (index: number) => void;
  onClearOps: () => void;
  onApply: (ddl: string) => Promise<void>;
}

interface ExecutionResult {
  status: 'success' | 'error';
  statementCount: number;
  durationMs: number;
  timestamp: string;
  message: string;
  sql: string;
}

// ─── DDL Generator ───────────────────────────────────────────────────────────

function formatObjectIdent(objectType: string, objectName: string): string {
  const upper = objectType.toUpperCase();
  if (upper === 'DATABASE' || upper === 'SCHEMA') {
    return q(objectName);
  }
  const dotIdx = objectName.indexOf('.');
  if (dotIdx === -1) {
    return upper === 'FUNCTION' || upper === 'PROCEDURE' ? objectName : q(objectName);
  }
  const schema = objectName.slice(0, dotIdx);
  const rest = objectName.slice(dotIdx + 1);
  if (upper === 'FUNCTION' || upper === 'PROCEDURE') {
    const parenIdx = rest.indexOf('(');
    if (parenIdx !== -1) {
      return `${q(schema)}.${q(rest.slice(0, parenIdx))}${rest.slice(parenIdx)}`;
    }
    return `${q(schema)}.${rest}`;
  }
  return `${q(schema)}.${q(rest)}`;
}

function generateDDL(ops: DDLOperation[]): string {
  if (ops.length === 0) return '';

  const header = [
    '-- ============================================================',
    '-- PlanIQ Security & RBAC Studio — Generated DDL',
    `-- Generated: ${new Date().toISOString()}`,
    '-- ⚠ REVIEW BEFORE APPLYING — always test in dev first',
    '-- ============================================================',
    '',
  ].join('\n');

  const stmts = ops.map((op) => {
    switch (op.type) {
      case 'GRANT':
        return `GRANT ${op.privilege} ON ${op.objectType} ${formatObjectIdent(op.objectType, op.objectName)} TO ${q(op.grantee)}${op.withGrantOption ? ' WITH GRANT OPTION' : ''};`;
      case 'REVOKE':
        return `REVOKE ${op.privilege} ON ${op.objectType} ${formatObjectIdent(op.objectType, op.objectName)} FROM ${q(op.grantee)}${op.cascade ? ' CASCADE' : ''};`;
      case 'GRANT_COLUMN':
        return `GRANT ${op.privilege} (${q(op.columnName)}) ON ${q(op.tableSchema)}.${q(op.tableName)} TO ${q(op.grantee)};`;
      case 'REVOKE_COLUMN':
        return `REVOKE ${op.privilege} (${q(op.columnName)}) ON ${q(op.tableSchema)}.${q(op.tableName)} FROM ${q(op.grantee)};`;
      case 'ALTER_ROLE':
        return `ALTER ROLE ${q(op.roleName)} ${op.attribute}${op.value !== '' ? ' ' + op.value : ''};`;
      case 'ALTER_ROLE_SET':
        return op.database
          ? `ALTER ROLE ${q(op.roleName)} IN DATABASE ${q(op.database)} SET ${op.paramName} = '${op.value}';`
          : `ALTER ROLE ${q(op.roleName)} SET ${op.paramName} = '${op.value}';`;
      case 'CREATE_POLICY':
        return [
          `CREATE POLICY ${q(op.policyName)}`,
          `  ON ${op.tableSchema}.${op.tableName}`,
          `  AS ${op.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}`,
          `  FOR ${op.command}`,
          op.roles.length > 0 ? `  TO ${op.roles.map(q).join(', ')}` : null,
          op.usingExpr ? `  USING (${op.usingExpr})` : null,
          op.withCheckExpr ? `  WITH CHECK (${op.withCheckExpr})` : null,
        ]
          .filter(Boolean)
          .join('\n') + ';';
      case 'DROP_POLICY':
        return `DROP POLICY ${q(op.policyName)} ON ${op.tableSchema}.${op.tableName};`;
      case 'ALTER_TABLE_RLS':
        return op.enable
          ? `ALTER TABLE ${op.tableSchema}.${op.tableName} ENABLE ROW LEVEL SECURITY;${op.force ? `\nALTER TABLE ${op.tableSchema}.${op.tableName} FORCE ROW LEVEL SECURITY;` : ''}`
          : `ALTER TABLE ${op.tableSchema}.${op.tableName} DISABLE ROW LEVEL SECURITY;`;
      case 'ALTER_DEFAULT_PRIVS':
        return op.revoke
          ? `ALTER DEFAULT PRIVILEGES FOR ROLE ${q(op.forRole)}${op.inSchema ? ` IN SCHEMA ${q(op.inSchema)}` : ''} REVOKE ${op.privilege} ON ${op.objectType}S FROM ${q(op.grantee)};`
          : `ALTER DEFAULT PRIVILEGES FOR ROLE ${q(op.forRole)}${op.inSchema ? ` IN SCHEMA ${q(op.inSchema)}` : ''} GRANT ${op.privilege} ON ${op.objectType}S TO ${q(op.grantee)};`;
      case 'CREATE_ROLE': {
        const opts: string[] = [];
        const o = op.options;
        if (o.login !== undefined) opts.push(o.login ? 'LOGIN' : 'NOLOGIN');
        if (o.superuser) opts.push('SUPERUSER');
        if (o.inherit !== undefined) opts.push(o.inherit ? 'INHERIT' : 'NOINHERIT');
        if (o.createRole) opts.push('CREATEROLE');
        if (o.createDB) opts.push('CREATEDB');
        if (o.replication) opts.push('REPLICATION');
        if (o.bypassRLS) opts.push('BYPASSRLS');
        if (o.connLimit !== undefined) opts.push(`CONNECTION LIMIT ${o.connLimit}`);
        if (o.password) opts.push(`PASSWORD '${o.password}'`);
        if (o.validUntil) opts.push(`VALID UNTIL '${o.validUntil}'`);
        return `CREATE ROLE ${q(op.roleName)}${opts.length > 0 ? ' ' + opts.join(' ') : ''};`;
      }
      case 'DROP_ROLE':
        return `DROP ROLE ${q(op.roleName)};`;
      case 'GRANT_ROLE':
        return `GRANT ${q(op.parentRole)} TO ${q(op.memberRole)}${op.withAdminOption ? ' WITH ADMIN OPTION' : ''};`;
      case 'REVOKE_ROLE':
        return `REVOKE ${q(op.parentRole)} FROM ${q(op.memberRole)};`;
      case 'RAW_SQL': {
        const trimmed = op.sql.trim();
        return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
      }
      default:
        return '-- (unknown operation)';
    }
  });

  return header + stmts.join('\n');
}

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const LiveDDLPanel: React.FC<LiveDDLPanelProps> = ({
  ops,
  roleName,
  allowRbacWrite = false,
  onRemoveOp,
  onClearOps,
  onApply,
}) => {
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showOps, setShowOps] = useState(false);
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);
  const [showExecutedSql, setShowExecutedSql] = useState(false);

  useEffect(() => {
    setLastResult(null);
    setShowExecutedSql(false);
  }, [roleName]);

  const ddl = useMemo(() => generateDDL(ops), [ops]);

  const handleCopy = () => {
    if (ddl && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(ddl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="rbac-ddl-header">
        <FileCode2 size={14} style={{ color: 'var(--accent-blue)' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-main)' }}>
          Live DDL
        </span>
        {roleName && (
          <span
            className="rbac-stat-pill rbac-mono"
            style={{ color: 'var(--accent-cyan)', borderColor: 'var(--border-subtle)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={roleName}
          >
            {roleName}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span
          className="rbac-stat-pill"
          style={ops.length > 0 ? { color: 'var(--accent-cyan)', borderColor: 'var(--accent-blue)' } : undefined}
        >
          {ops.length} op{ops.length !== 1 ? 's' : ''}
        </span>
        {ops.length > 0 && (
          <button onClick={onClearOps} className="rbac-icon-btn" title="Clear all operations">
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* DDL content */}
      <div className="rbac-ddl-body">
        {lastResult && (
          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${lastResult.status === 'success' ? 'var(--accent-emerald)' : 'var(--accent-red)'}`,
              background:
                lastResult.status === 'success'
                  ? 'rgba(16, 185, 129, 0.10)'
                  : 'rgba(244, 63, 94, 0.10)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {lastResult.status === 'success' ? (
                <CheckCircle2 size={15} style={{ color: 'var(--accent-emerald)', flexShrink: 0, marginTop: 1 }} />
              ) : (
                <AlertTriangle size={15} style={{ color: 'var(--accent-red)', flexShrink: 0, marginTop: 1 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: lastResult.status === 'success' ? 'var(--accent-emerald)' : 'var(--accent-red)',
                  }}
                >
                  {lastResult.status === 'success' ? 'DDL Applied Successfully' : 'DDL Execution Failed'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-main)', marginTop: 2, wordBreak: 'break-word' }}>
                  {lastResult.message}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  {lastResult.timestamp} · {lastResult.durationMs}ms
                </div>
                <button
                  type="button"
                  onClick={() => setShowExecutedSql((v) => !v)}
                  style={{
                    marginTop: 6,
                    padding: 0,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-cyan)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {showExecutedSql ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  <span>{showExecutedSql ? 'Hide executed SQL' : 'View executed SQL'}</span>
                </button>
              </div>
              <button
                type="button"
                className="rbac-icon-btn"
                title="Dismiss output"
                onClick={() => setLastResult(null)}
              >
                <X size={12} />
              </button>
            </div>
            {showExecutedSql && (
              <pre
                className="rbac-code-pre"
                style={{
                  marginTop: 8,
                  padding: 8,
                  borderRadius: 6,
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                  maxHeight: 160,
                  overflow: 'auto',
                }}
              >
                {lastResult.sql}
              </pre>
            )}
          </div>
        )}

        {ops.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: lastResult ? 'auto' : '100%',
              gap: 8,
              textAlign: 'center',
              color: 'var(--text-dim)',
              padding: 16,
            }}
          >
            <FileCode2 size={24} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: 12, margin: 0 }}>
              Toggle privileges or modify settings in the workspace to stage DDL statements here.
            </p>
          </div>
        ) : (
          <pre className="rbac-code-pre">{ddl}</pre>
        )}
      </div>

      {/* Operation list toggle */}
      {ops.length > 0 && (
        <div className="rbac-ddl-ops-drawer">
          <button
            type="button"
            className="rbac-tree-section-btn"
            onClick={() => setShowOps(!showOps)}
          >
            {showOps ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{ops.length} pending operation{ops.length !== 1 ? 's' : ''}</span>
          </button>
          {showOps && (
            <div style={{ maxHeight: 130, overflowY: 'auto', padding: '0 12px 8px' }}>
              {ops.map((op, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                  <span className="rbac-mono" style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>
                    {op.type === 'RAW_SQL' && op.label ? op.label : op.type}
                  </span>
                  <button type="button" onClick={() => onRemoveOp(i)} className="rbac-icon-btn">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Warning */}
      {ops.length > 0 && !allowRbacWrite && (
        <div className="rbac-ddl-warning">
          <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>Enable &apos;Write for RBAC&apos; on this connection in Connections to apply DDL (Copy still works).</span>
        </div>
      )}
      {ops.length > 0 && allowRbacWrite && (
        <div className="rbac-ddl-warning">
          <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>Review before applying. Changes take effect immediately on the live server.</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="rbac-ddl-actions">
        <button
          type="button"
          onClick={handleCopy}
          disabled={ops.length === 0}
          className="rbac-btn"
          style={{ flex: 1 }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={ops.length === 0 || !allowRbacWrite}
          className="rbac-btn rbac-btn-primary"
          style={{ flex: 1 }}
          title={!allowRbacWrite ? "Enable 'Write for RBAC' in Connections to apply" : 'Apply DDL to server'}
        >
          <Zap size={12} />
          Apply
        </button>
      </div>

      {showModal && (
        <ApplyDDLModal
          ddl={ddl}
          opCount={ops.length}
          onCancel={() => setShowModal(false)}
          onConfirm={async () => {
            const count = ops.length;
            const executedSql = ddl;
            const start = performance.now();
            try {
              await onApply(executedSql);
              setLastResult({
                status: 'success',
                statementCount: count,
                durationMs: Math.max(1, Math.round(performance.now() - start)),
                timestamp: new Date().toLocaleTimeString(),
                message: `Committed ${count} statement${count !== 1 ? 's' : ''} inside a read-write transaction.`,
                sql: executedSql,
              });
              setShowExecutedSql(false);
              onClearOps();
              setShowModal(false);
            } catch (e: any) {
              setLastResult({
                status: 'error',
                statementCount: count,
                durationMs: Math.max(1, Math.round(performance.now() - start)),
                timestamp: new Date().toLocaleTimeString(),
                message: e?.message || String(e),
                sql: executedSql,
              });
              throw e;
            }
          }}
        />
      )}
    </div>
  );
};
