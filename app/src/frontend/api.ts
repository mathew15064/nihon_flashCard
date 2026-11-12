export type ApiResponse<T>={success:boolean;data?:T;duplicate?:boolean;error?:{code:string;details?:unknown}};
export async function api<T>(path:string, options:RequestInit={}):Promise<T>{
  const result=await fetch(path,{
    ...options,cache:"no-store",credentials:"same-origin",
    headers:{...(options.body?{"content-type":"application/json"}:{}),...options.headers},
  });
  const payload=await result.json() as ApiResponse<T>;
  if(!result.ok || !payload.success || payload.data===undefined){
    throw new Error(payload.error?.code ?? "REQUEST_FAILED");
  }
  return payload.data;
}
export const write=<T=unknown>(path:string,data:unknown,method="POST"):Promise<T>=>api<T>(path,{
  method,body:JSON.stringify(data),
});
