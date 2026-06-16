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
        ? html`<span class="hover:opacity-80 cursor-pointer transition-colors" data-path="${segment.path}" style="color: var(--app-foreground);">${segment.label}</span>`
        : html`<span class="${isLast ? 'font-medium' : ''}" style="color: var(--app-foreground);">${segment.label}</span>`}
      ${!isLast ? html`<span style="color: var(--app-disabled-foreground, #a0a0a0);">/</span>` : ''}
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
        class="flex items-center gap-1 h-[22px] px-4 text-[11px]"
        style="background: var(--app-bg, #ffffff); border-bottom: 1px solid var(--app-border, #e0e0e0); color: var(--app-secondary-foreground, #5a5a5a);">
        ${segments.map((segment, index) => this.renderSegment(segment, index, index === segments.length - 1))}
        ${fileName ? html`<span class="font-medium" style="color: var(--app-foreground);">${fileName}</span>` : ''}
        ${this.saveStatus === 'unsaved' ? html`<span class="ml-1" style="color: var(--app-stopped-state, #f57c00);">●</span>` : ''}
      </div>
    `;
  }
}
