/**
 * File Manager for Specster MCP Server
 * Handles file operations and management across workflow phases
 */

import { Logger } from './logger.js';
import { WorkflowPhase } from './workflow-engine.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FileManagerConfig {
  baseDirectory: string;
  maxFileSize: number;
  allowedExtensions: string[];
  backupEnabled: boolean;
  compressionEnabled: boolean;
}

export interface FileMetadata {
  path: string;
  name: string;
  extension: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  phase: WorkflowPhase;
  tags: string[];
  checksum: string;
}

export interface FileOperation {
  type: 'create' | 'read' | 'update' | 'delete' | 'move' | 'copy';
  sourcePath: string;
  targetPath?: string;
  timestamp: Date;
  success: boolean;
  error?: string;
}

export interface FileSearchQuery {
  path?: string;
  name?: string;
  extension?: string;
  phase?: WorkflowPhase;
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface FileBackup {
  originalPath: string;
  backupPath: string;
  timestamp: Date;
  reason: string;
}

/**
 * File Manager handles all file operations for the Specster system
 */
export class FileManager {
  private config: FileManagerConfig;
  private logger: Logger;
  private fileMetadata: Map<string, FileMetadata> = new Map();
  private operationHistory: FileOperation[] = [];
  private backups: Map<string, FileBackup[]> = new Map();

  /**
   * Creates a new FileManager instance
   * @param config - File manager configuration
   * @param logger - Logger instance for structured logging
   */
  constructor(config: FileManagerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.ensureBaseDirectory().catch(error => {
      this.logger.error('Failed to ensure base directory during initialization', error);
    });
  }

  /**
   * Creates a new file
   * @param path - File path relative to base directory
   * @param content - File content
   * @param phase - Workflow phase
   * @param tags - Optional tags
   * @returns Promise resolving to file metadata
   */
  async createFile(path: string, content: string, phase: WorkflowPhase, tags: string[] = []): Promise<FileMetadata> {
    const fullPath = this.resolvePath(path);
    this.logger.info(`Creating file ${fullPath}`);

    const operation: FileOperation = {
      type: 'create',
      sourcePath: fullPath,
      timestamp: new Date(),
      success: false
    };

    try {
      // Validate file
      this.validateFile(path, content);

      // TODO: Implement actual file creation
      await this.writeFileContent(fullPath, content);

      // Create metadata
      const metadata: FileMetadata = {
        path: fullPath,
        name: this.extractFileName(path),
        extension: this.extractExtension(path),
        size: content.length,
        createdAt: new Date(),
        modifiedAt: new Date(),
        phase,
        tags,
        checksum: this.calculateChecksum(content)
      };

      this.fileMetadata.set(fullPath, metadata);
      operation.success = true;
      this.operationHistory.push(operation);

      this.logger.info(`File created successfully: ${fullPath}`);
      return metadata;
    } catch (error) {
      operation.error = (error as Error).message;
      this.operationHistory.push(operation);
      this.logger.error(`Failed to create file ${fullPath}`, error as Error);
      throw error;
    }
  }

  /**
   * Reads a file
   * @param path - File path relative to base directory
   * @returns Promise resolving to file content
   */
  async readFile(path: string): Promise<string> {
    const fullPath = this.resolvePath(path);
    this.logger.debug(`Reading file ${fullPath}`);

    const operation: FileOperation = {
      type: 'read',
      sourcePath: fullPath,
      timestamp: new Date(),
      success: false
    };

    try {
      // TODO: Implement actual file reading
      const content = await this.readFileContent(fullPath);
      
      operation.success = true;
      this.operationHistory.push(operation);
      
      return content;
    } catch (error) {
      operation.error = (error as Error).message;
      this.operationHistory.push(operation);
      this.logger.error(`Failed to read file ${fullPath}`, error as Error);
      throw error;
    }
  }

