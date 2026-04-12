import { customElement, property } from 'lit/decorators.js';
import { LitElement, html, CSSResultGroup, css } from 'lit';
import { getFileIconName } from '../lib/file-icon-mapper.js';
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

  render() {
    const iconName = getFileIconName(this.path);
    const size = String(this.size);

    return html`
      <iconify-icon
        icon="devicon:${iconName}"
        width="${size}"
        height="${size}"
      ></iconify-icon>
    `;
  }
}
