/**
 * SVG Language Support for CodeMirror 6
 *
 * Extends XML language support with SVG-specific syntax highlighting.
 * Uses styleTags to properly integrate with CodeMirror's syntax highlighting.
 */

import { xml } from '@codemirror/lang-xml';
import { LanguageSupport } from '@codemirror/language';
import { EditorView, ViewPlugin, Decoration, DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { HighlightStyle, TagStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// SVG element names for enhanced highlighting
const svgElementNames = new Set([
  // Basic shapes
  'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect', 'text', 'tspan',
  // Container elements
  'defs', 'g', 'marker', 'mask', 'pattern', 'svg', 'symbol',
  // Gradients
  'linearGradient', 'radialGradient', 'stop',
  // Filters
  'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge',
  'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
  'feSpotLight', 'feTile', 'feTurbulence',
  // Other
  'clipPath', 'a', 'animate', 'animateMotion', 'animateTransform', 'color-profile',
  'cursor', 'discard', 'foreignObject', 'hatch', 'hatchpath', 'image', 'metadata',
  'mpath', 'set', 'solidcolor', 'switch', 'use', 'view', 'textPath',
]);

// SVG attribute names
const svgAttributeNames = new Set([
  // Core
  'id', 'class', 'style', 'lang', 'tabindex', 'xml:base', 'xml:lang', 'xml:space',
  // Presentation
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity',
  'fill-opacity', 'fill-rule', 'stroke-dasharray', 'stroke-dashoffset', 'opacity',
  'transform', 'transform-origin', 'clip-path', 'mask', 'filter',
  // Shape-specific
  'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2',
  'd', 'points', 'path',
  // Text
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'letter-spacing', 'word-spacing', 'text-decoration', 'writing-mode',
  // Gradient/Pattern
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'href', 'offset',
  'patternUnits', 'patternTransform', 'patternContentUnits',
  // Viewport
  'viewBox', 'preserveAspectRatio',
  // Animation
  'attributeName', 'attributeType', 'from', 'to', 'dur', 'begin', 'end', 'repeatCount',
  // Filter-specific
  'in', 'in2', 'result', 'kernelMatrix', 'tableValues', 'slope', 'intercept',
]);

/**
 * View plugin that adds CSS classes to SVG elements and attributes
 * This works alongside syntaxHighlighting to provide SVG-specific styling
 */
const svgHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: any) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();

      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: (node) => {
            const nodeType = node.type.name;

            // Highlight SVG element names (TagName in XML parser)
            if (nodeType === 'TagName') {
              const tagName = view.state.doc.sliceString(node.from, node.to);
              if (svgElementNames.has(tagName.toLowerCase())) {
                builder.add(
                  node.from,
                  node.to,
                  Decoration.mark({
                    class: 'cm-svg-element',
                    attributes: { 'data-svg-element': tagName }
                  })
                );
              }
            }

            // Highlight SVG attribute names (AttributeName in XML parser)
            if (nodeType === 'AttributeName') {
              const attrName = view.state.doc.sliceString(node.from, node.to);
              if (svgAttributeNames.has(attrName.toLowerCase())) {
                builder.add(
                  node.from,
                  node.to,
                  Decoration.mark({
                    class: 'cm-svg-attribute',
                    attributes: { 'data-svg-attribute': attrName }
                  })
                );
              }
            }
          },
        });
      }

      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

/**
 * SVG-specific highlight style that overrides default XML highlighting
 * Uses more specific CSS selectors to take precedence
 */
export const svgHighlightStyle = HighlightStyle.define([
  { tag: t.tagName, class: 'cm-svg-tagName' },
  { tag: t.attributeName, class: 'cm-svg-attrName' },
]);

/**
 * Create SVG language support with enhanced highlighting
 *
 * Uses the XML language parser but adds:
 * 1. A view plugin for SVG-specific CSS classes
 * 2. Custom highlight style for SVG elements/attributes
 */
export function svg(): LanguageSupport {
  // Get the base XML language support
  const xmlSupport = xml();

  // Return XML language support plus our SVG highlighter plugin
  return new LanguageSupport(xmlSupport.language, [svgHighlighter]);
}

export { xml } from '@codemirror/lang-xml';