  /**
   * Updates an existing file
   * @param path - File path relative to base directory
   * @param content - New file content
   * @returns Promise resolving to updated file metadata
   */
  async updateFile(path: string, content: string): Promise<FileMetadata> {
    const fullPath = this.resolvePath(path);
    this.logger.info(`Updating file ${fullPath}`);

    const operation: FileOperation = {
      type: 'update',
      sourcePath: fullPath,
      timestamp: new Date(),
      success: false
    };

    try {
      // Create backup if enabled
      if (this.config.backupEnabled) {
        await this.createBackup(fullPath, 'update');
      }

      // Validate file
      this.validateFile(path, content);

      // TODO: Implement actual file update
      await this.writeFileContent(fullPath, content);

      // Update metadata
      const metadata = this.fileMetadata.get(fullPath);
      if (metadata) {
        metadata.size = content.length;
        metadata.modifiedAt = new Date();
        metadata.checksum = this.calculateChecksum(content);
      }

      operation.success = true;
      this.operationHistory.push(operation);

      this.logger.info(`File updated successfully: ${fullPath}`);
      return metadata!;
    } catch (error) {
      operation.error = (error as Error).message;
      this.operationHistory.push(operation);
      this.logger.error(`Failed to update file ${fullPath}`, error as Error);
      throw error;
    }
  }

  /**
   * Deletes a file
   * @param path - File path relative to base directory
   * @returns Promise resolving to success status
   */
  async deleteFile(path: string): Promise<boolean> {
    const fullPath = this.resolvePath(path);
    this.logger.info(`Deleting file ${fullPath}`);

    const operation: FileOperation = {
      type: 'delete',
      sourcePath: fullPath,
      timestamp: new Date(),
      success: false
    };

    try {
      // Create backup if enabled
      if (this.config.backupEnabled) {
        await this.createBackup(fullPath, 'delete');
      }

      // TODO: Implement actual file deletion
      await this.deleteFileContent(fullPath);

      // Remove metadata
      this.fileMetadata.delete(fullPath);

      operation.success = true;
      this.operationHistory.push(operation);

      this.logger.info(`File deleted successfully: ${fullPath}`);
      return true;
    } catch (error) {
      operation.error = (error as Error).message;
      this.operationHistory.push(operation);
      this.logger.error(`Failed to delete file ${fullPath}`, error as Error);
      return false;
    }
  }

  /**
   * Moves a file to a new location
   * @param sourcePath - Source file path
   * @param targetPath - Target file path
   * @returns Promise resolving to success status
   */
  async moveFile(sourcePath: string, targetPath: string): Promise<boolean> {
    const fullSourcePath = this.resolvePath(sourcePath);
    const fullTargetPath = this.resolvePath(targetPath);
    this.logger.info(`Moving file from ${fullSourcePath} to ${fullTargetPath}`);

    const operation: FileOperation = {
      type: 'move',
      sourcePath: fullSourcePath,
      targetPath: fullTargetPath,
      timestamp: new Date(),
      success: false
    };

    try {
      // TODO: Implement actual file move
      await this.moveFileContent(fullSourcePath, fullTargetPath);

      // Update metadata
      const metadata = this.fileMetadata.get(fullSourcePath);
      if (metadata) {
        metadata.path = fullTargetPath;
        metadata.name = this.extractFileName(targetPath);
        metadata.modifiedAt = new Date();
        this.fileMetadata.delete(fullSourcePath);
        this.fileMetadata.set(fullTargetPath, metadata);
      }

      operation.success = true;
      this.operationHistory.push(operation);

      this.logger.info(`File moved successfully from ${fullSourcePath} to ${fullTargetPath}`);
      return true;
    } catch (error) {
      operation.error = (error as Error).message;
      this.operationHistory.push(operation);
      this.logger.error(`Failed to move file from ${fullSourcePath} to ${fullTargetPath}`, error as Error);
      return false;
    }
  }

