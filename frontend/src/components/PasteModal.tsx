import React, { useState } from 'react';
import { X, Upload, FileText } from 'lucide-react';

interface PasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParse: (xmlContent: string, planName: string) => void;
  engine?: 'sqlserver' | 'postgresql';
}

export const PasteModal: React.FC<PasteModalProps> = ({ isOpen, onClose, onParse, engine = 'sqlserver' }) => {
  const isPg = engine === 'postgresql';
  const [content, setContent] = useState<string>('');
  const [planName, setPlanName] = useState<string>(() =>
    isPg ? 'Pasted PostgreSQL Plan' : 'Pasted Execution Plan'
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onParse(content, planName || (isPg ? 'Pasted PostgreSQL Plan' : 'Pasted Execution Plan'));
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-panel">
        <div className="modal-header">
          <div className="modal-title-row">
            <Upload size={18} color="#38bdf8" />
            <h3 className="modal-title">
              {isPg
                ? 'Paste PostgreSQL Execution Plan (JSON)'
                : 'Paste Execution Plan (SQL Server XML or PostgreSQL JSON)'}
            </h3>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">Plan Label / Name</label>
            <input
              type="text"
              className="form-input"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder={
                isPg
                  ? 'e.g. Analytics Query (EXPLAIN ANALYZE)'
                  : 'e.g. Orders Report (Actual Plan)'
              }
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              {isPg
                ? 'PostgreSQL EXPLAIN (JSON) Output'
                : 'Plan Content (ShowPlan XML or PostgreSQL EXPLAIN JSON)'}
            </label>
            <textarea
              className="form-textarea"
              rows={12}
              placeholder={
                isPg
                  ? 'Paste PostgreSQL EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) output or DBeaver / pgAdmin export here...'
                  : 'Paste SQL Server <ShowPlanXML...> or PostgreSQL EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) here...'
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!content.trim()}>
              <FileText size={14} />
              <span>{isPg ? 'Parse & Visualize PostgreSQL Plan' : 'Parse & Visualize Plan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
