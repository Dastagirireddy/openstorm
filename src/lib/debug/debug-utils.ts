/**
 * Shared utilities for debug panel components
 */

export function getValueClass(value: string, type?: string): string {
  if (value === 'null' || value === 'undefined') return 'text-gray-500 italic';
  if (type === 'string' || (value.startsWith('"') && value.endsWith('"'))) return 'text-green-700';
  if (type === 'number' || (!isNaN(Number(value)) && value.trim() !== '')) return 'text-blue-600';
  if (type === 'boolean' || value === 'true' || value === 'false') return 'text-indigo-700';
  return 'text-amber-800';
}

export function getFileName(path?: string): string {
  if (!path) return 'unknown';
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied!');
  } catch (error) {
    console.error('Failed to copy:', error);
  }
}

export function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-5 right-5 px-3 py-2 text-xs rounded shadow-lg z-50';
  toast.style.backgroundColor = 'var(--app-toast-background, #3c3c3c)';
  toast.style.color = '#ffffff';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}