  /**
   * Copies a file to a new location
   * @param sourcePath - Source file path
   * @param targetPath - Target file path
   * @returns Promise resolving to success status
   */
  async copyFile(sourcePath: string, targetPath: string): Promise<boolean> {
    const fullSourcePath = this.resolvePath(sourcePath);
    const fullTargetPath = this.resolvePath(targetPath);
    this.logger.info(`Copying file from ${fullSourcePath} to ${fullTargetPath}`);

    const operation: FileOperation = {
      type: 'copy',
      sourcePath: fullSourcePath,
      targetPath: fullTargetPath,
      timestamp: new Date(),
      success: false
    };

    try {
      // Read source file
      const content = await this.readFileContent(fullSourcePath);
      
      // Write to target
      await this.writeFileContent(fullTargetPath, content);

      // Create metadata for target
      const sourceMetadata = this.fileMetadata.get(fullSourcePath);
      if (sourceMetadata) {
        const targetMetadata: FileMetadata = {
          ...sourceMetadata,
          path: fullTargetPath,
          name: this.extractFileName(targetPath),
          createdAt: new Date(),
          modifiedAt: new Date()
        };
        this.fileMetadata.set(fullTargetPath, targetMetadata);
      }

      operation.success = true;
      this.operationHistory.push(operation);

      this.logger.info(`File copied successfully from ${fullSourcePath} to ${fullTargetPath}`);
      return true;
    } catch (error) {
      operation.error = (error as Error).message;
      this.operationHistory.push(operation);
      this.logger.error(`Failed to copy file from ${fullSourcePath} to ${fullTargetPath}`, error as Error);
      return false;
    }
  }

  /**
   * Searches for files based on query criteria
   * @param query - Search query
   * @returns Array of matching file metadata
   */
  async searchFiles(query: FileSearchQuery): Promise<FileMetadata[]> {
    const results: FileMetadata[] = [];

    for (const metadata of this.fileMetadata.values()) {
      if (this.matchesSearchQuery(metadata, query)) {
        results.push(metadata);
      }
    }

    return results;
  }

  /**
   * Gets file metadata
   * @param path - File path
   * @returns File metadata or null if not found
   */
  getFileMetadata(path: string): FileMetadata | null {
    const fullPath = this.resolvePath(path);
    return this.fileMetadata.get(fullPath) || null;
  }

  /**
   * Lists all files in a directory
   * @param directoryPath - Directory path
   * @returns Array of file metadata
   */
  async listFiles(directoryPath: string = ''): Promise<FileMetadata[]> {
    const fullPath = this.resolvePath(directoryPath);
    const files: FileMetadata[] = [];

    for (const metadata of this.fileMetadata.values()) {
      if (metadata.path.startsWith(fullPath)) {
        files.push(metadata);
      }
    }

    return files;
  }

  /**
   * Gets operation history
   * @param limit - Maximum number of operations to return
   * @returns Array of file operations
   */
  getOperationHistory(limit: number = 100): FileOperation[] {
    return this.operationHistory.slice(-limit);
  }

  /**
   * Validates a file
   * @param path - File path
   * @param content - File content
   */
  private validateFile(path: string, content: string): void {
    const extension = this.extractExtension(path);
    
    if (this.config.allowedExtensions.length > 0 && !this.config.allowedExtensions.includes(extension)) {
      throw new Error(`File extension ${extension} is not allowed`);
    }

    if (content.length > this.config.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
    }
  }

  /**
   * Checks if file metadata matches search query
   * @param metadata - File metadata
   * @param query - Search query
   * @returns Whether metadata matches query
   */
  private matchesSearchQuery(metadata: FileMetadata, query: FileSearchQuery): boolean {
    if (query.path && !metadata.path.includes(query.path)) {
      return false;
    }

    if (query.name && !metadata.name.includes(query.name)) {
      return false;
    }

    if (query.extension && metadata.extension !== query.extension) {
      return false;
    }

    if (query.phase && metadata.phase !== query.phase) {
      return false;
    }

    if (query.tags && query.tags.length > 0) {
      const hasMatchingTag = query.tags.some(tag => metadata.tags.includes(tag));
      if (!hasMatchingTag) {
        return false;
      }
    }

    if (query.minSize !== undefined && metadata.size < query.minSize) {
      return false;
    }

    if (query.maxSize !== undefined && metadata.size > query.maxSize) {
      return false;
    }

    if (query.createdAfter && metadata.createdAt < query.createdAfter) {
      return false;
    }

    if (query.createdBefore && metadata.createdAt > query.createdBefore) {
      return false;
    }

    return true;
  }

