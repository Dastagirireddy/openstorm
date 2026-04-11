import { html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';

export type ResizeDirection = 'horizontal' | 'vertical';

const styles = css`
  .resizable-handle {
    position: relative;
    z-index: 100;
  }

  .resizable-handle.horizontal {
    width: 5px;
    margin-left: 0;
    margin-right: 0;
    cursor: col-resize;
    flex-shrink: 0;
  }

  .resizable-handle.vertical {
    height: 5px;
    margin-top: 0;
    margin-bottom: 0;
    cursor: row-resize;
    flex-shrink: 0;
  }

  .resizable-handle .handle-bar {
    position: absolute;
    background: transparent;
    transition: background 0.15s ease;
  }

  .resizable-handle.horizontal .handle-bar {
    left: 2px;
    top: 50%;
    transform: translateY(-50%);
    width: 1px;
    height: 32px;
    background: #d0d7de;
    border-radius: 1px;
  }

  .resizable-handle.vertical .handle-bar {
    top: 2px;
    left: 50%;
    transform: translateX(-50%);
    height: 1px;
    width: 32px;
    background: #d0d7de;
    border-radius: 1px;
  }

  .resizable-handle:hover .handle-bar,
  .resizable-handle.active .handle-bar {
    background: #0969da;
  }

  .resizable-handle.horizontal:hover,
  .resizable-handle.horizontal.active {
    background: rgba(9, 105, 218, 0.08);
  }

  .resizable-handle.vertical:hover,
  .resizable-handle.vertical.active {
    background: rgba(9, 105, 218, 0.08);
  }
`;

@customElement('resizable-handle')
export class ResizableHandle extends TailwindElement(styles) {
  @property({ type: String }) direction: ResizeDirection = 'horizontal';
  @property({ type: Boolean }) active = false;

  connectedCallback(): void {
    super.connectedCallback();
    // Set pointer events to ensure proper hit testing
    this.style.pointerEvents = 'auto';
  }

  private handleMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    // Dispatch resize-start event
    this.dispatchEvent(new CustomEvent('resize-start', {
      detail: { direction: this.direction },
      bubbles: true,
      composed: true,
    }));
  };

  render() {
    const isHorizontal = this.direction === 'horizontal';

    return html`
      <div
        class="resizable-handle ${this.active ? 'active' : ''} ${isHorizontal ? 'horizontal' : 'vertical'}"
        @mousedown=${this.handleMouseDown}
      >
        <div class="handle-bar"></div>
      </div>
    `;
  }
}
