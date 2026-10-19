import React, { useState } from 'react';
import { X, Upload, FileText } from 'lucide-react';

interface PasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParse: (xmlContent: string, planName: string) => void;
}

export const PasteModal: React.FC<PasteModalProps> = ({ isOpen, onClose, onParse }) => {
  const [content, setContent] = useState<string>('');
  const [planName, setPlanName] = useState<string>('Pasted Execution Plan');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onParse(content, planName || 'Pasted Execution Plan');
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-panel">
        <div className="modal-header">
          <div className="modal-title-row">
            <Upload size={18} color="#38bdf8" />
            <h3 className="modal-title">Paste SQL Server ShowPlan XML</h3>
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
              placeholder="e.g. Orders Report (Actual Plan)"
            />
          </div>

          <div className="form-group">
            <label className="form-label">ShowPlan XML Content</label>
            <textarea
              className="form-textarea"
              rows={12}
              placeholder="Paste <ShowPlanXML xmlns=...> content here..."
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
              <span>Parse & Visualize Plan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
