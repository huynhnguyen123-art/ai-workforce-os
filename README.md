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
