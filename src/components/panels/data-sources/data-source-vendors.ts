/**
 * Database vendor metadata for UI rendering
 * Extensible - add new vendors as needed
 */

import type { DatabaseType } from './data-source-types.js';

export interface DatabaseVendor {
  id: DatabaseType;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  gradientFrom: string;
  gradientTo: string;
  borderColor: string;
  defaultPort: number;
  description: string;
}

export const DATABASE_VENDORS: DatabaseVendor[] = [
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    icon: 'simple-icons:postgresql',
    color: 'text-[#336791]',
    bgColor: 'bg-[#336791]/10',
    gradientFrom: 'from-[#336791]/25',
    gradientTo: 'to-[#336791]/10',
    borderColor: 'border-[#336791]/50',
    defaultPort: 5432,
    description: 'Advanced open-source RDBMS',
  },
  {
    id: 'mysql',
    name: 'MySQL',
    icon: 'simple-icons:mysql',
    color: 'text-[#F29111]',
    bgColor: 'bg-[#F29111]/10',
    gradientFrom: 'from-[#F29111]/25',
    gradientTo: 'to-[#F29111]/10',
    borderColor: 'border-[#F29111]/50',
    defaultPort: 3306,
    description: 'Popular open-source RDBMS',
  },
  {
    id: 'mariadb',
    name: 'MariaDB',
    icon: 'simple-icons:mariadb',
    color: 'text-[#003545]',
    bgColor: 'bg-[#003545]/10',
    gradientFrom: 'from-[#003545]/25',
    gradientTo: 'to-[#003545]/10',
    borderColor: 'border-[#003545]/50',
    defaultPort: 3306,
    description: 'MySQL-compatible RDBMS',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    icon: 'simple-icons:sqlite',
    color: 'text-[#003B57]',
    bgColor: 'bg-[#003B57]/10',
    gradientFrom: 'from-[#003B57]/25',
    gradientTo: 'to-[#003B57]/10',
    borderColor: 'border-[#003B57]/50',
    defaultPort: 0,
    description: 'Embedded SQL database',
  },
  {
    id: 'sqlserver',
    name: 'SQL Server',
    icon: 'simple-icons:microsoftsqlserver',
    color: 'text-[#CC2927]',
    bgColor: 'bg-[#CC2927]/10',
    gradientFrom: 'from-[#CC2927]/25',
    gradientTo: 'to-[#CC2927]/10',
    borderColor: 'border-[#CC2927]/50',
    defaultPort: 1433,
    description: 'Microsoft SQL Server',
  },
  {
    id: 'oracle',
    name: 'Oracle',
    icon: 'simple-icons:oracle',
    color: 'text-[#F80000]',
    bgColor: 'bg-[#F80000]/10',
    gradientFrom: 'from-[#F80000]/25',
    gradientTo: 'to-[#F80000]/10',
    borderColor: 'border-[#F80000]/50',
    defaultPort: 1521,
    description: 'Oracle Database',
  },
  {
    id: 'cockroachdb',
    name: 'CockroachDB',
    icon: 'simple-icons:cockroachlabs',
    color: 'text-[#6935FF]',
    bgColor: 'bg-[#6935FF]/10',
    gradientFrom: 'from-[#6935FF]/25',
    gradientTo: 'to-[#6935FF]/10',
    borderColor: 'border-[#6935FF]/50',
    defaultPort: 26257,
    description: 'Distributed SQL database',
  },
  {
    id: 'clickhouse',
    name: 'ClickHouse',
    icon: 'simple-icons:clickhouse',
    color: 'text-[#FF6600]',
    bgColor: 'bg-[#FF6600]/10',
    gradientFrom: 'from-[#FF6600]/25',
    gradientTo: 'to-[#FF6600]/10',
    borderColor: 'border-[#FF6600]/50',
    defaultPort: 9000,
    description: 'Analytics-optimized OLAP',
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    icon: 'simple-icons:mongodb',
    color: 'text-[#47A248]',
    bgColor: 'bg-[#47A248]/10',
    gradientFrom: 'from-[#47A248]/25',
    gradientTo: 'to-[#47A248]/10',
    borderColor: 'border-[#47A248]/50',
    defaultPort: 27017,
    description: 'Document NoSQL database',
  },
  {
    id: 'redis',
    name: 'Redis',
    icon: 'simple-icons:redis',
    color: 'text-[#DC382D]',
    bgColor: 'bg-[#DC382D]/10',
    gradientFrom: 'from-[#DC382D]/25',
    gradientTo: 'to-[#DC382D]/10',
    borderColor: 'border-[#DC382D]/50',
    defaultPort: 6379,
    description: 'In-memory key-value store',
  },
  {
    id: 'cassandra',
    name: 'Cassandra',
    icon: 'simple-icons:apache',
    color: 'text-[#1287B1]',
    bgColor: 'bg-[#1287B1]/10',
    gradientFrom: 'from-[#1287B1]/25',
    gradientTo: 'to-[#1287B1]/10',
    borderColor: 'border-[#1287B1]/50',
    defaultPort: 9042,
    description: 'Distributed NoSQL database',
  },
  {
    id: 'dynamodb',
    name: 'DynamoDB',
    icon: 'simple-icons:amazondynamodb',
    color: 'text-[#4053D5]',
    bgColor: 'bg-[#4053D5]/10',
    gradientFrom: 'from-[#4053D5]/25',
    gradientTo: 'to-[#4053D5]/10',
    borderColor: 'border-[#4053D5]/50',
    defaultPort: 8000,
    description: 'AWS managed NoSQL',
  },
  {
    id: 'neo4j',
    name: 'Neo4j',
    icon: 'simple-icons:neo4j',
    color: 'text-[#018BFF]',
    bgColor: 'bg-[#018BFF]/10',
    gradientFrom: 'from-[#018BFF]/25',
    gradientTo: 'to-[#018BFF]/10',
    borderColor: 'border-[#018BFF]/50',
    defaultPort: 7687,
    description: 'Graph database',
  },
  {
    id: 'elasticsearch',
    name: 'Elasticsearch',
    icon: 'simple-icons:elasticsearch',
    color: 'text-[#005571]',
    bgColor: 'bg-[#005571]/10',
    gradientFrom: 'from-[#005571]/25',
    gradientTo: 'to-[#005571]/10',
    borderColor: 'border-[#005571]/50',
    defaultPort: 9200,
    description: 'Search & analytics engine',
  },
];

export function getDatabaseVendor(vendorId: DatabaseType): DatabaseVendor | undefined {
  return DATABASE_VENDORS.find((v) => v.id === vendorId);
}

export function getDatabaseIcon(type: string): string {
  const vendor = DATABASE_VENDORS.find((v) => v.id === type);
  return vendor?.icon || 'mdi:database';
}

export function getDatabaseColor(type: string): string {
  const vendor = DATABASE_VENDORS.find((v) => v.id === type);
  return vendor?.color || 'text-gray-400';
}
