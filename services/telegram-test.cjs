'use strict';
async function main(){
  if(process.env.TELEGRAM_ENABLED!=='true'||!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_CHAT_ID)throw Error('TELEGRAM_NOT_CONFIGURED');
  const response=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text:'✅ KẾT NỐI HỘP THUỐC THÀNH CÔNG\nĐây là tin nhắn kiểm tra kết nối Telegram từ máy chủ hộp thuốc của bạn.\nĐây không phải cảnh báo sự cố hay xác nhận ESP32 đang online.'}),
    signal:AbortSignal.timeout(10000)
  });
  const result=await response.json();
  if(!response.ok||result.ok!==true)throw Error('TELEGRAM_TEST_FAILED');
  console.log(JSON.stringify({sent:true,messageId:result.result.message_id}));
}
main().catch(()=>{console.error('TELEGRAM_TEST_FAILED');process.exit(1);});
