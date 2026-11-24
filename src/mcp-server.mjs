#!/usr/bin/env node
/**
 * AI Workforce OS — Model Context Protocol (MCP) Server (stdio, JSON-RPC 2.0)
 * Zero external dependencies. Plugs into Antigravity, Claude Desktop, Cursor, etc.
 */
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { TaskOrchestrator } from './orchestrator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT_DIR, 'data', 'workforce.json');

const orchestrator = new TaskOrchestrator({ storagePath: DATA_FILE });

const SERVER_INFO = {
  name: 'ai-workforce-mcp',
  version: '1.0.0'
};

const TOOLS = [
  {
    name: 'list_agents',
    description: 'Lấy danh sách toàn bộ nhân viên và AI Agent hiện có trong hệ thống AI Workforce OS.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'add_agent',
    description: 'Thêm mới một nhân viên hoặc AI Agent vào đội ngũ AI Workforce OS.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên nhân viên hoặc AI Agent (VD: Đoàn tk, AI Sale)' },
        role: { type: 'string', description: 'Phòng ban hoặc chuyên môn (VD: Phòng Thiết kế)' },
        keywords: { type: 'string', description: 'Từ khóa tự động định tuyến, cách nhau bởi dấu phẩy' },
        systemPrompt: { type: 'string', description: 'Mô tả vai trò / chỉ dẫn thực thi' }
      },
      required: ['name']
    }
  },
  {
    name: 'list_tasks',
    description: 'Xem danh sách công việc theo trạng thái Kanban, người phụ trách hoặc các việc quá hạn.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['backlog', 'in_progress', 'review', 'done', 'blocked'] },
        assignee: { type: 'string', description: 'Mã nhân viên / AI Agent (VD: doan-tk, ai-design, ai-marketing)' },
        overdueOnly: { type: 'boolean', description: 'Chỉ lọc các công việc quá hạn' }
      }
    }
  },
  {
    name: 'assign_task',
    description: 'Giao việc mới cho một nhân viên/AI cụ thể hoặc để AI Orchestrator tự động định tuyến (assignee="auto").',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Tiêu đề công việc' },
        description: { type: 'string', description: 'Yêu cầu chi tiết (Brief)' },
        assignee: { type: 'string', description: 'Mã người nhận việc hoặc "auto" để tự phân công', default: 'auto' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], default: 'medium' },
        deadline: { type: 'string', description: 'Hạn chót định dạng YYYY-MM-DD' }
      },
      required: ['title']
    }
  },
  {
    name: 'run_task',
    description: 'Kích hoạt AI Agent thực thi đầu việc và tự động chuyển qua AI QA kiểm duyệt (chuyển sang cột Review).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Mã đầu việc (VD: TASK-101)' }
      },
      required: ['id']
    }
  },
  {
    name: 'update_task_status',
    description: 'Cập nhật trạng thái Kanban của một đầu việc.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Mã đầu việc (VD: TASK-101)' },
        status: { type: 'string', enum: ['backlog', 'in_progress', 'review', 'done', 'blocked'] }
      },
      required: ['id', 'status']
    }
  },
  {
    name: 'approve_or_revise_task',
    description: 'Duyệt hoàn thành (approve) hoặc yêu cầu chỉnh sửa lại (revise) một đầu việc đang ở cột Chờ duyệt.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Mã đầu việc (VD: TASK-101)' },
        action: { type: 'string', enum: ['approve', 'revise'] },
        feedback: { type: 'string', description: 'Ghi chú chỉnh sửa (khi action="revise")' }
      },
      required: ['id', 'action']
    }
  }
];

async function callTool(name, args = {}) {
  switch (name) {
    case 'list_agents':
      return { agents: orchestrator.listAgents(), mode: orchestrator.getMode() };
    case 'add_agent':
      return { agent: orchestrator.addAgent(args) };
    case 'list_tasks':
      return { tasks: orchestrator.listTasks(args) };
    case 'assign_task':
      return { task: orchestrator.createTask(args) };
    case 'run_task':
      return { task: await orchestrator.executeTask(args.id) };
    case 'update_task_status':
      return { task: orchestrator.updateTaskStatus(args.id, args.status) };
    case 'approve_or_revise_task':
      if (args.action === 'approve') return { task: orchestrator.approveTask(args.id) };
      if (args.action === 'revise') return { task: orchestrator.requestRevision(args.id, args.feedback || '') };
      throw new Error(`Hành động không hợp lệ: ${args.action}`);
    default:
      throw new Error(`Tool không tồn tại: ${name}`);
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handleRequest(req) {
  const { id, method, params } = req;

  // Notifications have no id and expect no response
  if (id === undefined || id === null) return;

  try {
    if (method === 'initialize') {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO
        }
      });
    }

    if (method === 'ping') {
      return send({ jsonrpc: '2.0', id, result: {} });
    }

    if (method === 'tools/list') {
      return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    }

    if (method === 'tools/call') {
      const result = await callTool(params?.name, params?.arguments || {});
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        }
      });
    }

    return send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    });
  } catch (err) {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        isError: true,
        content: [{ type: 'text', text: `Lỗi: ${err.message}` }]
      }
    });
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const req = JSON.parse(trimmed);
    handleRequest(req);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
});
