const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {getCredential}=require('../../services/firebase-credential.cjs');
test('CLI credential selects the explicit account and refreshes with its granted scopes',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pillbox-credential-'));
  const moduleFile=path.join(directory,'auth.js');
  try{
    fs.writeFileSync(moduleFile,`exports.getAllAccounts=()=>[
      {user:{email:'wrong@example.test'},tokens:{refresh_token:'wrong',access_token:'wrong-token',expires_at:Date.now()+3600000}},
      {user:{email:'right@example.test'},tokens:{refresh_token:'right',scope:'scope-one scope-two',expires_at:0}}
    ];
    exports.getAccessToken=async(token,scopes)=>{if(token!=='right'||scopes.join(',')!=='scope-one,scope-two')throw Error('WRONG_ACCOUNT');return{access_token:'synthetic-token',expires_at:Date.now()+3600000};};`);
    const credential=getCredential({FIREBASE_CLI_ACCOUNT:'right@example.test',FIREBASE_TOOLS_LIB:directory});
    assert.equal((await credential.getAccessToken()).access_token,'synthetic-token');
    await assert.rejects(getCredential({FIREBASE_CLI_ACCOUNT:'absent@example.test',FIREBASE_TOOLS_LIB:directory}).getAccessToken());
  }finally{
    delete require.cache[moduleFile];
    const resolved=path.resolve(directory);
    if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('pillbox-credential-'))throw Error('UNSAFE_CLEANUP_PATH');
    fs.rmSync(resolved,{recursive:true});
  }
});
