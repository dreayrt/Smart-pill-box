const fs=require('node:fs');
const mqtt=require('mqtt');
async function main(){
  const client=await mqtt.connectAsync(`mqtts://${process.env.MQTT_HOST||'127.0.0.1'}:${process.env.MQTT_PORT||8883}`,{
    username:'pillbox-nhom13',password:process.env.MQTT_DEVICE_PASSWORD,clientId:`pillbox-check-${Date.now()}`,
    ca:fs.readFileSync(process.env.MQTT_TLS_CERT),rejectUnauthorized:true,reconnectPeriod:0,connectTimeout:5000
  });
  try{
    const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('NO_CONFIG_RECEIVED')),5000);
      client.on('message',(topic,buffer)=>{try{const data=JSON.parse(buffer);if(data.deviceId==='pillbox-nhom13'&&data.compartments){clearTimeout(timer);resolve(data);}}catch{}});});
    await client.subscribeAsync('pillbox/pillbox-nhom13/config',{qos:1});
    const config=await received;
    console.log(JSON.stringify({mqttTlsConnected:true,desiredConfigReceived:true,compartmentIds:Object.keys(config.compartments)}));
  }finally{await client.endAsync();}
}
main().catch(()=>{console.error('LIVE_MQTT_CHECK_FAILED');process.exit(1);});
