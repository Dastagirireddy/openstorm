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
