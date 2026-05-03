import type { DatabaseType } from './data-source-types.js';

/**
 * Database Form Registry - Scalable architecture for vendor forms
 *
 * Pattern:
 * - Generic forms handle multiple vendors with similar needs (PostgreSQL, MySQL, etc.)
 * - Specialized forms for vendors with unique requirements (SQLite, MongoDB connection strings)
 * - Add new vendors by updating registry - no changes to panel components
 */

export type DatabaseFormCategory = 'standard' | 'file-based' | 'connection-string' | 'cloud';

export interface DatabaseFormDefinition {
  /** The Lit component tag name to render */
  componentTag: string;
  /** Form category determines which fields are shown/required */
  category: DatabaseFormCategory;
  /** Default port for the vendor (0 if not applicable) */
  defaultPort: number;
  /** Whether host field is required */
  requiresHost: boolean;
  /** Whether auth (username/password) is required */
  requiresAuth: boolean;
  /** Whether to show database name field */
  showDatabaseField: boolean;
  /** Human-readable name for UI */
  displayName: string;
}

export const DATABASE_FORM_REGISTRY: Record<DatabaseType, DatabaseFormDefinition> = {
  // File-based databases
  sqlite: {
    componentTag: 'sqlite-connection-form',
    category: 'file-based',
    defaultPort: 0,
    requiresHost: false,
    requiresAuth: false,
    showDatabaseField: false,
    displayName: 'SQLite',
  },

  // Standard SQL databases - use generic form
  postgresql: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 5432,
    requiresHost: true,
    requiresAuth: true,
    showDatabaseField: true,
    displayName: 'PostgreSQL',
  },

  mysql: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 3306,
    requiresHost: true,
    requiresAuth: true,
    showDatabaseField: true,
    displayName: 'MySQL',
  },

  mariadb: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 3306,
    requiresHost: true,
    requiresAuth: true,
    showDatabaseField: true,
    displayName: 'MariaDB',
  },

  sqlserver: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 1433,
    requiresHost: true,
    requiresAuth: true,
    showDatabaseField: true,
    displayName: 'SQL Server',
  },

  oracle: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 1521,
    requiresHost: true,
    requiresAuth: true,
    showDatabaseField: true,
    displayName: 'Oracle',
  },

  // NoSQL databases - some may need specialized forms later
  mongodb: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 27017,
    requiresHost: true,
    requiresAuth: true,
    showDatabaseField: true,
    displayName: 'MongoDB',
  },

  redis: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 6379,
    requiresHost: true,
    requiresAuth: false,
    showDatabaseField: false,
    displayName: 'Redis',
  },

  // Additional DatabaseType members - using generic form as default
  // Customize these if they need specialized forms in the future
  cockroachdb: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 26257,
    requiresHost: true,
    requiresAuth: true,
    showDatabaseField: true,
    displayName: 'CockroachDB',
  },

  clickhouse: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 8123,
    requiresHost: true,
    requiresAuth: true,
    showDatabaseField: true,
    displayName: 'ClickHouse',
  },

  cassandra: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 9042,
    requiresHost: true,
    requiresAuth: true,
    showDatabaseField: false,
    displayName: 'Cassandra',
  },

  neo4j: {
    componentTag: 'database-connection-form',
    category: 'connection-string',
    defaultPort: 7687,
    requiresHost: true,
    requiresAuth: true,
    showDatabaseField: false,
    displayName: 'Neo4j',
  },

  dynamodb: {
    componentTag: 'database-connection-form',
    category: 'cloud',
    defaultPort: 0,
    requiresHost: false,
    requiresAuth: false,
    showDatabaseField: false,
    displayName: 'DynamoDB',
  },

  elasticsearch: {
    componentTag: 'database-connection-form',
    category: 'standard',
    defaultPort: 9200,
    requiresHost: true,
    requiresAuth: false,
    showDatabaseField: false,
    displayName: 'Elasticsearch',
  },
};

/**
 * Get form definition for a vendor
 */
export function getDatabaseFormDefinition(vendorId: DatabaseType): DatabaseFormDefinition {
  return DATABASE_FORM_REGISTRY[vendorId];
}

/**
 * Check if a vendor uses a specialized (non-generic) form
 */
export function isSpecializedForm(vendorId: DatabaseType): boolean {
  const def = DATABASE_FORM_REGISTRY[vendorId];
  return def.componentTag !== 'database-connection-form';
}

/**
 * Get all vendors that use a specific form component
 */
export function getVendorsForForm(componentTag: string): DatabaseType[] {
  return (Object.keys(DATABASE_FORM_REGISTRY) as DatabaseType[]).filter(
    (vendorId) => DATABASE_FORM_REGISTRY[vendorId].componentTag === componentTag,
  );
}
