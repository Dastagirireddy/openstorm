export type NodeKind =
  | 'File'
  | 'Module'
  | 'Function'
  | 'Struct'
  | 'Enum'
  | 'Trait'
  | 'Impl'
  | 'Import'
  | 'Constant'
  | 'Type';

export type EdgeKind =
  | 'Calls'
  | 'Imports'
  | 'Implements'
  | 'Extends'
  | 'Uses'
  | 'Contains'
  | 'References';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  file_path: string;
  start_line: number;
  end_line: number;
  language: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  file_path: string;
  line: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type LayoutType = 'force' | 'hierarchical';

export interface GraphFilters {
  kinds: NodeKind[];
  languages: string[];
  files: string[];
  folders: string[];
}
