import Graph from 'graphology';
import Sigma from 'sigma';
import { GraphData } from './graph-types';

export interface CommunityData {
  members: Map<number, string[]>;
  centroids: Map<number, { x: number; y: number }>;
  interEdges: Map<string, { source: number; target: number; count: number }>;
}

export type LODMode = 'folders' | 'files' | 'functions';

const FOLDER_ZOOM_THRESHOLD = 3.0;
const FILE_ZOOM_THRESHOLD = 5.0;

export class LODManager {
  private communityData: CommunityData | null = null;
  private mode: LODMode = 'folders';
  private debounceTimer = 0;
  private onModeChange: ((mode: LODMode) => void) | null = null;
  private expandedFolders = new Set<string>();
  private expandedFiles = new Set<string>();
  private fullData: GraphData | null = null;

  setFullData(data: GraphData) {
    this.fullData = data;
  }

  setModeChangeCallback(cb: (mode: LODMode) => void) {
    this.onModeChange = cb;
  }

  computeCommunityData(graph: Graph): CommunityData {
    const members = new Map<number, string[]>();
    const centroids = new Map<number, { x: number; y: number }>();

    graph.forEachNode((node, attrs) => {
      const community = attrs.community as number;
      if (!members.has(community)) members.set(community, []);
      members.get(community)!.push(node);
    });

    for (const [community, nodeIds] of members) {
      let sumX = 0, sumY = 0;
      for (const nodeId of nodeIds) {
        sumX += graph.getNodeAttribute(nodeId, 'x');
        sumY += graph.getNodeAttribute(nodeId, 'y');
      }
      centroids.set(community, {
        x: sumX / nodeIds.length,
        y: sumY / nodeIds.length,
      });
    }

    const interEdges = new Map<string, { source: number; target: number; count: number }>();
    graph.forEachEdge((_edge, _attrs, source, target) => {
      const sc = graph.getNodeAttribute(source, 'community') as number;
      const tc = graph.getNodeAttribute(target, 'community') as number;
      if (sc !== tc) {
        const key = sc < tc ? `${sc}-${tc}` : `${tc}-${sc}`;
        const existing = interEdges.get(key);
        if (existing) {
          existing.count++;
        } else {
          interEdges.set(key, { source: Math.min(sc, tc), target: Math.max(sc, tc), count: 1 });
        }
      }
    });

    this.communityData = { members, centroids, interEdges };
    return this.communityData;
  }

  private getFolderPath(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/') || '.';
  }

  private getFileBaseName(filePath: string): string {
    return filePath.split('/').pop() || filePath;
  }

