/**
 * Extensible data source types for OpenStorm
 *
 * Architecture:
 * - DataSource is the base abstraction for all data sources
 * - Each DataSourceType (database, file, api, cloud) has its own config schema
 * - New types can be added without breaking existing code
 */

export type DataSourceType = 'database' | 'file' | 'api' | 'cloud';

export type DatabaseType =
  | 'postgresql' | 'mysql' | 'sqlite' | 'mongodb' | 'redis'
  | 'mariadb' | 'sqlserver' | 'oracle' | 'cassandra' | 'dynamodb'
  | 'cockroachdb' | 'clickhouse' | 'neo4j' | 'elasticsearch';

export type FileType = 'json' | 'csv' | 'xml' | 'parquet' | 'avro' | 'orc';

export type ApiType = 'rest' | 'graphql' | 'grpc' | 'websocket';

export type CloudType = 'aws-s3' | 'aws-dynamodb' | 'firebase' | 'supabase' | 'planetscale' | 'neon';

/**
 * Base interface for all data sources
 */
export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  scope: 'global' | 'project';
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  dbType: DatabaseType;
  host?: string;
  port?: number;
  username?: string;
  database?: string;
  filePath?: string; // For SQLite
  ssl?: boolean;
  options?: Record<string, string>;
}

/**
 * Local file data source configuration
 */
export interface FileConfig {
  fileType: FileType;
  path: string;
  delimiter?: string; // For CSV
  encoding?: string;
}

/**
 * API endpoint configuration
 */
export interface ApiConfig {
  apiType: ApiType;
  baseUrl: string;
  authType?: 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2';
  apiKey?: string;
  headers?: Record<string, string>;
}

/**
 * Cloud service configuration
 */
export interface CloudConfig {
  cloudType: CloudType;
  region?: string;
  bucket?: string; // For S3
  projectId?: string; // For Firebase/Supabase
  credentials?: Record<string, string>;
}

/**
 * Union type for all data source configurations
 */
export type DataSourceConfig = DatabaseConfig | FileConfig | ApiConfig | CloudConfig;

/**
 * Database-specific data source
 */
export interface DatabaseDataSource extends DataSource {
  type: 'database';
  config: DatabaseConfig;
}

/**
 * File-based data source
 */
export interface FileDataSource extends DataSource {
  type: 'file';
  config: FileConfig;
}

/**
 * API-based data source
 */
export interface ApiDataSource extends DataSource {
  type: 'api';
  config: ApiConfig;
}

/**
 * Cloud-based data source
 */
export interface CloudDataSource extends DataSource {
  type: 'cloud';
  config: CloudConfig;
}

/**
 * Union type for all data source instances
 */
export type AnyDataSource = DatabaseDataSource | FileDataSource | ApiDataSource | CloudDataSource;

/**
 * Type guard for database data sources
 */
export function isDatabaseDataSource(ds: AnyDataSource): ds is DatabaseDataSource {
  return ds.type === 'database';
}

/**
 * Type guard for file data sources
 */
export function isFileDataSource(ds: AnyDataSource): ds is FileDataSource {
  return ds.type === 'file';
}

/**
 * Type guard for API data sources
 */
export function isApiDataSource(ds: AnyDataSource): ds is ApiDataSource {
  return ds.type === 'api';
}

/**
 * Type guard for cloud data sources
 */
export function isCloudDataSource(ds: AnyDataSource): ds is CloudDataSource {
  return ds.type === 'cloud';
}
