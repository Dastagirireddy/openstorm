import { invoke } from '@tauri-apps/api/core';

export interface FileMention {
  path: string;
  startLine?: number;
  endLine?: number;
}

export function parseFileMentions(text: string): FileMention[] {
  const mentions: FileMention[] = [];
  const regex = /@([\w\-\.\/]+)(?:#(\d+)(?:-(\d+))?)?/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const path = match[1];
    const startLine = match[2] ? parseInt(match[2]) : undefined;
    const endLine = match[3] ? parseInt(match[3]) : startLine;
    
    if (!path.includes('.') || path.endsWith('.com') || path.endsWith('.org')) continue;
    
    mentions.push({ path, startLine, endLine });
  }
  
  return mentions;
}

export interface Attachment {
  path: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

export async function readMentionedFiles(
  mentions: FileMention[],
  projectPath: string
): Promise<Attachment[]> {
  const attachments: Attachment[] = [];
  
  for (const mention of mentions) {
    try {
      const fullContent = await invoke<string>('ai_read_file', {
        projectPath,
        path: mention.path,
        maxLines: 500,
      });
      
      let content = fullContent;
      if (mention.startLine !== undefined) {
        const lines = fullContent.split('\n');
        const start = Math.max(0, mention.startLine - 1);
        const end = mention.endLine !== undefined ? Math.min(lines.length, mention.endLine) : lines.length;
        content = lines.slice(start, end).join('\n');
      }
      
      attachments.push({
        path: mention.path,
        content,
        startLine: mention.startLine,
        endLine: mention.endLine,
      });
    } catch (e) {
      console.error(`Failed to read file: ${mention.path}`, e);
    }
  }
  
  return attachments;
}

export function buildContextMessage(
  text: string,
  attachments: Attachment[]
): string {
  if (attachments.length === 0) return text;
  
  const attachmentBlocks = attachments.map(a => {
    const range = a.startLine !== undefined ? ` (lines ${a.startLine}-${a.endLine || 'end'})` : '';
    return `[File: ${a.path}${range}]\n${a.content}\n[/File]`;
  });
  
  return text + '\n\n' + attachmentBlocks.join('\n\n');
}

export async function searchFiles(
  query: string,
  projectPath: string
): Promise<string[]> {
  try {
    const result = await invoke<string>('ai_search_files', {
      projectPath,
      query: query || '',
      maxResults: 10,
    });
    
    return result
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('No files'));
  } catch (error) {
    console.error('Failed to search files:', error);
    return [];
  }
}
