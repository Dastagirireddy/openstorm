import { customElement, property } from 'lit/decorators.js';
import { LitElement, svg, css, html } from 'lit';

// Import icons individually (tree-shakeable)
import { Play, Bug, Square, GitBranch, ChevronDown, ChevronRight, RotateCcw, RotateCw, Clock, ListFilter, ArrowDownToLine, ArrowUpFromLine, Cloud, Folder, FolderOpen, Check, Gauge, CircleDot, File, FileJson, FileCode, FileText, FilePlus, FolderPlus, Locate, ChevronsDownUp, ChevronsUpDown, Presentation, ExternalLink, FolderInput, Package, Box, Layers, Database, Globe, Server, Terminal, X, Plus, Sun, Moon, Monitor, GitPullRequest, FolderSearch, GitCommitVertical, Search, FolderCheck, Settings, PlayCircle, GitMerge, PanelLeft, Copy } from 'lucide';

const iconMap: Record<string, any> = {
  'play': Play,
  'play-circle': PlayCircle,
  'bug': Bug,
  'square': Square,
  'git-branch': GitBranch,
  'git-pull-request': GitPullRequest,
  'git-commit-vertical': GitCommitVertical,
  'git-merge': GitMerge,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'rotate-ccw': RotateCcw,
  'rotate-cw': RotateCw,
  'clock': Clock,
  'list-filter': ListFilter,
  'arrow-down-to-line': ArrowDownToLine,
  'arrow-up-from-line': ArrowUpFromLine,
  'cloud': Cloud,
  'folder': Folder,
  'folder-open': FolderOpen,
  'folder-filled': 'custom-filled-folder',
  'folder-open-filled': 'custom-filled-folder-open',
  'folder-plus': FolderPlus,
  'folder-search': FolderSearch,
  'folder-check': FolderCheck,
  'search': Search,
  'check': Check,
  'gauge': Gauge,
  'circle-dot': CircleDot,
  'file': File,
  'file-json': FileJson,
  'file-code': FileCode,
  'file-text': FileText,
  'file-plus': FilePlus,
  'locate': Locate,
  'expand-all': ChevronsDownUp,
  'collapse-all': ChevronsUpDown,
  'presentation': Presentation,
  'external-link': ExternalLink,
  'folder-input': FolderInput,
  'package': Package,
  'box': Box,
  'layers': Layers,
  'database': Database,
  'globe': Globe,
  'server': Server,
  'terminal': Terminal,
  'x': X,
  'plus': Plus,
  'sun': Sun,
  'moon': Moon,
  'monitor': Monitor,
  'settings': Settings,
  'sidebar': PanelLeft,
  'copy': Copy,
};

// OpenStorm brand logo - modern minimalist monkey face
// Monkey = clever, problem-solver, agile, playful creativity
// Uses CSS variable for theme-aware brand color
function OpenStormLogo(): ReturnType<typeof svg> {
  return svg`
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Outer rounded square background -->
      <rect x="2" y="2" width="44" height="44" rx="10" fill="var(--brand-primary)"/>
      <!-- Monkey face (heart-shaped head) -->
      <path d="M24 36c6 0 10-5 10-10V20c0-4-4-7-10-7s-10 3-10 7v6c0 5 4 10 10 10z" stroke="white" stroke-width="2.5" fill="none"/>
      <!-- Ears (circles on sides) -->
      <circle cx="14" cy="22" r="3" stroke="white" stroke-width="2.5" fill="none"/>
      <circle cx="34" cy="22" r="3" stroke="white" stroke-width="2.5" fill="none"/>
      <!-- Eyes (two dots) -->
      <circle cx="21" cy="24" r="1.5" fill="white"/>
      <circle cx="27" cy="24" r="1.5" fill="white"/>
      <!-- Mouth (simple smile) -->
      <path d="M20 29q4 3 8 0" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/>
    </svg>
  `;
}

export type IconName = keyof typeof iconMap;

function buildSvgPaths(iconData: any[][]): any[] {
  return iconData.map((item) => {
    const [tag, attrs] = item;
    if (tag === 'path') {
      return svg`<path d="${attrs.d}"/>`;
    } else if (tag === 'circle') {
      return svg`<circle cx="${attrs.cx}" cy="${attrs.cy}" r="${attrs.r}"/>`;
    } else if (tag === 'rect') {
      const rx = attrs.rx ? svg` rx="${attrs.rx}"` : svg``;
      return svg`<rect x="${attrs.x}" y="${attrs.y}" width="${attrs.width}" height="${attrs.height}"${rx}/>`;
    } else if (tag === 'line') {
      return svg`<line x1="${attrs.x1}" y1="${attrs.y1}" x2="${attrs.x2}" y2="${attrs.y2}"/>`;
    } else if (tag === 'polyline') {
      return svg`<polyline points="${attrs.points}"/>`;
    } else if (tag === 'polygon') {
      return svg`<polygon points="${attrs.points}"/>`;
    }
    return svg``;
  }).filter(Boolean);
}

@customElement('os-icon')
export class Icon extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
      line-height: 0;
    }
    svg {
      display: block;
    }
  `;

  @property({ type: String }) name = 'circle';
  @property({ type: String }) color = 'currentColor';
  @property({ type: Number }) size = 12;
  @property({ type: Number }) strokeWidth = 2;

  render() {
    const iconData = iconMap[this.name];
    if (!iconData) {
      console.warn(`Icon "${this.name}" not found`);
      return html``;
    }

    const size = String(this.size);
    const strokeWidth = String(this.strokeWidth);

    // Handle custom filled folder icons
    if (iconData === 'custom-filled-folder') {
      return svg`
        <svg
          width=${size}
          height=${size}
          viewBox="0 0 24 24"
          fill=${this.color}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
      `;
    }

    if (iconData === 'custom-filled-folder-open') {
      return svg`
        <svg
          width=${size}
          height=${size}
          viewBox="0 0 24 24"
          fill=${this.color}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
        </svg>
      `;
    }

    const paths = buildSvgPaths(iconData);

    return svg`
      <svg
        width=${size}
        height=${size}
        viewBox="0 0 24 24"
        fill="none"
        stroke=${this.color}
        stroke-width=${strokeWidth}
        stroke-linecap="round"
        stroke-linejoin="round"
        xmlns="http://www.w3.org/2000/svg"
      >
        ${paths}
      </svg>
    `;
  }
}

@customElement('os-brand-logo')
export class OpenStormLogoIcon extends LitElement {
  @property({ type: Number }) size = 48;

  render() {
    const size = String(this.size);
    return html`
      <svg
        width=${size}
        height=${size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style="display: block;"
      >
        <!-- Outer rounded square background with theme-aware color -->
        <rect x="2" y="2" width="44" height="44" rx="10" fill="var(--brand-primary)"/>
        <!-- Monkey face (heart-shaped head) -->
        <path d="M24 36c6 0 10-5 10-10V20c0-4-4-7-10-7s-10 3-10 7v6c0 5 4 10 10 10z" stroke="white" stroke-width="2.5" fill="none"/>
        <!-- Ears (circles on sides) -->
        <circle cx="14" cy="22" r="3" stroke="white" stroke-width="2.5" fill="none"/>
        <circle cx="34" cy="22" r="3" stroke="white" stroke-width="2.5" fill="none"/>
        <!-- Eyes (two dots) -->
        <circle cx="21" cy="24" r="1.5" fill="white"/>
        <circle cx="27" cy="24" r="1.5" fill="white"/>
        <!-- Mouth (simple smile) -->
        <path d="M20 29q4 3 8 0" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/>
      </svg>
    `;
  }
}
