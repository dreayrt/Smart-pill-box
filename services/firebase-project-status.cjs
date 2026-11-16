const { getCredential } = require('./firebase-credential.cjs');
async function main() {
  const { access_token } = await getCredential().getAccessToken();
  const headers = { Authorization:`Bearer ${access_token}` };
  const project = process.env.FIREBASE_PROJECT_ID;
  const config = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,{headers});
  const data = await config.json();
  const billing = await fetch(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`,{headers});
  const b = await billing.json();
  console.log(JSON.stringify({authStatus:config.status,authSubtype:data.subtype,emailEnabled:data.signIn?.email?.enabled,billingStatus:billing.status,billingEnabled:b.billingEnabled}));
}
main().catch(()=>{console.error('PROJECT_STATUS_FAILED');process.exit(1);});
