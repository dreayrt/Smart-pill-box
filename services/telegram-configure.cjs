'use strict';
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Điền TELEGRAM_BOT_TOKEN trong services/.env trước; không gửi token vào chat.');
  async function request(method) {
    let response;
    try { response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},
      body:JSON.stringify(method==='getUpdates'?{timeout:2,allowed_updates:['message','channel_post']}:{ }),
      signal:AbortSignal.timeout(10000)
    }); }
    catch { throw new Error('Không kết nối được Telegram.'); }
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error('Telegram từ chối yêu cầu; kiểm tra token và trạng thái webhook của bot.');
    return data.result;
  }
  await request('getMe');
  const updates = await request('getUpdates');
  const chats = new Map();
  for (const update of updates) {
    const chat = (update.message || update.channel_post)?.chat;
    if (chat) chats.set(String(chat.id),chat);
  }
  const wanted = process.env.TELEGRAM_CHAT_ID;
  if (!chats.size) throw new Error('Chưa nhận được tin từ chat. Gửi ketnoi trực tiếp cho bot rồi chạy lại.');
  if (wanted) {
    if (!chats.has(wanted)) throw new Error('Chưa thấy chat đã chọn trong getUpdates. Nhắn /start hoặc một tin mới cho bot rồi chạy lại.');
  } else if (chats.size !== 1) throw new Error('Cần đúng một chat gửi tin cho bot, hoặc điền TELEGRAM_CHAT_ID của chat muốn nhận. Không tự chọn khi có nhiều chat.');
  const id = wanted || chats.keys().next().value;
  const file = path.join(__dirname,'.env');
  let content = fs.readFileSync(file,'utf8');
  content = content.replace(/^TELEGRAM_CHAT_ID=.*$/m,`TELEGRAM_CHAT_ID=${id}`).replace(/^TELEGRAM_ENABLED=.*$/m,'TELEGRAM_ENABLED=true');
  fs.writeFileSync(file,content,{mode:0o600});
  console.log('Đã xác minh bot và lưu chat nhận trong cấu hình riêng. Khởi động lại dịch vụ để nhận cảnh báo; bước này chưa gửi tin nhắn.');
}
main().catch(error=>{ console.error(error.message); process.exitCode=1; });
