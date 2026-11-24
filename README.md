# AI Workforce OS — Hệ thống Giao việc Multi-Agent

Ứng dụng web quản lý & điều phối đội ngũ **nhân viên ảo AI** (`AI Marketing`, `AI CSKH`, `AI Dev`, `AI QA / Ops`, và tự thêm AI Agent mới) với **Kanban kéo-thả**, **Danh sách**, **Theo dõi Deadline**, tự động định tuyến và lưu dữ liệu bền vững vào `data/workforce.json`.

## Yêu cầu
- Node.js >= 20 (không cần cài thêm thư viện ngoài).

## Cách chạy

### 1. Chạy ngay ở chế độ mô phỏng (không cần API key)
```bash
npm start
```

### 2. Chạy với AI thật (Gemini hoặc OpenAI)
```bash
# Dùng Google Gemini
GEMINI_API_KEY="your-gemini-key" npm start

# Hoặc dùng OpenAI
OPENAI_API_KEY="your-openai-key" npm start
```

Mặc định ứng dụng chạy trên cổng `3080` (có thể đổi bằng biến môi trường `PORT=4000`).

## Kiểm thử tự động
```bash
npm test
```

## REST API chính
- `GET /api/agents` — Danh sách nhân viên ảo AI
- `POST /api/agents` — Tuyển thêm AI Agent mới (`name`, `role`, `keywords`, `systemPrompt`)
- `GET /api/tasks` — Danh sách công việc (hỗ trợ lọc `?status=`, `?assignee=`, `?overdue=true`)
- `POST /api/tasks` — Tạo việc mới (đặt `assignee: "auto"` để Orchestrator tự phân công)
- `PATCH /api/tasks/:id` — Cập nhật trạng thái Kanban
- `POST /api/tasks/:id/run` — Kích hoạt AI Agent thực thi & AI QA kiểm duyệt
- `POST /api/tasks/:id/approve` — Duyệt hoàn thành
- `POST /api/tasks/:id/revise` — Yêu cầu làm lại kèm `feedback`
- `DELETE /api/tasks/:id` — Xóa đầu việc

---

## Kết nối dưới dạng MCP Server (Antigravity / Claude Desktop / Cursor)

Dự án đã tích hợp sẵn **MCP Server (`src/mcp-server.mjs`)** theo chuẩn JSON-RPC 2.0 qua `stdio` (không cần cài thêm thư viện ngoài), cung cấp 7 công cụ giao việc:
- `list_agents` / `add_agent`
- `list_tasks` / `assign_task` / `run_task`
- `update_task_status` / `approve_or_revise_task`

Sao chép cấu hình từ [mcp-config.example.json](mcp-config.example.json) vào mục **MCP Servers** của ứng dụng AI của bạn:

```json
{
  "mcpServers": {
    "ai-workforce-os": {
      "command": "node",
      "args": ["/duong-dan-den/ai-workforce-os/src/mcp-server.mjs"],
      "env": {
        "DATA_FILE": "/duong-dan-den/ai-workforce-os/data/workforce.json"
      }
    }
  }
}
```
