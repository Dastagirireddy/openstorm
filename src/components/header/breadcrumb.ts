import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';

export interface BreadcrumbSegment {
  label: string;
  path?: string;
  clickable?: boolean;
}

@customElement('app-breadcrumb')
export class Breadcrumb extends TailwindElement() {
  @property({ type: Array }) segments: BreadcrumbSegment[] = [];
  @property() activeFile = '';
  @property() saveStatus: 'saved' | 'unsaved' = 'saved';

  private renderSegment(segment: BreadcrumbSegment, index: number, isLast: boolean): ReturnType<typeof html> {
    return html`
      ${segment.clickable && segment.path
        ? html`<span class="hover:text-[#1a1a1a] cursor-pointer transition-colors" data-path="${segment.path}">${segment.label}</span>`
        : html`<span class="${isLast ? 'text-[#1a1a1a] font-medium' : ''}">${segment.label}</span>`}
      ${!isLast ? html`<span class="text-[#a0a0a0]">/</span>` : ''}
    `;
  }

  render() {
    if (!this.activeFile && this.segments.length === 0) return html``;

    const fileName = this.activeFile.split('/').pop() || '';
    const defaultSegments: BreadcrumbSegment[] = [
      { label: 'src', path: 'src', clickable: true },
    ];

    const segments = this.segments.length > 0 ? this.segments : defaultSegments;

    return html`
      <div
        class="flex items-center gap-1 h-[22px] px-4 bg-[#ffffff] border-b border-[#e0e0e0] text-[11px] text-[#5a5a5a]">
        ${segments.map((segment, index) => this.renderSegment(segment, index, index === segments.length - 1))}
        ${fileName ? html`<span class="text-[#1a1a1a] font-medium">${fileName}</span>` : ''}
        ${this.saveStatus === 'unsaved' ? html`<span class="text-[#f57c00] ml-1">●</span>` : ''}
      </div>
    `;
  }
}
