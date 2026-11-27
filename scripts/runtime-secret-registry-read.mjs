// Provider name-only metadata; do not request values or print raw responses.
export async function readSecretRegistry(env,fetchImpl=fetch){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account||'')||typeof token!=='string'||!token.trim())throw Error('runtime secret registry credentials unavailable');
 const response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/founder-control-room/secrets',{
   method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('runtime secret registry request failed');
 const data=await response.json();
 if(data?.success!==true||!Array.isArray(data.result))throw Error('runtime secret registry response invalid');
 const names=new Set();
 for(const row of data.result){
   if(!row||typeof row.name!=='string'||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(row.name)||!['secret_text','secret_key'].includes(row.type)||Object.keys(row).some(k=>!['name','type'].includes(k))||names.has(row.name))throw Error('runtime secret registry metadata invalid');
   names.add(row.name);
 }
 return [...names].map(name=>({name}));
}
