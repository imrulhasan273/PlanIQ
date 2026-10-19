import React from 'react';
import { X, Sparkles, Key, Bot, Server, Save } from 'lucide-react';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: {
    provider: 'offline' | 'gemini' | 'openai' | 'ollama';
    apiKey: string;
    model: string;
    endpointUrl: string;
  };
  onChangeConfig: (newConfig: any) => void;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-panel" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div className="modal-title-row">
            <Sparkles size={18} color="#c084fc" />
            <h3 className="modal-title">AI Advisor Settings</h3>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Optimization Provider</label>
            <select
              className="form-input"
              value={config.provider}
              onChange={(e) => onChangeConfig({ ...config, provider: e.target.value })}
            >
              <option value="offline">Deterministic DBA Rule Engine (Offline, No API Key)</option>
              <option value="gemini">Google Gemini (Recommended for SQL)</option>
              <option value="openai">OpenAI (ChatGPT / GPT-4o)</option>
              <option value="ollama">Local Ollama (100% Private, DeepSeek/Llama)</option>
            </select>
          </div>

          {config.provider !== 'offline' && config.provider !== 'ollama' && (
            <div className="form-group">
              <label className="form-label">
                <Key size={13} style={{ display: 'inline', marginRight: '4px' }} />
                {config.provider.toUpperCase()} API Key
              </label>
              <input
                type="password"
                className="form-input"
                placeholder={config.provider === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                value={config.apiKey}
                onChange={(e) => onChangeConfig({ ...config, apiKey: e.target.value })}
              />
              <span className="text-dim" style={{ fontSize: '11px', marginTop: '4px', display: 'block' }}>
                Stored locally in your desktop app storage. Never transmitted elsewhere.
              </span>
            </div>
          )}

          {config.provider === 'ollama' && (
            <div className="form-group">
              <label className="form-label">
                <Server size={13} style={{ display: 'inline', marginRight: '4px' }} />
                Ollama Endpoint URL
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="http://localhost:11434"
                value={config.endpointUrl || 'http://localhost:11434'}
                onChange={(e) => onChangeConfig({ ...config, endpointUrl: e.target.value })}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              <Bot size={13} style={{ display: 'inline', marginRight: '4px' }} />
              Model Name (Optional)
            </label>
            <input
              type="text"
              className="form-input"
              placeholder={
                config.provider === 'gemini'
                  ? 'gemini-2.5-flash (default)'
                  : config.provider === 'openai'
                  ? 'gpt-4o-mini (default)'
                  : config.provider === 'ollama'
                  ? 'llama3 / deepseek-coder'
                  : 'Rule Engine'
              }
              value={config.model}
              onChange={(e) => onChangeConfig({ ...config, model: e.target.value })}
            />
          </div>

          <div className="settings-privacy-note glass-panel">
            <strong>🔒 Enterprise Privacy:</strong>
            <p className="text-muted" style={{ fontSize: '12px', marginTop: '3px' }}>
              Execution plans are processed entirely on your local machine. If you choose "Offline Rule Engine" or "Local Ollama", zero data leaves your device.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose} style={{ marginLeft: 'auto' }}>
            <Save size={14} />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
