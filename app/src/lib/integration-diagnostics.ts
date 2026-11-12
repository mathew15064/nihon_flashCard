/**
 * Safe, non-generating check of the stored OpenAI credential and configured model.
 * This does not submit vocabulary data or call the billable Responses endpoint.
 * Never return, log, or persist the API key or upstream response body.
 */
export type AIProbeCode=
  "OK"|"AI_NOT_CONFIGURED"|"AI_KEY_INVALID"|"AI_ACCESS_FORBIDDEN"|
  "AI_MODEL_NOT_FOUND"|"AI_RATE_LIMITED"|"AI_PROVIDER_UNAVAILABLE"|
  "AI_CONNECTION_FAILED"|"AI_VERIFICATION_TIMEOUT"|"AI_MODEL_INVALID"|
  "AI_VERIFICATION_RESPONSE_INVALID";

export type AIProbeResult={
  verified:boolean;
  code:AIProbeCode;
  model:string;
  checkedAt:string;
  check:"model_access_only";
};
const MODEL=/^[a-z0-9][a-z0-9._-]{1,99}$/i;

export async function verifyOpenAIModelAccess(
  key:string|undefined,
  model:string,
  fetcher:typeof fetch=fetch,
):Promise<AIProbeResult>{
  const result=(code:AIProbeCode):AIProbeResult=>({
    verified:code==="OK",code,model,checkedAt:new Date().toISOString(),
    check:"model_access_only",
  });
  if(!key)return result("AI_NOT_CONFIGURED");
  if(!MODEL.test(model))return result("AI_MODEL_INVALID");
  try{
    const response=await fetcher(
      "https://api.openai.com/v1/models/"+encodeURIComponent(model),{
        method:"GET",
        headers:{
          authorization:"Bearer "+key,
          accept:"application/json",
          "cache-control":"no-store",
        },
        redirect:"error",
        signal:AbortSignal.timeout(8000),
      },
    );
    if(response.status===401)return result("AI_KEY_INVALID");
    if(response.status===403)return result("AI_ACCESS_FORBIDDEN");
    if(response.status===404)return result("AI_MODEL_NOT_FOUND");
    if(response.status===429)return result("AI_RATE_LIMITED");
    if(!response.ok)return result("AI_PROVIDER_UNAVAILABLE");
    // Model metadata must match the configured ID; do not trust upstream
    // text or echo provider error contents into the Admin UI.
    const contentLength=Number(response.headers.get("content-length")||0);
    if(contentLength>16*1024)return result("AI_VERIFICATION_RESPONSE_INVALID");
    const body:unknown=await response.json();
    if(!body||typeof body!=="object")return result("AI_VERIFICATION_RESPONSE_INVALID");
    const value=body as Record<string,unknown>;
    return result(value.object==="model"&&value.id===model
      ?"OK":"AI_VERIFICATION_RESPONSE_INVALID");
  }catch(error){
    if(error instanceof Error &&
      (error.name==="TimeoutError"||error.name==="AbortError"))
      return result("AI_VERIFICATION_TIMEOUT");
    return result("AI_CONNECTION_FAILED");
  }
}
