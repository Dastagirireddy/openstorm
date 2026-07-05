import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAIClient,
} from '../../../src/components/ai-v2/core/ai-ipc.js';

describe('createAIClient', () => {
  let mockInvoke: ReturnType<typeof vi.fn>;
  let mockListen: ReturnType<typeof vi.fn>;
  let client: ReturnType<typeof createAIClient>;

  beforeEach(() => {
    mockInvoke = vi.fn().mockResolvedValue(undefined);
    mockListen = vi.fn().mockResolvedValue(vi.fn());
    client = createAIClient(mockInvoke, mockListen);
  });

  describe('sendMessage', () => {
    it('invokes ai_v2_chat with correct params', async () => {
      await client.sendMessage('hello', [{ role: 'user', content: 'prev' }], '/project', 'gpt-4o');
      expect(mockInvoke).toHaveBeenCalledWith('ai_v2_chat', {
        request: {
          message: 'hello',
          history: [{ role: 'user', content: 'prev' }],
          project_path: '/project',
          model: 'gpt-4o',
        },
      });
    });
  });

  describe('approveTool', () => {
    it('invokes ai_v2_approve_tool with correct params', async () => {
      await client.approveTool('tc-1', true);
      expect(mockInvoke).toHaveBeenCalledWith('ai_v2_approve_tool', {
        request: { tool_call_id: 'tc-1', approved: true },
      });
    });
  });

  describe('abort', () => {
    it('invokes ai_v2_abort', async () => {
      await client.abort();
      expect(mockInvoke).toHaveBeenCalledWith('ai_v2_abort');
    });
  });

  describe('spawnAgent', () => {
    it('invokes ai_v2_spawn_agent with correct params', async () => {
      await client.spawnAgent('fix bug', 'debugger');
      expect(mockInvoke).toHaveBeenCalledWith('ai_v2_spawn_agent', {
        request: { task: 'fix bug', role: 'debugger', parent_id: null },
      });
    });
  });

  describe('answerQuestion', () => {
    it('invokes ai_v2_question_response with correct params', async () => {
      const answers = { q1: 'yes', q2: ['a', 'b'] };
      await client.answerQuestion(answers);
      expect(mockInvoke).toHaveBeenCalledWith('ai_v2_question_response', {
        request: { answers },
      });
    });
  });

  describe('listenToAgentEvents', () => {
    it('subscribes to all agent event channels', async () => {
      client.listenToAgentEvents(vi.fn());
      // listenToAgentEvents calls setup() async, wait for it
      await new Promise(r => setTimeout(r, 10));
      expect(mockListen).toHaveBeenCalledTimes(6);
      expect(mockListen).toHaveBeenCalledWith('ai-v2:text-delta', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('ai-v2:tool-use', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('ai-v2:tool-result', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('ai-v2:tool-approval-required', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('ai-v2:question-request', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('ai-v2:error', expect.any(Function));
    });

    it('returns unsubscribe function', async () => {
      const unsubs = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()];
      let callIdx = 0;
      mockListen.mockImplementation(() => Promise.resolve(unsubs[callIdx++]));

      const unsub = client.listenToAgentEvents(vi.fn());
      // wait for async setup
      await new Promise(r => setTimeout(r, 10));

      unsub();
      for (const u of unsubs) {
        expect(u).toHaveBeenCalledOnce();
      }
    });
  });
});
