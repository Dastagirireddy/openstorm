/**
 * Feature flags for OpenStorm.
 * Change AI_PANEL_VERSION to 'v2' to enable the new agent panel design.
 * Default is 'v1' (current chat-style panel).
 */
export const FEATURES = {
  AI_PANEL_VERSION: 'v2' as 'v1' | 'v2',
} as const;
