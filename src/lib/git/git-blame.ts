/**
 * Git Blame Service
 *
 * Parses git blame --porcelain output to provide line-by-line annotation data.
 */

import { invoke } from '@tauri-apps/api/core';

export interface BlameLine {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  authorTime: number;
  subject: string;
  lineContent: string;
  lineNumber: number;
  originalLineNumber: number;
}

export interface BlameData {
  filePath: string;
  lines: BlameLine[];
}

/**
 * Get git blame for a file
 */
export async function getBlame(projectPath: string, filePath: string): Promise<BlameData> {
  console.log('[git-blame] Invoking git_blame command with:', { projectPath, filePath });

  const blameOutput = await invoke<string>('git_blame', {
    path: projectPath,
    file_path: filePath,
  });

  console.log('[git-blame] Raw output received, length:', blameOutput.length);
  console.log('[git-blame] First 300 chars:', blameOutput.substring(0, 300));

  const parsed = parseBlameOutput(blameOutput, filePath);
  console.log('[git-blame] Parsed', parsed.lines.length, 'lines');

  if (parsed.lines.length > 0) {
    console.log('[git-blame] First parsed line:', JSON.stringify(parsed.lines[0]));
  } else {
    console.warn('[git-blame] No lines parsed from output!');
  }

  return parsed;
}

/**
 * Parse git blame --porcelain output
 *
 * Format:
 * <commit-hash> <line-number-in-result> <original-line-number>
 * author <name>
 * author-mail <email>
 * author-time <timestamp>
 * author-tz <timezone>
 * committer <name>
 * ...
 * summary <subject>
 * <filename>
 * <TAB><line-content>
 */
function parseBlameOutput(output: string, filePath: string): BlameData {
  const lines: BlameLine[] = [];
  const outputLines = output.split('\n');

  let i = 0;
  let resultLineNumber = 1;

  while (i < outputLines.length) {
    const line = outputLines[i];

    // Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Check for new commit block: "<hash> <result-line> <original-line>"
    const headerMatch = line.match(/^([0-9a-f]{40}) (\d+) (\d+)/);

    if (headerMatch) {
      const hash = headerMatch[1];
      resultLineNumber = parseInt(headerMatch[2], 10);
      const originalLineNumber = parseInt(headerMatch[3], 10);

      const blameLine: Partial<BlameLine> = {
        hash,
        shortHash: hash.substring(0, 7),
        lineNumber: resultLineNumber,
        originalLineNumber,
      };

      i++;

      // Parse metadata lines until we hit the content line
      while (i < outputLines.length) {
        const metaLine = outputLines[i];

        // Author line
        const authorMatch = metaLine.match(/^author (.+)$/);
        if (authorMatch) {
          blameLine.author = authorMatch[1];
          i++;
          continue;
        }

        // Author email
        const emailMatch = metaLine.match(/^author-mail <(.+)>$/);
        if (emailMatch) {
          blameLine.authorEmail = emailMatch[1];
          i++;
          continue;
        }

        // Author time
        const timeMatch = metaLine.match(/^author-time (\d+)$/);
        if (timeMatch) {
          blameLine.authorTime = parseInt(timeMatch[1], 10);
          i++;
          continue;
        }

        // Summary (commit subject)
        const summaryMatch = metaLine.match(/^summary (.+)$/);
        if (summaryMatch) {
          blameLine.subject = summaryMatch[1];
          i++;
          continue;
        }

        // Filename (usually last metadata line)
        const filenameMatch = metaLine.match(/^filename (.+)$/);
        if (filenameMatch) {
          i++;
          break;
        }

        // If we hit a tab-prefixed line, that's the content
        if (metaLine.startsWith('\t')) {
          blameLine.lineContent = metaLine.substring(1);
          break;
        }

        // Skip unknown metadata lines
        i++;
      }

      // If we didn't get content yet, try to get it from next line
      if (!blameLine.lineContent && i < outputLines.length) {
        const nextLine = outputLines[i];
        if (nextLine.startsWith('\t')) {
          blameLine.lineContent = nextLine.substring(1);
          i++;
        }
      }

      lines.push(blameLine as BlameLine);
    } else {
      i++;
    }
  }

  return { filePath, lines };
}

/**
 * Format relative time from timestamp
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  const minute = 60;
  const hour = minute * 60;
  const day = hour * 24;
  const week = day * 7;
  const month = day * 30;
  const year = day * 365;

  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < week) return `${Math.floor(diff / day)}d ago`;
  if (diff < month) return `${Math.floor(diff / week)}w ago`;
  if (diff < year) return `${Math.floor(diff / month)}mo ago`;
  return `${Math.floor(diff / year)}y ago`;
}

/**
 * Get author initials from name
 */
export function getAuthorInitials(author: string): string {
  const parts = author.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return author.slice(0, 2).toUpperCase();
}

/**
 * Get consistent color for author based on email
 */
export function getAuthorColor(email: string): string {
  const colors = [
    '#d8a7ab', // Cotton Rose
    '#e5957f', // Sweet Salmon
    '#88a89d', // Muted Teal
    '#4a536b', // Charcoal Blue
    '#6b8e9f', // Dusty Azure
    '#b8a78e', // Warm Taupe
    '#9a8fb8', // Soft Lavender
    '#d4a76e', // Golden Sand
    '#7a9b8e', // Sage Green
    '#a78fb8', // Muted Violet
    '#e0b89a', // Peach Cream
    '#6b7a8e', // Slate Blue
  ];

  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash << 5) - hash + email.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}
