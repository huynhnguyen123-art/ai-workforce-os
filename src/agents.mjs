/**
 * Registry of Virtual Employee AI Agents and LLM Execution Adapter.
 * Supports Gemini API (GEMINI_API_KEY), OpenAI API (OPENAI_API_KEY),
 * or falls back to a deterministic offline executor for local testing.
 */

export const AGENT_REGISTRY = {
  'ai-marketing': {
    id: 'ai-marketing',
    name: 'AI Marketing',
    role: 'Content, SEO & Chiến dịch',
    systemPrompt:
      'Bạn là nhân viên AI Marketing chuyên nghiệp. Hãy tạo kế hoạch nội dung, bài viết SEO, email marketing hoặc kịch bản truyền thông rõ ràng, có cấu trúc và CTA cụ thể.',
    keywords: ['marketing', 'bài viết', 'seo', 'facebook', 'email', 'chiến dịch', 'quảng cáo', 'content', 'video', 'social']
  },
  'ai-cskh': {
    id: 'ai-cskh',
    name: 'AI CSKH',
    role: 'Ticket, Phản hồi & FAQ',
    systemPrompt:
      'Bạn là nhân viên AI Chăm sóc khách hàng. Hãy phân loại yêu cầu, soạn phản hồi lịch sự, đồng cảm, đúng chính sách và đề xuất cập nhật FAQ.',
    keywords: ['khách hàng', 'cskh', 'ticket', 'khiếu nại', 'phản hồi', 'faq', 'hỗ trợ', 'tư vấn', 'chat']
  },
  'ai-dev': {
    id: 'ai-dev',
    name: 'AI Dev',
    role: 'Code, Bugfix & API',
    systemPrompt:
      'Bạn là kỹ sư phần mềm AI. Hãy phân tích yêu cầu kỹ thuật, thiết kế API/code sạch, xử lý lỗi, bảo mật và đề xuất test cases.',
    keywords: ['code', 'api', 'bug', 'lỗi', 'web', 'database', 'dev', 'test', 'pr', 'tính năng', 'backend', 'frontend']
  },
  'ai-ops': {
    id: 'ai-ops',
    name: 'AI QA / Ops',
    role: 'Kiểm duyệt & Báo cáo KPI',
    systemPrompt:
      'Bạn là chuyên viên AI QA & Vận hành. Hãy kiểm tra chất lượng đầu ra theo tiêu chí rõ ràng, chấm điểm 0-100 và tổng hợp báo cáo KPI.',
    keywords: ['báo cáo', 'kpi', 'qa', 'kiểm duyệt', 'quy trình', 'sop', 'vận hành', 'audit', 'chi phí']
  }
};

/**
 * Calls an external LLM if configured via environment variables,
 * otherwise runs a deterministic local simulation so the system works out-of-the-box.
 */
export async function runAgentLLM(agent, prompt) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: agent.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });
    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '(Không có nội dung phản hồi)';
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: agent.systemPrompt },
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '(Không có nội dung phản hồi)';
  }

  // Deterministic offline mode (no API key required)
  return `[${agent.name} - Chế độ chạy thử cục bộ]\nĐã tiếp nhận yêu cầu:\n${prompt}\n\nKết quả bàn giao:\n1. Phân tích mục tiêu và phạm vi công việc.\n2. Triển khai bản thảo hoàn chỉnh theo vai trò ${agent.role}.\n3. Sẵn sàng chuyển sang bước AI QA kiểm duyệt.`;
}
