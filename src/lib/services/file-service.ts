/**
 * File Service - Abstraction for file system operations
 *
 * Provides a clean API for file operations that can be:
 * - Mocked for testing
 * - Extended by plugins
 * - Cached for performance
 */

import { invoke } from '@tauri-apps/api/core';
import type { FileNode } from '../file-types.js';

/**
 * File read options
 */
export interface ReadFileOptions {
  encoding?: string;
  useCache?: boolean;
}

/**
 * File write options
 */
export interface WriteFileOptions {
  encoding?: string;
  createParentDirs?: boolean;
  backup?: boolean;
}

/**
 * File info
 */
export interface FileInfo {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  createdAt: Date;
  modifiedAt: Date;
  accessedAt: Date;
  extension: string;
}

/**
 * File Service class
 */
export class FileService {
  private static instance: FileService;
  private fileCache: Map<string, { content: string; timestamp: number }> = new Map();
  private cacheEnabled: boolean = false;
  private cacheTtl: number = 5000; // 5 seconds

  protected constructor() {}

  static getInstance(): FileService {
    if (!FileService.instance) {
      FileService.instance = new FileService();
    }
    return FileService.instance;
  }

  /**
   * Enable or disable file caching
   */
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
  }

  /**
   * Set cache TTL in milliseconds
   */
  setCacheTtl(ttl: number): void {
    this.cacheTtl = ttl;
  }

  /**
   * Read file content
   */
  async readFile(path: string, options: ReadFileOptions = {}): Promise<string> {
    const { useCache = this.cacheEnabled } = options;

    // Check cache first
    if (useCache) {
      const cached = this.fileCache.get(path);
      if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
        return cached.content;
      }
    }

    // Read from disk
    const content = await invoke<string>('read_file', { path });

    // Update cache
    if (useCache) {
      this.fileCache.set(path, { content, timestamp: Date.now() });
    }

    return content;
  }

  /**
   * Write file content
   */
  async writeFile(
    path: string,
    content: string,
    options: WriteFileOptions = {}
  ): Promise<void> {
    const { createParentDirs = true, backup = false } = options;

    // Create backup if requested
    if (backup) {
      try {
        const existingContent = await this.readFile(path);
        const backupPath = `${path}.bak`;
        await invoke('write_file', { path: backupPath, content: existingContent });
      } catch {
        // File might not exist, ignore error
      }
    }

    // Write the file
    await invoke('write_file', { path, content });

    // Invalidate cache
    this.fileCache.delete(path);
  }

  /**
   * List directory contents
   */
  async listDirectory(path: string): Promise<FileNode[]> {
    return invoke<FileNode[]>('list_directory', { path });
  }

  /**
   * Create a new file
   */
  async createFile(path: string, content: string = ''): Promise<void> {
    await invoke('create_file', { path, content });
    this.fileCache.delete(path);
  }

  /**
   * Create a new directory
   */
  async createDirectory(path: string): Promise<void> {
    await invoke('create_file', { path, content: '', isDirectory: true });
  }

  /**
   * Delete a file or directory
   */
  async delete(path: string, recursive: boolean = false): Promise<void> {
    await invoke('delete_file', { path, recursive });
    this.fileCache.delete(path);
  }

  /**
   * Rename/move a file or directory
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    await invoke('rename_file', { oldPath, newPath });

    // Update cache key
    const cached = this.fileCache.get(oldPath);
    if (cached) {
      this.fileCache.delete(oldPath);
      this.fileCache.set(newPath, cached);
    }
  }

  /**
   * Get file info
   */
  async getFileInfo(path: string): Promise<FileInfo> {
    const stat = await invoke<any>('get_file_info', { path });
    return {
      path: stat.path,
      name: stat.name,
      size: stat.size,
      isDirectory: stat.is_directory,
      isFile: stat.is_file,
      createdAt: new Date(stat.created_at),
      modifiedAt: new Date(stat.modified_at),
      accessedAt: new Date(stat.accessed_at),
      extension: stat.extension || '',
    };
  }

  /**
   * Check if file exists
   */
  async exists(path: string): Promise<boolean> {
    try {
      await this.getFileInfo(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a directory
   */
  async isDirectory(path: string): Promise<boolean> {
    const info = await this.getFileInfo(path);
    return info.isDirectory;
  }

  /**
   * Check if path is a file
   */
  async isFile(path: string): Promise<boolean> {
    const info = await this.getFileInfo(path);
    return info.isFile;
  }

  /**
   * Search files by pattern
   */
  async searchFiles(pattern: string, rootPath?: string): Promise<string[]> {
    return invoke('search_files', { pattern, rootPath });
  }

  /**
   * Invalidate cache for a path
   */
  invalidateCache(path: string): void {
    this.fileCache.delete(path);
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.fileCache.clear();
  }
}

/**
 * Get file service instance
 */
export function getFileService(): FileService {
  return FileService.getInstance();
}
