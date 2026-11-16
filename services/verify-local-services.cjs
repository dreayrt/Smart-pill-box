async function main(){
  let health;
  for(let i=0;i<15;i++){
    try{const r=await fetch('http://127.0.0.1:8787/health');if(r.ok){health=await r.json();break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!health)throw new Error('BACKEND_NOT_READY');
  const status={backend:true,telegramConfigured:health.telegramConfigured};
  for(const [role,port]of[['viewer',1880],['caregiver',1881]]){
    const password=process.env[`NODERED_${role.toUpperCase()}_PASSWORD`];
    const response=await fetch(`http://127.0.0.1:${port}/dashboard/_setup`,{headers:{Authorization:'Basic '+Buffer.from(`${role}:${password}`).toString('base64')}});
    status[role+'Dashboard']=response.ok;
    const denied=await fetch(`http://127.0.0.1:${port}/dashboard/_setup`);status[role+'AnonymousDenied']=denied.status===401;
  }
  if(!status.viewerDashboard||!status.caregiverDashboard||!status.viewerAnonymousDenied||!status.caregiverAnonymousDenied)throw new Error('DASHBOARD_CHECK_FAILED');
  console.log(JSON.stringify(status));
}
main().catch(error=>{console.error(error.message?.match(/^[A-Z_]+$/)?.[0]||'LOCAL_CHECK_FAILED');process.exit(1);});
