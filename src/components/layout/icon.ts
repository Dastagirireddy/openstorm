import { customElement, property } from 'lit/decorators.js';
import { LitElement, svg, css, html } from 'lit';

// Import icons individually (tree-shakeable)
import { Play, Bug, Square, GitBranch, ChevronDown, ChevronRight, ChevronUp, RotateCcw, RotateCw, Clock, ListFilter, ArrowDownToLine, ArrowUpFromLine, Cloud, Folder, FolderOpen, Check, Gauge, CircleDot, File, FileJson, FileCode, FileText, FilePlus, FolderPlus, Locate, ChevronsDownUp, ChevronsUpDown, Presentation, ExternalLink, FolderInput, Package, Box, Layers, Database, Globe, Server, Terminal, X, Plus, Sun, Moon, Monitor, GitPullRequest, FolderSearch, GitCommitVertical, Search, FolderCheck, Settings, PlayCircle, GitMerge, PanelLeft, Copy, SlidersHorizontal, Palette, Keyboard, Info, Code, LayoutGrid, Zap, Sparkles, Key, Command, Hash, Type, Save, HardDrive, Cpu, Braces, TextCursorInput, WandSparkles, AppWindow, Eye, EyeOff, Loader, LoaderCircle } from 'lucide';

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
  'sliders-horizontal': SlidersHorizontal,
  'palette': Palette,
  'keyboard': Keyboard,
  'info': Info,
  'code': Code,
  'layout-grid': LayoutGrid,
  'zap': Zap,
  'sparkles': Sparkles,
  'key': Key,
  'command': Command,
  'hash': Hash,
  'type': Type,
  'save': Save,
  'hard-drive': HardDrive,
  'cpu': Cpu,
  'braces': Braces,
  'text-cursor-input': TextCursorInput,
  'wand-sparkles': WandSparkles,
  'app-window': AppWindow,
  'chevron-up': ChevronUp,
  'eye': Eye,
  'eye-off': EyeOff,
  'loader': Loader,
  'loader-circle': LoaderCircle,
};

// OpenStorm brand logo - blue rhombus on dark background
function OpenStormLogo(): ReturnType<typeof svg> {
  return svg`
    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Background rounded rectangle -->
      <rect x="20" y="20" width="472" height="472" rx="100" fill="#23232d"/>
      <!-- AI texture lines -->
      <g opacity="0.06" stroke="#3574f0" stroke-width="1" fill="none">
        <line x1="50" y1="80" x2="462" y2="80"/>
        <line x1="50" y1="140" x2="462" y2="140"/>
        <line x1="50" y1="200" x2="462" y2="200"/>
        <line x1="50" y1="260" x2="462" y2="260"/>
        <line x1="50" y1="320" x2="462" y2="320"/>
        <line x1="50" y1="380" x2="462" y2="380"/>
        <line x1="50" y1="440" x2="462" y2="440"/>
        <line x1="80" y1="50" x2="80" y2="462"/>
        <line x1="140" y1="50" x2="140" y2="462"/>
        <line x1="200" y1="50" x2="200" y2="462"/>
        <line x1="260" y1="50" x2="260" y2="462"/>
        <line x1="320" y1="50" x2="320" y2="462"/>
        <line x1="380" y1="50" x2="380" y2="462"/>
        <line x1="440" y1="50" x2="440" y2="462"/>
      </g>
      <!-- Blue rounded rhombus -->
      <g transform="rotate(45, 256, 256)">
          <rect x="96" y="96" width="320" height="320" rx="45" fill="#3574f0"/>
      </g>
      <!-- "OS" text -->
      <text x="256" y="275" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="160" fill="white" text-anchor="middle" dominant-baseline="middle">OS</text>
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
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style="display: block;"
      >
        <!-- Background rounded rectangle (greyish black) -->
        <rect x="20" y="20" width="472" height="472" rx="100" fill="#23232d"/>
        <!-- AI texture lines -->
        <g opacity="0.06" stroke="#3574f0" stroke-width="1" fill="none">
          <line x1="50" y1="80" x2="462" y2="80"/>
          <line x1="50" y1="140" x2="462" y2="140"/>
          <line x1="50" y1="200" x2="462" y2="200"/>
          <line x1="50" y1="260" x2="462" y2="260"/>
          <line x1="50" y1="320" x2="462" y2="320"/>
          <line x1="50" y1="380" x2="462" y2="380"/>
          <line x1="50" y1="440" x2="462" y2="440"/>
          <line x1="80" y1="50" x2="80" y2="462"/>
          <line x1="140" y1="50" x2="140" y2="462"/>
          <line x1="200" y1="50" x2="200" y2="462"/>
          <line x1="260" y1="50" x2="260" y2="462"/>
          <line x1="320" y1="50" x2="320" y2="462"/>
          <line x1="380" y1="50" x2="380" y2="462"/>
          <line x1="440" y1="50" x2="440" y2="462"/>
        </g>
        <!-- Blue rounded rhombus -->
        <g transform="rotate(45, 256, 256)">
        <rect x="96" y="96" width="320" height="320" rx="45" fill="#3574f0"/>
        </g>
        <!-- "OS" text -->
        <text x="256" y="275" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="160" fill="white" text-anchor="middle" dominant-baseline="middle">OS</text>
      </svg>
    `;
  }
}
