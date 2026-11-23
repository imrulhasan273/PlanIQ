import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Sparkles, ArrowRight, X, Code2, Layers, Activity } from 'lucide-react';
import { StatementAnalysis } from '../types/plan';

interface QueryPreviewCellProps {
  statement: StatementAnalysis;
  onInspectPlan: (stmt: StatementAnalysis) => void;
  onOptimizeAI: (stmt: StatementAnalysis) => void;
}

export const QueryPreviewCell: React.FC<QueryPreviewCellProps> = ({
  statement,
  onInspectPlan,
  onOptimizeAI,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const cellRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<any>(null);

  const sqlText = statement.statementText ? statement.statementText.trim() : '<No query text available>';

  const updateCoords = () => {
    if (!cellRef.current) return;
    const rect = cellRef.current.getBoundingClientRect();
    const modalWidth = 580;
    const modalHeight = 320;

    // Center horizontally relative to cell, but clamp to viewport
    let left = rect.left;
    if (left + modalWidth > window.innerWidth - 20) {
      left = Math.max(20, window.innerWidth - modalWidth - 20);
    }
    if (left < 20) left = 20;

    // Anchor below cell; if clipping bottom, anchor above
    let top = rect.bottom + 8;
    if (top + modalHeight > window.innerHeight - 20 && rect.top > modalHeight + 20) {
      top = Math.max(20, rect.top - modalHeight - 8);
    }

    setCoords({ top, left });
  };

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    updateCoords();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (isPinned) return;
    timerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 220);
  };

  const handleCellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateCoords();
    setIsPinned(true);
    setIsOpen(true);
  };

  const handleClose = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsPinned(false);
    setIsOpen(false);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(sqlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      const onScrollOrResize = () => updateCoords();
      window.addEventListener('scroll', onScrollOrResize, true);
      window.addEventListener('resize', onScrollOrResize);
      return () => {
        window.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (cellRef.current && cellRef.current.contains(target)) return;
      if (modalRef.current && modalRef.current.contains(target)) return;
      handleClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={cellRef}
      className="query-preview-cell-wrap"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleCellClick}
    >
      <div className="stmt-text-cell">
        <Code2 size={13} color="#38bdf8" className="query-code-icon" />
        <span className="query-snippet-text">{sqlText}</span>
        <button
          type="button"
          className="quick-inline-copy-btn"
          onClick={handleCopy}
          title="Copy SQL Query"
        >
          {copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
        </button>
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={modalRef}
            className={`query-hover-modal glass-panel ${isPinned ? 'is-pinned-modal' : ''}`}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 99999999,
            }}
            onMouseEnter={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
            }}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Header */}
            <div className="query-modal-header">
              <div className="query-modal-title-row">
                <span className="query-stmt-badge">Stmt #{statement.statementId}</span>
                <span className="query-type-tag">[{statement.statementType}]</span>
                <span className="query-cost-pill">
                  <Activity size={12} color="#38bdf8" />
                  <span>Cost: {statement.statementSubTreeCost.toFixed(2)} ({statement.costPercentage.toFixed(1)}%)</span>
                </span>
                {statement.statementEstRows > 0 && (
                  <span className="query-rows-pill">
                    <Layers size={12} color="#94a3b8" />
                    <span>Est: {statement.statementEstRows.toLocaleString()} rows</span>
                  </span>
                )}
              </div>

              <div className="query-modal-top-actions">
                <button
                  type="button"
                  className={`btn-copy-query ${copied ? 'copied' : ''}`}
                  onClick={handleCopy}
                  title="Copy full SQL query text to clipboard"
                >
                  {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                  <span>{copied ? 'Copied to Clipboard!' : 'Copy SQL'}</span>
                </button>

                <button
                  type="button"
                  className="btn-modal-close"
                  onClick={handleClose}
                  title="Close (Esc)"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Modal Query Body */}
            <div className="query-modal-body">
              <pre className="query-sql-pre">
                <code>{sqlText}</code>
              </pre>
            </div>

            {/* Modal Bottom Action Bar */}
            <div className="query-modal-footer">
              <span className="query-footer-hint">
                Hover to view & copy • Click table cell to pin
              </span>

              <div className="query-footer-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => {
                    handleClose(e);
                    onInspectPlan(statement);
                  }}
                  title="Inspect this query in Plan Tree Visualizer"
                >
                  <span>Plan Tree</span>
                  <ArrowRight size={13} />
                </button>

                <button
                  type="button"
                  className="btn btn-ai btn-sm"
                  onClick={(e) => {
                    handleClose(e);
                    onOptimizeAI(statement);
                  }}
                  title="Get AI Optimization & T-SQL rewrites for this query"
                >
                  <Sparkles size={13} color="#c084fc" />
                  <span>AI Optimize</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