  buildHierarchicalGraph(
    fullData: GraphData,
    expandedFolders: Set<string>,
    expandedFiles: Set<string>,
    communityPalette: Record<string, string>,
    edgeColor: string,
  ): Graph {
    const g = new Graph();
    const folderNodes = new Map<string, { files: Set<string>, nodes: string[] }>();
    const fileNodes = new Map<string, { folder: string, nodes: string[] }>();

    for (const node of fullData.nodes) {
      const folder = this.getFolderPath(node.file_path);
      const file = node.file_path;

      if (!folderNodes.has(folder)) {
        folderNodes.set(folder, { files: new Set(), nodes: [] });
      }
      folderNodes.get(folder)!.files.add(file);
      folderNodes.get(folder)!.nodes.push(node.id);

      if (!fileNodes.has(file)) {
        fileNodes.set(file, { folder, nodes: [] });
      }
      fileNodes.get(file)!.nodes.push(node.id);
    }

    const nodePositions = new Map<string, { x: number; y: number }>();

    for (const [folder, data] of folderNodes) {
      const fileCount = data.files.size;
      const nodeCount = data.nodes.length;
      const size = Math.min(10 + Math.sqrt(nodeCount) * 2, 40);

      const folderKey = `folder:${folder}`;
      g.addNode(folderKey, {
        label: folder === '.' ? 'root' : folder.split('/').pop(),
        x: (Math.random() - 0.5) * 300,
        y: (Math.random() - 0.5) * 300,
        size,
        color: '#6366f1',
        kind: 'Module',
        language: '',
        file: folder,
        startLine: 0,
        endLine: 0,
        isFolder: true,
        fileCount,
        nodeCount,
      });
      nodePositions.set(folderKey, { x: 0, y: 0 });
    }

    for (const [file, data] of fileNodes) {
      if (!expandedFolders.has(data.folder)) continue;

      const nodeCount = data.nodes.length;
      const size = Math.min(8 + Math.sqrt(nodeCount) * 1.5, 30);
      const fileKey = `file:${file}`;
      const fileName = this.getFileBaseName(file);

      g.addNode(fileKey, {
        label: fileName,
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 200,
        size,
        color: '#8b5cf6',
        kind: 'File',
        language: '',
        file,
        startLine: 0,
        endLine: 0,
        isFile: true,
        nodeCount,
      });

      const folderKey = `folder:${data.folder}`;
      if (g.hasNode(folderKey) && !g.hasEdge(folderKey, fileKey)) {
        g.addEdge(folderKey, fileKey, { color: edgeColor, size: 1 });
      }
    }

    for (const node of fullData.nodes) {
      const file = node.file_path;
      if (!expandedFiles.has(file)) continue;

      const fileKey = `file:${file}`;
      if (!g.hasNode(fileKey)) continue;

      g.addNode(node.id, {
        label: node.name,
        x: (Math.random() - 0.5) * 100,
        y: (Math.random() - 0.5) * 100,
        size: 7,
        color: communityPalette[node.id] || '#64748b',
        kind: node.kind,
        language: node.language,
        file: node.file_path,
        startLine: node.start_line,
        endLine: node.end_line,
      });

      if (!g.hasEdge(fileKey, node.id)) {
        g.addEdge(fileKey, node.id, { color: edgeColor, size: 1 });
      }
    }

    for (const edge of fullData.edges) {
      if (g.hasNode(edge.source) && g.hasNode(edge.target) && !g.hasEdge(edge.source, edge.target)) {
        g.addEdge(edge.source, edge.target, { color: edgeColor, size: 1, label: edge.kind });
      }
    }

    return g;
  }

  expandFolder(folderPath: string) {
    this.expandedFolders.add(folderPath);
  }

  collapseFolder(folderPath: string) {
    this.expandedFolders.delete(folderPath);
    const prefix = folderPath + '/';
    for (const file of this.expandedFiles) {
      if (file.startsWith(prefix) || this.getFolderPath(file) === folderPath) {
        this.expandedFiles.delete(file);
      }
    }
  }

  expandFile(filePath: string) {
    this.expandedFiles.add(filePath);
  }

  collapseFile(filePath: string) {
    this.expandedFiles.delete(filePath);
  }

  isFolderExpanded(folderPath: string): boolean {
    return this.expandedFolders.has(folderPath);
  }

  isFileExpanded(filePath: string): boolean {
    return this.expandedFiles.has(filePath);
  }

  handleNodeClick(nodeId: string): { action: 'expand-folder' | 'expand-file' | 'select'; target: string } | null {
    if (nodeId.startsWith('folder:')) {
      const folder = nodeId.slice(7);
      if (this.expandedFolders.has(folder)) {
        this.collapseFolder(folder);
        return { action: 'expand-folder', target: folder };
      } else {
        this.expandFolder(folder);
        return { action: 'expand-folder', target: folder };
      }
    }
    if (nodeId.startsWith('file:')) {
      const file = nodeId.slice(5);
      if (this.expandedFiles.has(file)) {
        this.collapseFile(file);
        return { action: 'expand-file', target: file };
      } else {
        this.expandFile(file);
        return { action: 'expand-file', target: file };
      }
    }
    return { action: 'select', target: nodeId };
  }

  getMode(): LODMode {
    return this.mode;
  }

  getCommunityData(): CommunityData | null {
    return this.communityData;
  }

  cleanup() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = 0;
    }
    this.communityData = null;
    this.onModeChange = null;
    this.expandedFolders.clear();
    this.expandedFiles.clear();
  }
}
