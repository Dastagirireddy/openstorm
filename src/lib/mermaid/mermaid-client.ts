/**
 * Mermaid Client - Lazy import + SVG caching
 *
 * Lazily imports mermaid (~1.5MB) and renders diagrams with idle scheduling.
 * SVG cache by content hash avoids re-rendering identical diagrams.
 */

// Simple string hash for caching (djb2)
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

// SVG cache: content hash -> rendered SVG
const svgCache = new Map<string, string>();
const MAX_CACHE_SIZE = 200;

// Mermaid instance (lazy loaded)
let mermaidModule: typeof import('mermaid') | null = null;
let mermaidReady: Promise<typeof import('mermaid')> | null = null;

async function getMermaid() {
  if (mermaidModule) return mermaidModule;
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then(async (mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
      });
      mermaidModule = mod;
      return mod;
    });
  }
  return mermaidReady;
}

// Render queue for concurrency control
let activeRenders = 0;
const MAX_CONCURRENT = 1;
const pendingQueue: Array<() => void> = [];

function scheduleRender<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = async () => {
      activeRenders++;
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        activeRenders--;
        if (pendingQueue.length > 0 && activeRenders < MAX_CONCURRENT) {
          pendingQueue.shift()!();
        }
      }
    };

    if (activeRenders < MAX_CONCURRENT) {
      run();
    } else {
      pendingQueue.push(run);
    }
  });
}

/**
 * Render a mermaid diagram.
 * Returns cached SVG if the same code was rendered before.
 * Uses idle scheduling to avoid blocking the main thread.
 */
export async function renderMermaid(code: string): Promise<string> {
  const hash = hashString(code);

  // Check cache first
  const cached = svgCache.get(hash);
  if (cached !== undefined) return cached;

  // Try rendering with original code
  let svg = await scheduleRender(() => tryRenderCode(code));

  // If failed, try auto-fixing common LLM issues
  if (svg === null) {
    const fixed = fixMermaidSyntax(code);
    if (fixed !== code) {
      svg = await scheduleRender(() => tryRenderCode(fixed));
    }
  }

  // If still null, return empty (caller handles error display)
  if (svg === null) return '';

  // Cache successful render
  if (svgCache.size >= MAX_CACHE_SIZE) {
    const firstKey = svgCache.keys().next().value;
    if (firstKey) svgCache.delete(firstKey);
  }
  svgCache.set(hash, svg);

  return svg;
}

async function tryRenderCode(code: string): Promise<string | null> {
  try {
    const mermaid = await getMermaid();
    const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const { svg } = await mermaid.default.render(id, code);
    return svg;
  } catch {
    return null;
  }
}

function fixMermaidSyntax(code: string): string {
  let fixed = code;

  // Fix: escape pipe characters inside node labels
  fixed = fixed.replace(/\[([^\[\]]*::[^\[\]]*)\]/g, (_, content) => {
    return `["${content.replace(/"/g, "'")}"]`;
  });

  // Fix: escape special chars in node labels
  fixed = fixed.replace(/\[([^\[\]]*[()[\]<>]{1,}[^\[\]]*)\]/g, (_, content) => {
    if (!content.startsWith('"')) {
      return `["${content.replace(/"/g, "'")}"]`;
    }
    return `[${content}]`;
  });

  // Fix: ensure graph/direction declaration exists
  if (!fixed.match(/^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|gantt|pie|gitGraph)/m)) {
    fixed = `flowchart TD\n${fixed}`;
  }

  return fixed;
}

/**
 * Schedule a mermaid render to run during browser idle time.
 * Returns null if no idle time available (caller should retry).
 */
export function renderMermaidIdle(code: string): Promise<string> {
  return new Promise((resolve) => {
    const hash = hashString(code);
    const cached = svgCache.get(hash);
    if (cached !== undefined) {
      resolve(cached);
      return;
    }

    const doRender = () => renderMermaid(code).then(resolve);

    if ('requestIdleCallback' in globalThis) {
      (globalThis as any).requestIdleCallback(doRender, { timeout: 5000 });
    } else {
      // Fallback: setTimeout yields to the event loop
      setTimeout(doRender, 0);
    }
  });
}

/**
 * Get cache stats for debugging
 */
export function getMermaidCacheStats() {
  return { size: svgCache.size, maxSize: MAX_CACHE_SIZE };
}
