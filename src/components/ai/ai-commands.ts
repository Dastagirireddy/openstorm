import type { ChatMessage, AISession } from '../../lib/types/ai-types.js';
import { aiState } from '../../lib/ai/ai-state.js';

export const AI_COMMANDS = [
  { name: '/clear', description: 'Clear current session', icon: 'x' },
  { name: '/model', description: 'Switch model', icon: 'sparkles' },
  { name: '/help', description: 'Show available commands', icon: 'info' },
  { name: '/context', description: 'Show context window usage', icon: 'layers' },
  { name: '/export', description: 'Export conversation', icon: 'arrow-down-to-line' },
  { name: '/reset', description: 'Reset session and start fresh', icon: 'rotate-ccw' },
];

export const ASCII_LOGO = `░██                                        
░██                                        
 ░███████  ░████████   ░███████  ░████████   ░███████  ░████████  ░███████  ░██░████ ░█████████████  
░██    ░██ ░██    ░██ ░██    ░██ ░██    ░██ ░██           ░██    ░██    ░██ ░███     ░██   ░██   ░██ 
░██    ░██ ░██    ░██ ░█████████ ░██    ░██  ░███████     ░██    ░██    ░██ ░██      ░██   ░██   ░██ 
░██    ░██ ░███   ░██ ░██        ░██    ░██        ░██    ░██    ░██    ░██ ░██      ░██   ░██   ░██ 
 ░███████  ░██░█████   ░███████  ░██    ░██  ░███████      ░████  ░███████  ░██      ░██   ░██   ░██ 
           ░██                                                                                       
           ░██`;

export const AI_TIPS = [
  'Use /model to switch between available models',
  'Drag and drop files to attach them to your message',
  'Press Ctrl+N for a new chat session',
  'Use /clear to clear the current conversation',
  'Ask about your codebase — the AI can read your files',
  'Use /export to save your conversation',
  'Press Esc to interrupt a running response',
  'Use /context to check your token usage',
];

export interface CommandContext {
  clearSession: () => void;
  createSession: () => void;
  addSystemMessage: (content: string) => void;
  activeSessionId: string | null;
  focusModelSelector: () => void;
}

export function handleCommand(
  text: string,
  ctx: CommandContext
): void {
  const cmd = text.split(/\s+/)[0].toLowerCase();

  switch (cmd) {
    case '/clear':
      ctx.clearSession();
      break;
    case '/reset':
      ctx.clearSession();
      ctx.createSession();
      break;
    case '/help':
      showHelp(ctx);
      break;
    case '/context':
      showContext(ctx);
      break;
    case '/export':
      exportConversation(ctx);
      break;
    case '/model':
      ctx.focusModelSelector();
      break;
    default:
      ctx.addSystemMessage(`Unknown command: ${cmd}. Type /help for available commands.`);
      break;
  }
}

function showHelp(ctx: CommandContext): void {
  const help = AI_COMMANDS.map(c => `**${c.name}** — ${c.description}`).join('\n');
  ctx.addSystemMessage(help);
}

function showContext(ctx: CommandContext): void {
  if (!ctx.activeSessionId) return;
  const stats = aiState.getSessionStats(ctx.activeSessionId);
  const lines = [
    `**Session:** ${ctx.activeSessionId}`,
    `**Messages:** ${stats.messageCount}`,
    `**Tokens in:** ${formatTokenCount(stats.tokens.input)}`,
    `**Tokens out:** ${formatTokenCount(stats.tokens.output)}`,
  ];
  if (stats.cost > 0) lines.push(`**Cost:** $${stats.cost.toFixed(4)}`);
  ctx.addSystemMessage(lines.join('\n'));
}

function exportConversation(ctx: CommandContext): void {
  const session = aiState.getActiveSession();
  if (!session) return;
  const lines = session.messages.map(m => {
    const role = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : m.role;
    return `**${role}:**\n${m.content}`;
  });
  const md = `# ${session.name}\n\n${lines.join('\n\n')}`;
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.name.replace(/\s+/g, '-').toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  ctx.addSystemMessage('Conversation exported.');
}

export function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
