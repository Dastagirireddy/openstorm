import { css } from 'lit';

export const timelineStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: #141618;
  }

  .timeline-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .timeline-scroll::-webkit-scrollbar { width: 6px; }
  .timeline-scroll::-webkit-scrollbar-track { background: transparent; }
  .timeline-scroll::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }

  /* ── Header text ── */
  .header-text {
    font-size: 14px;
    color: #abb2bf;
    line-height: 1.6;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1e2128;
  }

  /* ── Response text ── */
  .response-text {
    font-size: 14px;
    color: #abb2bf;
    line-height: 1.7;
    margin-top: 12px;
    white-space: pre-wrap;
  }

  /* ── Step ── */
  .step {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0;
    border-left: 2px solid #2b2d31;
    margin-left: 12px;
    padding-left: 24px;
    position: relative;
  }

  .step::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 16px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #1e2128;
    border: 2px solid #3e4451;
    z-index: 1;
  }

  .step.completed::before {
    background: #98c379;
    border-color: #98c379;
    box-shadow: 0 0 8px rgba(152, 195, 121, 0.4);
  }

  .step.active::before {
    background: #d19a66;
    border-color: #d19a66;
    box-shadow: 0 0 8px rgba(209, 154, 102, 0.4);
    animation: pulse 1.5s infinite;
  }

  .step.failed::before {
    background: #e06c75;
    border-color: #e06c75;
  }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 8px rgba(209, 154, 102, 0.4); }
    50% { box-shadow: 0 0 12px rgba(209, 154, 102, 0.6); }
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .step-icon {
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }

  .step-icon.pending { color: #5c6370; }
  .step-icon.active { color: #d19a66; }
  .step-icon.completed { 
    color: #98c379; 
    background: rgba(152, 195, 121, 0.15);
  }
  .step-icon.failed { color: #e06c75; }

  .step-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .step-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .step-name {
    font-size: 14px;
    font-weight: 700;
    color: #e0e0e0;
    line-height: 1.4;
  }

  .step.active .step-name { color: #e5c07b; }
  .step.completed .step-name { color: #98c379; }
  .step.failed .step-name { color: #e06c75; }

  .step-badge {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 11px;
    background: #1a2322;
    color: #4ade80;
    border: 1px solid #1a3a2a;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .step-badge.running {
    background: #1a2332;
    color: #60a5fa;
    border-color: #1a2a3a;
  }

  .step-tag {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;
  }

  .step-tag.new {
    background: #1a2332;
    color: #60a5fa;
  }

  .step-tag.formatted {
    background: #1a2322;
    color: #4ade80;
  }

  .step-description {
    font-size: 12px;
    color: #828997;
    line-height: 1.5;
  }

  .step-subtitle {
    font-size: 13px;
    color: #abb2bf;
    line-height: 1.4;
  }

  .step-bullets {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
    padding-left: 4px;
  }

  .step-bullet {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #abb2bf;
    line-height: 1.5;
  }

  .step-bullet::before {
    content: '\\2022';
    color: #5c6370;
    font-weight: bold;
  }

  .step-waiting {
    font-size: 12px;
    color: #d19a66;
    font-style: italic;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .step-verified {
    font-size: 12px;
    color: #98c379;
    font-weight: 500;
  }

  /* ── Telemetry box ── */
  .telemetry-box {
    background: #0d0f12;
    border: 1px solid #1e2128;
    border-radius: 8px;
    padding: 12px 16px;
    max-width: 520px;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 12px;
    margin-top: 6px;
  }

  .telemetry-row {
    display: flex;
    align-items: baseline;
    line-height: 1.8;
  }

  .telemetry-key {
    color: #5c6370;
    min-width: 80px;
    flex-shrink: 0;
  }

  .telemetry-value {
    color: #abb2bf;
    font-weight: 500;
  }

  .telemetry-value.success { color: #98c379; }
  .telemetry-value.error { color: #e06c75; }
  .telemetry-value.running { 
    color: #98c379;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .telemetry-value.link {
    color: #61afef;
    text-decoration: none;
    cursor: pointer;
  }
  .telemetry-value.link:hover { text-decoration: underline; }

  /* ── Permission card ── */
  .permission-card {
    background: #1a1215;
    border: 1px solid #3d2025;
    border-radius: 10px;
    padding: 20px;
    margin: 12px 0;
    max-width: 680px;
  }

  .permission-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #3d2025;
  }

  .permission-icon {
    font-size: 20px;
  }

  .permission-title {
    color: #e06c75;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .permission-field {
    margin-bottom: 12px;
  }

  .permission-label {
    font-size: 13px;
    color: #abb2bf;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .permission-value {
    font-size: 13px;
    color: #abb2bf;
    line-height: 1.6;
  }

  .permission-value code {
    background: #212327;
    padding: 2px 6px;
    border-radius: 4px;
    color: #e06c75;
    font-size: 12px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .permission-command {
    background: #0d0f12;
    border: 1px solid #1e2128;
    padding: 12px 16px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: #abb2bf;
    border-radius: 8px;
    margin: 12px 0 18px 0;
    overflow-x: auto;
    line-height: 1.6;
  }

  .permission-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .perm-btn {
    background: #1e2128;
    border: 1px solid #2d3139;
    color: #abb2bf;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .perm-btn:hover { filter: brightness(1.2); }

  .perm-btn.deny:hover {
    background: #2c1418;
    border-color: #e06c75;
    color: #e06c75;
  }

  .perm-btn.grant {
    background: #1a2332;
    color: #60a5fa;
    border-color: #1a2a4a;
  }
  .perm-btn.grant:hover { 
    background: #1e2a3e;
    border-color: #60a5fa;
  }

  .perm-btn.always {
    background: #1a2322;
    color: #4ade80;
    border-color: #1a3a2a;
  }
  .perm-btn.always:hover { 
    background: #1e2e2c;
    border-color: #4ade80;
  }

  .perm-hint {
    font-size: 11px;
    color: #5c6370;
    font-family: 'SF Mono', 'Fira Code', monospace;
    margin-left: auto;
  }

  /* ── Execution summary ── */
  .summary-block {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    background: #0d0f12;
    border: 1px solid #1e2128;
    border-radius: 10px;
    margin-top: 16px;
  }

  .summary-header {
    font-size: 14px;
    font-weight: 700;
    color: #e0e0e0;
    border-bottom: 1px solid #1e2128;
    padding-bottom: 12px;
  }

  .summary-grid {
    display: flex;
    gap: 28px;
    flex-wrap: wrap;
  }

  .summary-pill {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .summary-pill .label {
    font-size: 10px;
    text-transform: uppercase;
    color: #5c6370;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .summary-pill .value {
    font-size: 13px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: #98c379;
    font-weight: 600;
  }

  /* ── Diff view ── */
  .diff-container {
    border: 1px solid #1e2128;
    background: #0a0c0f;
    border-radius: 8px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    overflow: hidden;
  }

  .diff-banner {
    background: #141618;
    padding: 8px 14px;
    color: #828997;
    font-size: 11px;
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid #1e2128;
  }

  .diff-line {
    display: flex;
    line-height: 1.6;
  }

  .diff-line-num {
    width: 40px;
    text-align: right;
    padding-right: 10px;
    color: #3e4451;
    background: #0d0f12;
    user-select: none;
    border-right: 1px solid #1e2128;
    margin-right: 10px;
    flex-shrink: 0;
  }

  .diff-line-content {
    flex: 1;
    white-space: pre;
    color: #abb2bf;
    padding-right: 14px;
  }

  .diff-line.add { background: #0f1f16; }
  .diff-line.add .diff-line-content { color: #a7f3d0; }
  .diff-line.delete { background: #1f0f12; }
  .diff-line.delete .diff-line-content { color: #f87171; }
`;