  /**
   * Creates a backup of a file
   * @param path - File path
   * @param reason - Backup reason
   * @returns Promise resolving to backup info
   */
  private async createBackup(path: string, reason: string): Promise<FileBackup> {
    const backupPath = this.generateBackupPath(path);
    const backup: FileBackup = {
      originalPath: path,
      backupPath,
      timestamp: new Date(),
      reason
    };

    // TODO: Implement actual backup creation
    await this.copyFileContent(path, backupPath);

    const backups = this.backups.get(path) || [];
    backups.push(backup);
    this.backups.set(path, backups);

    return backup;
  }

  /**
   * Generates a backup path for a file
   * @param originalPath - Original file path
   * @returns Backup path
   */
  private generateBackupPath(originalPath: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = this.extractExtension(originalPath);
    const nameWithoutExtension = originalPath.replace(extension, '');
    return `${nameWithoutExtension}.backup.${timestamp}${extension}`;
  }

  /**
   * Resolves a path relative to base directory
   * @param path - Relative path
   * @returns Absolute path
   */
  private resolvePath(path: string): string {
    return path.startsWith('/') ? path : `${this.config.baseDirectory}/${path}`;
  }

  /**
   * Extracts file name from path
   * @param path - File path
   * @returns File name
   */
  private extractFileName(path: string): string {
    return path.split('/').pop() || '';
  }

  /**
   * Extracts file extension from path
   * @param path - File path
   * @returns File extension
   */
  private extractExtension(path: string): string {
    const name = this.extractFileName(path);
    const lastDotIndex = name.lastIndexOf('.');
    return lastDotIndex > 0 ? name.substring(lastDotIndex) : '';
  }

  /**
   * Calculates checksum for content
   * @param content - File content
   * @returns Checksum string
   */
  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Ensures base directory exists
   */
  private async ensureBaseDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.baseDirectory, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create base directory: ${this.config.baseDirectory}`, error as Error);
      throw error;
    }
  }

  /**
   * Writes content to file
   * @param path - File path
   * @param content - File content
   * @returns Promise resolving when write is complete
   */
  private async writeFileContent(filePath: string, content: string): Promise<void> {
    try {
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      // Write content to file
      await fs.writeFile(filePath, content, 'utf8');
      
      this.logger.debug(`File written successfully: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to write file: ${filePath}`, error as Error);
      throw error;
    }
  }

  /**
   * Reads content from file
   * @param path - File path
   * @returns Promise resolving to file content
   */
  private async readFileContent(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      this.logger.debug(`File read successfully: ${filePath}`);
      return content;
    } catch (error) {
      this.logger.error(`Failed to read file: ${filePath}`, error as Error);
      throw error;
    }
  }

  /**
   * Deletes file content
   * @param path - File path
   * @returns Promise resolving when deletion is complete
   */
  private async deleteFileContent(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.debug(`File deleted successfully: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${filePath}`, error as Error);
      throw error;
    }
  }

  /**
   * Moves file content
   * @param sourcePath - Source path
   * @param targetPath - Target path
   * @returns Promise resolving when move is complete
   */
  private async moveFileContent(sourcePath: string, targetPath: string): Promise<void> {
    try {
      // Ensure target directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      
      // Move file
      await fs.rename(sourcePath, targetPath);
      
      this.logger.debug(`File moved successfully from ${sourcePath} to ${targetPath}`);
    } catch (error) {
      this.logger.error(`Failed to move file from ${sourcePath} to ${targetPath}`, error as Error);
      throw error;
    }
  }

  /**
   * Copies file content
   * @param sourcePath - Source path
   * @param targetPath - Target path
   * @returns Promise resolving when copy is complete
   */
  private async copyFileContent(sourcePath: string, targetPath: string): Promise<void> {
    try {
      // Ensure target directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      
      // Copy file
      await fs.copyFile(sourcePath, targetPath);
      
      this.logger.debug(`File copied successfully from ${sourcePath} to ${targetPath}`);
    } catch (error) {
      this.logger.error(`Failed to copy file from ${sourcePath} to ${targetPath}`, error as Error);
      throw error;
    }
  }
}