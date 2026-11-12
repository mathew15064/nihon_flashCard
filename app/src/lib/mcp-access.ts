/**
 * Testing-only opt-in. A production build also needs an explicit second
 * acknowledgement, so an accidentally inherited flag cannot expose writes.
 * This is NOT authentication; do not enable it for real user data.
 */
export function mcpNoAuthEnabled(env:NodeJS.ProcessEnv=process.env):boolean {
  return env.NIHON_MCP_NO_AUTH==="true" &&
    (env.NODE_ENV!=="production" ||
      env.NIHON_MCP_NO_AUTH_PRODUCTION_TEST_ACK==="true");
}

export const MCP_READ_TOOLS=[
  "vocabulary_search","vocabulary_get","topics_list","lessons_list","lesson_get",
] as const;
export const MCP_WRITE_TOOLS=[
  ...MCP_READ_TOOLS,"topics_create","lessons_create",
  "lesson_add_vocabulary_batch","vocabulary_create_draft",
] as const;

/** Cost is proportional to DB work, including idempotent retries. */
export function mcpWriteCost(payload:unknown):number {
  if(Array.isArray(payload))
    return Math.min(1000,payload.reduce<number>((sum,item)=>sum+mcpWriteCost(item),0));
  if(!payload||typeof payload!=="object")return 0;
  const body=payload as {method?:unknown;params?:unknown};
  if(body.method!=="tools/call"||!body.params||
    typeof body.params!=="object"||Array.isArray(body.params))return 0;
  const params=body.params as {name?:unknown;arguments?:unknown};
  switch(params.name){
    case "vocabulary_create_draft":return 1;
    case "topics_create":
    case "lessons_create":return 10;
    case "lesson_add_vocabulary_batch":{
      const args=params.arguments;
      const items=args&&typeof args==="object"&&!Array.isArray(args)
        ?(args as {items?:unknown}).items:undefined;
      return Array.isArray(items)?Math.max(1,Math.min(items.length,101)):101;
    }
    default:return 0;
  }
}

/** Fail-closed, process-local grant: anonymous clients can never edit
 * a pre-existing Admin lesson by guessing its ID or title. No credential
 * means distinct anonymous clients cannot be distinguished from each other.
 */
export class AnonymousMcpLessons {
  private readonly ids=new Set<string>();
  constructor(private readonly maxLessons=1024){
    if(!Number.isSafeInteger(maxLessons)||maxLessons<1)
      throw new RangeError("maxLessons must be a positive integer");
  }
  has(id:string):boolean{return this.ids.has(id);}
  canCreate():boolean{return this.ids.size<this.maxLessons;}
  allow(id:string,created:boolean):boolean {
    if(this.ids.has(id))return true;
    if(!created||!this.canCreate())return false;
    this.ids.add(id);
    return true;
  }
  clear():void{this.ids.clear();}
}
