const { spawn } = require('node:child_process');
const path = require('node:path');
const { start } = require('./server.cjs');
async function main() {
  const service = await start();
  const children = ['viewer','caregiver'].map(mode => spawn(process.execPath,[path.join(__dirname,'nodered/start.cjs'),mode],
    { stdio:'inherit',windowsHide:true,env:process.env }));
  let closing = false;
  async function close(code = 0) {
    if(closing) return; closing = true;
    children.forEach(child => child.kill());
    await service.close(); process.exitCode = code;
  }
  children.forEach(child => child.on('exit',code => { if(!closing) close(code || 0); }));
  process.on('SIGINT',()=>close()); process.on('SIGTERM',()=>close());
}
main().catch(error=>{console.error(error.message);process.exit(1);});
