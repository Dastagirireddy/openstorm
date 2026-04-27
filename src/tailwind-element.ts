import { LitElement, unsafeCSS, CSSResultGroup } from 'lit';
import tailwindStyles from './styles.css?inline';

const tailwindSheet = unsafeCSS(tailwindStyles);

export const TailwindElement = (componentStyles: CSSResultGroup | undefined = undefined) =>
  class extends LitElement {
    static styles = componentStyles ? [tailwindSheet, componentStyles] : [tailwindSheet];
  };

// Helper to get base Tailwind styles for extension
export const getTailwindStyles = (): CSSResultGroup => tailwindSheet;
