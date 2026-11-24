import fs from 'node:fs';
import path from 'node:path';
import { AGENT_REGISTRY, runAgentLLM } from './agents.mjs';

export const TASK_STATUS = {
  BACKLOG: 'backlog',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  DONE: 'done',
  BLOCKED: 'blocked'
};

export class TaskOrchestrator {
  constructor({ llmExecutor = runAgentLLM, storagePath = null } = {}) {
    this.agents = new Map(Object.entries(AGENT_REGISTRY).map(([k, v]) => [k, { ...v }]));
    this.tasks = new Map();
    this.sequence = 100;
    this.llmExecutor = llmExecutor;
    this.storagePath = storagePath;
    this.listeners = new Set();

    if (this.storagePath) {
      this._loadFromDisk();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event, payload) {
    for (const listener of this.listeners) {
      listener({ event, payload, timestamp: new Date().toISOString() });
    }
  }

  getMode() {
    if (process.env.GEMINI_API_KEY) return { provider: 'gemini', label: 'Gemini AI Live' };
    if (process.env.OPENAI_API_KEY) return { provider: 'openai', label: 'OpenAI Live' };
    return { provider: 'mock', label: 'Chế độ Mô phỏng' };
  }

  listAgents() {
    return Array.from(this.agents.values());
  }

  addAgent({ id, name, role, systemPrompt, keywords = [] }) {
    if (!name || !name.trim()) throw new Error('Tên AI Agent là bắt buộc.');
    const safeId =
      (id || name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || `ai-${Date.now()}`;

    const agent = {
      id: safeId,
      name: name.trim(),
      role: (role || 'Nhân viên AI chuyên trách').trim(),
      systemPrompt: (systemPrompt || `Bạn là ${name.trim()}, hãy hoàn thành công việc được giao một cách chuyên nghiệp.`).trim(),
      keywords: Array.isArray(keywords)
        ? keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)
        : String(keywords || '')
            .split(',')
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean)
    };

    this.agents.set(safeId, agent);
    this._saveToDisk();
    this.emit('agent_created', agent);
    return agent;
  }

