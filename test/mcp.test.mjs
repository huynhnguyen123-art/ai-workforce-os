import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

test('MCP Server: initialize -> tools/list -> assign_task -> run_task -> approve', async () => {
  const tmpFile = path.join(os.tmpdir(), `mcp-workforce-${Date.now()}.json`);
  const child = spawn('node', ['src/mcp-server.mjs'], {
    cwd: path.resolve(''),
    env: { ...process.env, DATA_FILE: tmpFile, GEMINI_API_KEY: '', OPENAI_API_KEY: '' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const rl = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  rl.on('line', (line) => {
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  let seq = 1;
  const rpc = (method, params = {}) =>
    new Promise((resolve) => {
      const id = seq++;
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });

  try {
    const initRes = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } });
    assert.equal(initRes.result.serverInfo.name, 'ai-workforce-mcp');

    const toolsRes = await rpc('tools/list');
    const names = toolsRes.result.tools.map((t) => t.name);
    assert.ok(names.includes('assign_task'));
    assert.ok(names.includes('run_task'));
    assert.ok(names.includes('list_agents'));

    const assignRes = await rpc('tools/call', {
      name: 'assign_task',
      arguments: { title: 'Thiết kế nội thất 40m2 hiện đại', assignee: 'doan-tk', priority: 'high', deadline: '2026-11-30' }
    });
    const assigned = JSON.parse(assignRes.result.content[0].text).task;
    assert.equal(assigned.assignee, 'doan-tk');
    assert.equal(assigned.status, 'backlog');

    const runRes = await rpc('tools/call', { name: 'run_task', arguments: { id: assigned.id } });
    const ran = JSON.parse(runRes.result.content[0].text).task;
    assert.equal(ran.status, 'review');
    assert.ok(ran.qaScore >= 80);

    const approveRes = await rpc('tools/call', {
      name: 'approve_or_revise_task',
      arguments: { id: assigned.id, action: 'approve' }
    });
    const approved = JSON.parse(approveRes.result.content[0].text).task;
    assert.equal(approved.status, 'done');
  } finally {
    child.kill();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});
