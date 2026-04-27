/**
 * Git Graph Visualization
 *
 * Renders commit graph with proper branch topology showing:
 * - Parallel branch lanes
 * - Merge convergence lines
 * - Branch divergence points
 */

import type { CommitEntry } from './git-types.js';

export interface GraphCommit {
  hash: string;
  index: number;
  parent_hashes: string[];
  lane: number;
  laneColor: string;
  isMerge: boolean;
  isBranchPoint: boolean;
}

export interface GraphLane {
  id: number;
  branchName: string;
  color: string;
  active: boolean;
}

export interface GraphData {
  commits: GraphCommit[];
  lanes: GraphLane[];
  connections: GraphConnection[];
}

export interface GraphConnection {
  fromHash: string;
  toHash: string;
  fromLane: number;
  toLane: number;
  color: string;
  isMerge: boolean;
}

const LANE_COLORS = [
  '#6366f1', // indigo-500
  '#22c55e', // green-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
];

/**
 * Build graph data from commit list using lane-based algorithm
 * Processes commits oldest-to-newest to build lanes, then outputs newest-first
 */
export function buildGraphData(commits: CommitEntry[], branchColors: Map<string, string>): GraphData {
  if (commits.length === 0) {
    return { commits: [], lanes: [], connections: [] };
  }

  const hashToCommit = new Map<string, CommitEntry>();
  commits.forEach(c => hashToCommit.set(c.hash, c));

  // Track active lanes: laneId -> color
  const laneColors = new Map<number, string>();
  const hashToLane = new Map<string, number>();
  const connections: GraphConnection[] = [];

  // Get next available lane ID
  const getNextLaneId = (): number => {
    let id = 0;
    while (laneColors.has(id)) id++;
    return id;
  };

  // Process commits from oldest to newest (reverse order)
  // This ensures lanes are assigned consistently as we build up from roots
  const oldestToNewest = [...commits].reverse();

  for (const commit of oldestToNewest) {
    const isMerge = commit.parent_hashes.length > 1;

    // Determine which lane this commit belongs to
    let lane = hashToLane.get(commit.hash);

    if (lane === undefined) {
      // Try to find a parent's lane first (continue that lane)
      const parentLanes = commit.parent_hashes
        .map(h => hashToLane.get(h))
        .filter((l): l is number => l !== undefined);

      if (parentLanes.length > 0) {
        // Use the first parent's lane (main line of history)
        lane = parentLanes[0];
      } else {
        // New root commit - assign a new lane
        lane = getNextLaneId();
        const colorIndex = lane % LANE_COLORS.length;
        laneColors.set(lane, LANE_COLORS[colorIndex]);
      }

      hashToLane.set(commit.hash, lane);
    }

    // Create connections to all parents
    for (let i = 0; i < commit.parent_hashes.length; i++) {
      const parentHash = commit.parent_hashes[i];
      const parentCommit = hashToCommit.get(parentHash);
      if (!parentCommit) continue;

      // Determine parent's lane
      let parentLane = hashToLane.get(parentHash);

      if (parentLane === undefined) {
        // Parent hasn't been assigned yet - assign same lane for now
        parentLane = lane;
        hashToLane.set(parentHash, parentLane);
      }

      connections.push({
        fromHash: commit.hash,
        toHash: parentHash,
        fromLane: lane,
        toLane: parentLane,
        color: laneColors.get(lane) || LANE_COLORS[0],
        isMerge: i > 0, // First parent is mainline, others are merges
      });
    }
  }

  // Now build graph commits in display order (newest first)
  const graphCommits: GraphCommit[] = commits.map((commit, index) => {
    const lane = hashToLane.get(commit.hash) ?? 0;
    const isMerge = commit.parent_hashes.length > 1;

    return {
      hash: commit.hash,
      index,
      parent_hashes: commit.parent_hashes,
      lane,
      laneColor: laneColors.get(lane) || LANE_COLORS[0],
      isMerge,
      isBranchPoint: false,
    };
  });

  // Build lane list
  const lanes: GraphLane[] = Array.from(laneColors.entries()).map(([id, color]) => ({
    id,
    branchName: `Lane ${id}`,
    color,
    active: true,
  }));

  return { commits: graphCommits, lanes, connections };
}
