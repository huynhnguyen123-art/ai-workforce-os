import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskOrchestrator, TASK_STATUS } from '../src/orchestrator.mjs';

test('Auto-routing giao đúng nhân viên AI dựa trên nội dung công việc', () => {
  const orch = new TaskOrchestrator();

  const mktTask = orch.createTask({ title: 'Viết bài SEO và email marketing ra mắt sản phẩm' });
  assert.equal(mktTask.assignee, 'ai-marketing');

  const cskhTask = orch.createTask({ title: 'Xử lý ticket khiếu nại khách hàng về thanh toán' });
  assert.equal(cskhTask.assignee, 'ai-cskh');

  const devTask = orch.createTask({ title: 'Sửa lỗi API backend và viết unit test' });
  assert.equal(devTask.assignee, 'ai-dev');

  const opsTask = orch.createTask({ title: 'Tổng hợp báo cáo KPI vận hành tháng 11' });
  assert.equal(opsTask.assignee, 'ai-ops');
});

test('Vòng đời Kanban: Backlog -> In Progress -> Review -> Done', async () => {
  const orch = new TaskOrchestrator();
  const task = orch.createTask({
    title: 'Thiết kế API quản lý đơn hàng',
    description: 'Cần có xác thực token và xử lý retry',
    priority: 'high',
    deadline: '2026-11-30'
  });

  assert.equal(task.status, TASK_STATUS.BACKLOG);

  const reviewed = await orch.executeTask(task.id);
  assert.equal(reviewed.status, TASK_STATUS.REVIEW);
  assert.equal(reviewed.progress, 100);
  assert.ok(reviewed.qaScore >= 80);
  assert.ok(reviewed.deliverable.length > 0);

  const done = orch.approveTask(task.id);
  assert.equal(done.status, TASK_STATUS.DONE);
});

test('Yêu cầu chỉnh sửa (Revision) đưa task về Backlog và lưu feedback', async () => {
  const orch = new TaskOrchestrator();
  const task = orch.createTask({ title: 'Viết bài Facebook giới thiệu dịch vụ' });
  await orch.executeTask(task.id);

  const revised = orch.requestRevision(task.id, 'Thêm bảng so sánh giá');
  assert.equal(revised.status, TASK_STATUS.BACKLOG);
  assert.equal(revised.progress, 0);
  assert.match(revised.description, /Thêm bảng so sánh giá/);
});

test('Thêm AI Agent tùy chỉnh, lưu xuống đĩa và khôi phục dữ liệu', () => {
  const tmpFile = path.join(os.tmpdir(), `workforce-test-${Date.now()}.json`);
  try {
    const orch1 = new TaskOrchestrator({ storagePath: tmpFile });
    const saleAgent = orch1.addAgent({
      name: 'AI Sale',
      role: 'Báo giá & Chốt đơn',
      keywords: 'báo giá, hợp đồng, lead'
    });
    assert.equal(saleAgent.id, 'ai-sale');

    const task = orch1.createTask({ title: 'Gửi báo giá và hợp đồng cho khách Enterprise' });
    assert.equal(task.assignee, 'ai-sale');

    orch1.updateTaskStatus(task.id, TASK_STATUS.REVIEW);

    // Reload from disk in a fresh instance
    const orch2 = new TaskOrchestrator({ storagePath: tmpFile });
    assert.ok(orch2.listAgents().some((a) => a.id === 'ai-sale'));
    assert.equal(orch2.getTask(task.id).status, TASK_STATUS.REVIEW);

    orch2.deleteTask(task.id);
    assert.equal(orch2.listTasks().length, 0);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});