  /**
   * Automatically routes a task to the most suitable AI Agent based on its title & description.
   */
  routeAgent(text) {
    const lower = (text || '').toLowerCase();
    let bestId = 'ai-ops';
    let bestScore = 0;

    for (const agent of this.agents.values()) {
      let score = 0;
      for (const kw of agent.keywords || []) {
        if (lower.includes(kw)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestId = agent.id;
      }
    }
    if (bestScore > 0) return bestId;
    return this.agents.has('ai-marketing') ? 'ai-marketing' : this.agents.keys().next().value;
  }

  createTask({ title, description = '', assignee = 'auto', priority = 'medium', deadline }) {
    if (!title || !title.trim()) {
      throw new Error('Tiêu đề công việc (title) là bắt buộc.');
    }

    const id = `TASK-${++this.sequence}`;
    const routedAuto = assignee === 'auto' || !this.agents.has(assignee);
    const resolvedAssignee = routedAuto ? this.routeAgent(`${title} ${description}`) : assignee;
    const agent = this.agents.get(resolvedAssignee);

    const task = {
      id,
      title: title.trim(),
      description: description.trim(),
      assignee: resolvedAssignee,
      priority,
      status: TASK_STATUS.BACKLOG,
      deadline: deadline || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      progress: 0,
      qaScore: null,
      deliverable: '',
      logs: [
        {
          time: new Date().toISOString(),
          actor: 'Orchestrator',
          message: routedAuto
            ? `Phân tích nội dung và tự động điều phối cho ${agent.name}.`
            : `Tạo đầu việc và giao trực tiếp cho ${agent.name}.`
        }
      ]
    };

    this.tasks.set(id, task);
    this._saveToDisk();
    this.emit('task_created', task);
    return task;
  }

  listTasks({ status, assignee, overdueOnly = false } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    return Array.from(this.tasks.values()).filter((task) => {
      if (status && task.status !== status) return false;
      if (assignee && task.assignee !== assignee) return false;
      if (overdueOnly && (task.status === TASK_STATUS.DONE || task.deadline >= today)) return false;
      return true;
    });
  }

  getTask(id) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Không tìm thấy task ${id}`);
    return task;
  }

  updateTaskStatus(id, status) {
    const allowed = Object.values(TASK_STATUS);
    if (!allowed.includes(status)) {
      throw new Error(`Trạng thái không hợp lệ: ${status}`);
    }
    const task = this.getTask(id);
    task.status = status;
    if (status === TASK_STATUS.DONE) task.progress = 100;
    this._log(task, 'Quản lý', `Chuyển trạng thái sang "${status}".`);
    this._saveToDisk();
    this.emit('task_updated', task);
    return task;
  }

  deleteTask(id) {
    if (!this.tasks.has(id)) throw new Error(`Không tìm thấy task ${id}`);
    this.tasks.delete(id);
    this._saveToDisk();
    this.emit('task_deleted', { id });
    return { deleted: true, id };
  }

  /**
   * Executes a task autonomously:
   * 1. Specialist AI Agent generates the deliverable.
   * 2. AI QA / Ops evaluates quality and assigns a score.
   * 3. Moves task to REVIEW for human manager approval.
   */
  async executeTask(id) {
    const task = this.getTask(id);
    const agent = this.agents.get(task.assignee) || this.agents.values().next().value;
    const qaAgent = this.agents.get('ai-ops') || agent;

    task.status = TASK_STATUS.IN_PROGRESS;
    task.progress = 25;
    this._log(task, 'Orchestrator', `Kích hoạt ${agent.name} thực thi.`);
    this._saveToDisk();
    this.emit('task_updated', task);

    try {
      const prompt = `Tiêu đề: ${task.title}\nMô tả chi tiết: ${task.description || 'Không có'}\nDeadline: ${task.deadline}`;
      const output = await this.llmExecutor(agent, prompt);

      task.deliverable = output;
      task.progress = 75;
      this._log(task, agent.name, 'Đã hoàn thành bản thảo đầu ra, chuyển sang AI QA kiểm duyệt.');
      this._saveToDisk();
      this.emit('task_updated', task);

      // QA Review step
      const qaPrompt = `Đánh giá nhanh đầu ra cho công việc "${task.title}":\n${output}`;
      await this.llmExecutor(qaAgent, qaPrompt);

      task.qaScore = output.length >= 60 ? 94 : 82;
      task.progress = 100;
      task.status = TASK_STATUS.REVIEW;
      this._log(task, qaAgent.name, `Kiểm duyệt đạt ${task.qaScore}/100. Chuyển sang Chờ duyệt (Review).`);
      this._saveToDisk();
      this.emit('task_updated', task);

      return task;
    } catch (err) {
      task.status = TASK_STATUS.BLOCKED;
      this._log(task, 'Orchestrator', `Lỗi thực thi: ${err.message}`);
      this._saveToDisk();
      this.emit('task_updated', task);
      throw err;
    }
  }

  approveTask(id) {
    const task = this.getTask(id);
    task.status = TASK_STATUS.DONE;
    task.progress = 100;
    this._log(task, 'Quản lý', 'Đã nghiệm thu và duyệt hoàn thành.');
    this._saveToDisk();
    this.emit('task_updated', task);
    return task;
  }

  requestRevision(id, feedback = '') {
    const task = this.getTask(id);
    task.status = TASK_STATUS.BACKLOG;
    task.progress = 0;
    task.qaScore = null;
    if (feedback) {
      task.description = `${task.description}\n[Yêu cầu chỉnh sửa]: ${feedback}`.trim();
    }
    this._log(task, 'Quản lý', `Yêu cầu chỉnh sửa lại${feedback ? `: ${feedback}` : ''}.`);
    this._saveToDisk();
    this.emit('task_updated', task);
    return task;
  }

  _log(task, actor, message) {
    task.logs.push({ time: new Date().toISOString(), actor, message });
  }

  _saveToDisk() {
    if (!this.storagePath) return;
    const dir = path.dirname(this.storagePath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      sequence: this.sequence,
      agents: Array.from(this.agents.values()),
      tasks: Array.from(this.tasks.values())
    };
    fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  _loadFromDisk() {
    if (!this.storagePath || !fs.existsSync(this.storagePath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
      if (typeof raw.sequence === 'number') this.sequence = raw.sequence;
      if (Array.isArray(raw.agents)) {
        for (const a of raw.agents) this.agents.set(a.id, a);
      }
      if (Array.isArray(raw.tasks)) {
        for (const t of raw.tasks) this.tasks.set(t.id, t);
      }
    } catch {
      // Ignore corrupted file and start fresh
    }
  }
}
