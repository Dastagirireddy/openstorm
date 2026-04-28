import { customElement, property } from 'lit/decorators.js';
import { LitElement, html, CSSResultGroup, css } from 'lit';
import { getFileIconName } from '../../lib/icons/file-icon-mapper.js';
import 'iconify-icon';

@customElement('file-icon')
export class FileIcon extends LitElement {
  static styles: CSSResultGroup = css`
    :host {
      display: inline-block;
      line-height: 0;
    }
    iconify-icon {
      display: block;
    }
  `;

  @property({ type: String }) path = '';
  @property({ type: Number }) size = 16;
  @property({ type: Boolean }) isExecutable = false;

  render() {
    const iconName = getFileIconName(this.path, this.isExecutable);
    const size = String(this.size);

    // Check if iconName already includes a prefix (e.g., 'tabler:toml')
    if (iconName.includes(':')) {
      return html`
        <iconify-icon
          icon="${iconName}"
          width="${size}"
          height="${size}"
        ></iconify-icon>
      `;
    }

    // Use vscode-icons for specific file types
    let iconPrefix = 'devicon';
    let icon = iconName;

    if (iconName === 'yaml') {
      iconPrefix = 'vscode-icons';
      icon = 'file-type-light-yaml-official';
    } else if (iconName === 'json') {
      iconPrefix = 'vscode-icons';
      icon = 'file-type-light-json';
    }

    return html`
      <iconify-icon
        icon="${iconPrefix}:${icon}"
        width="${size}"
        height="${size}"
      ></iconify-icon>
    `;
  }
}
