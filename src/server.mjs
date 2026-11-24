import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TaskOrchestrator } from './orchestrator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_HTML = path.join(ROOT_DIR, 'public', 'index.html');
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT_DIR, 'data', 'workforce.json');
const PORT = Number(process.env.PORT || 3080);

export function createApp({ storagePath = DATA_FILE } = {}) {
  const orchestrator = new TaskOrchestrator({ storagePath });

  // Seed sample tasks only when database is empty
  if (orchestrator.listTasks().length === 0) {
    orchestrator.createTask({
      title: 'Viết chuỗi 3 email ra mắt gói AI Enterprise',
      description: 'Nhắm vào khách hàng SMB: Email giới thiệu, Case-study và ưu đãi 14 ngày dùng thử.',
      assignee: 'ai-marketing',
      priority: 'high',
      deadline: '2026-11-24'
    });
    orchestrator.createTask({
      title: 'Phân loại & soạn trả lời 25 ticket khiếu nại thanh toán',
      description: 'Phân nhóm theo nguyên nhân (lỗi thẻ, gia hạn, hóa đơn VAT) và soạn mẫu phản hồi lịch sự.',
      assignee: 'ai-cskh',
      priority: 'high',
      deadline: '2026-11-23'
    });
    orchestrator.createTask({
      title: 'Xây dựng API Webhook đồng bộ đơn hàng sang CRM',
      description: 'Viết endpoint POST /webhooks/orders có xác thực chữ ký HMAC, retry 3 lần và unit test.',
      assignee: 'ai-dev',
      priority: 'medium',
      deadline: '2026-11-26'
    });
    orchestrator.createTask({
      title: 'Lên kế hoạch nội dung TikTok & LinkedIn tháng 12',
      description: '12 chủ đề xoay quanh tự động hóa vận hành bằng AI, kèm hook 3 giây đầu và CTA.',
      assignee: 'ai-marketing',
      priority: 'medium',
      deadline: '2026-11-22'
    });
  }

  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        if (!raw) return resolve({});
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('JSON body không hợp lệ'));
        }
      });
      req.on('error', reject);
    });
  }

  function sendJson(res, status, data) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data, null, 2));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const reqPath = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    try {
      // Serve Web Dashboard UI
      if (req.method === 'GET' && (reqPath === '/' || reqPath === '/index.html')) {
        if (fs.existsSync(PUBLIC_HTML)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(fs.readFileSync(PUBLIC_HTML, 'utf8'));
        }
        return sendJson(res, 404, { error: 'Chưa có file public/index.html' });
      }

      if (req.method === 'GET' && reqPath === '/api/health') {
        return sendJson(res, 200, { ok: true, mode: orchestrator.getMode() });
      }

      if (req.method === 'GET' && reqPath === '/api/agents') {
        return sendJson(res, 200, { agents: orchestrator.listAgents(), mode: orchestrator.getMode() });
      }

      if (req.method === 'POST' && reqPath === '/api/agents') {
        const body = await readJsonBody(req);
        const agent = orchestrator.addAgent(body);
        return sendJson(res, 201, { agent });
      }

      if (req.method === 'GET' && reqPath === '/api/tasks') {
        const status = url.searchParams.get('status') || undefined;
        const assignee = url.searchParams.get('assignee') || undefined;
        const overdueOnly = url.searchParams.get('overdue') === 'true';
        return sendJson(res, 200, {
          tasks: orchestrator.listTasks({ status, assignee, overdueOnly }),
          mode: orchestrator.getMode()
        });
      }

      if (req.method === 'POST' && reqPath === '/api/tasks') {
        const body = await readJsonBody(req);
        const task = orchestrator.createTask(body);
        return sendJson(res, 201, { task });
      }

      const taskMatch = reqPath.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch) {
        const id = decodeURIComponent(taskMatch[1]);
        if (req.method === 'GET') {
          return sendJson(res, 200, { task: orchestrator.getTask(id) });
        }
        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          const task = orchestrator.updateTaskStatus(id, body.status);
          return sendJson(res, 200, { task });
        }
        if (req.method === 'DELETE') {
          return sendJson(res, 200, orchestrator.deleteTask(id));
        }
      }

      const runMatch = reqPath.match(/^\/api\/tasks\/([^/]+)\/run$/);
      if (req.method === 'POST' && runMatch) {
        const task = await orchestrator.executeTask(decodeURIComponent(runMatch[1]));
        return sendJson(res, 200, { task });
      }

      const approveMatch = reqPath.match(/^\/api\/tasks\/([^/]+)\/approve$/);
      if (req.method === 'POST' && approveMatch) {
        const task = orchestrator.approveTask(decodeURIComponent(approveMatch[1]));
        return sendJson(res, 200, { task });
      }

      const reviseMatch = reqPath.match(/^\/api\/tasks\/([^/]+)\/revise$/);
      if (req.method === 'POST' && reviseMatch) {
        const body = await readJsonBody(req);
        const task = orchestrator.requestRevision(decodeURIComponent(reviseMatch[1]), body.feedback);
        return sendJson(res, 200, { task });
      }

      return sendJson(res, 404, { error: 'Endpoint không tồn tại' });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  });

  return { server, orchestrator };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createApp();
  server.listen(PORT, () => {
    console.log(`AI Workforce OS đang chạy tại http://localhost:${PORT}`);
  });
}
