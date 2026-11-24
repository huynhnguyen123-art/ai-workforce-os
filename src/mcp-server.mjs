#!/usr/bin/env node
/**
 * AI Workforce OS — Model Context Protocol (MCP) Server (stdio, JSON-RPC 2.0)
 * Zero external dependencies. Plugs into Antigravity, Claude Desktop, Cursor, etc.
 */
import fs from 'node:fs';
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
  },
  {
    name: 'delete_task',
    description: 'Xóa vĩnh viễn một đầu việc khỏi hệ thống.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Mã đầu việc cần xóa (VD: TASK-101)' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_kpi_report',
    description: 'Tổng hợp báo cáo KPI theo toàn đội và từng nhân viên / AI Agent (tổng việc, tỷ lệ hoàn thành, quá hạn, điểm QA trung bình).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'export_tasks_csv',
    description: 'Xuất toàn bộ bảng công việc ra định dạng CSV (UTF-8 BOM) tương thích Excel & Google Sheets; có thể lưu thẳng ra file trên ổ cứng.',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: { type: 'string', description: 'Đường dẫn file .csv để lưu trên ổ cứng (tùy chọn)' }
      }
    }
  },
  {
    name: 'send_task_notification',
    description: 'Tạo thông báo/email giao việc chuẩn cho nhân viên phụ trách, hoặc gửi trực tiếp qua Webhook (Slack/Discord/Zalo/n8n) nếu có webhookUrl hoặc biến môi trường WEBHOOK_URL.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Mã đầu việc (VD: TASK-101)' },
        recipientEmail: { type: 'string', description: 'Email người nhận (tùy chọn)' },
        webhookUrl: { type: 'string', description: 'URL Webhook để bắn thông báo tự động (tùy chọn)' }
      },
      required: ['id']
    }
  }
];

function buildKpiReport() {
  const today = new Date().toISOString().slice(0, 10);
  const agents = orchestrator.listAgents();
  const tasks = orchestrator.listTasks();
  const scored = tasks.filter((t) => typeof t.qaScore === 'number');
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const overdueCount = tasks.filter((t) => t.status !== 'done' && t.deadline < today).length;

  const byAgent = agents.map((a) => {
    const list = tasks.filter((t) => t.assignee === a.id);
    const done = list.filter((t) => t.status === 'done').length;
    const overdue = list.filter((t) => t.status !== 'done' && t.deadline < today).length;
    const aScored = list.filter((t) => typeof t.qaScore === 'number');
    return {
      id: a.id,
      name: a.name,
      role: a.role,
      total: list.length,
      done,
      inProgress: list.filter((t) => t.status === 'in_progress').length,
      review: list.filter((t) => t.status === 'review').length,
      overdue,
      completionRate: list.length ? Math.round((done / list.length) * 100) : 0,
      avgQaScore: aScored.length ? Math.round(aScored.reduce((s, t) => s + t.qaScore, 0) / aScored.length) : null
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalTasks: tasks.length,
      doneTasks: doneCount,
      overdueTasks: overdueCount,
      completionRate: tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
      avgQaScore: scored.length ? Math.round(scored.reduce((s, t) => s + t.qaScore, 0) / scored.length) : null
    },
    byAgent
  };
}

function buildTasksCsv(outputPath) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['ID', 'Tiêu đề', 'Phụ trách', 'Ưu tiên', 'Trạng thái', 'Deadline', 'Tiến độ (%)', 'Điểm QA'];
  const rows = orchestrator.listTasks().map((t) => [
    t.id, t.title, t.assignee, t.priority, t.status, t.deadline, t.progress, t.qaScore ?? ''
  ]);
  const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, csv, 'utf8');
  }
  return { rowCount: rows.length, savedTo: outputPath || null, csv };
}

async function sendTaskNotification({ id, recipientEmail = '', webhookUrl = '' }) {
  const task = orchestrator.getTask(id);
  const agent = orchestrator.listAgents().find((a) => a.id === task.assignee);
  const subject = `[AI Workforce OS] Giao việc ${task.id}: ${task.title}`;
  const body = [
    `Xin chào ${agent ? agent.name : task.assignee},`,
    `Bạn được giao đầu việc mới trên AI Workforce OS:`,
    `- Mã việc: ${task.id}`,
    `- Tiêu đề: ${task.title}`,
    `- Độ ưu tiên: ${task.priority}`,
    `- Deadline: ${task.deadline}`,
    `- Chi tiết: ${task.description || 'Không có mô tả thêm.'}`
  ].join('\n');

  const targetWebhook = webhookUrl || process.env.WEBHOOK_URL || '';
  let webhookSent = false;
  if (targetWebhook) {
    const res = await fetch(targetWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `${subject}\n\n${body}`, task })
    });
    if (!res.ok) throw new Error(`Webhook trả về lỗi ${res.status}`);
    webhookSent = true;
  }

  return {
    deliveredViaWebhook: webhookSent,
    emailDraft: { to: recipientEmail || null, subject, body }
  };
}

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
    case 'delete_task':
      return orchestrator.deleteTask(args.id);
    case 'get_kpi_report':
      return buildKpiReport();
    case 'export_tasks_csv':
      return buildTasksCsv(args.outputPath);
    case 'send_task_notification':
      return sendTaskNotification(args);
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
