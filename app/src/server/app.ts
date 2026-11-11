import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { registerRoutes } from "./routes";
import { registerMcp } from "./mcp";

export async function buildApp(options?:{staticAssets?:boolean}){
  const app=Fastify({
    logger:process.env.NODE_ENV!=="test",
    bodyLimit:64*1024,
    trustProxy:false,
  });
  await app.register(cookie);
  app.addHook("onSend",async(req,reply,payload)=>{
    reply.header("X-Content-Type-Options","nosniff");
    reply.header("Referrer-Policy","strict-origin-when-cross-origin");
    reply.header("X-Frame-Options","DENY");
    if(req.url.startsWith("/api/")||req.url.startsWith("/mcp")){
      reply.header("Cache-Control","no-store");
    }
    return payload;
  });
  registerRoutes(app);
  registerMcp(app);

  const assets=options?.staticAssets ?? true;
  if(assets){
    if(process.env.NODE_ENV==="production"){
      await app.register(fastifyStatic,{
        root:resolve("dist/client"),prefix:"/",wildcard:false,
        cacheControl:true,maxAge:"1h",
      });
      app.get("/*",async(req,reply)=>{
        if(req.url.startsWith("/api/"))return reply.code(404).send({
          success:false,error:{code:"ROUTE_NOT_FOUND"},
        });
        reply.header("Cache-Control","no-store");
        return reply.sendFile("index.html");
      });
    }else{
      // One Fastify process and one port, including Vite's HMR middleware.
      const {default:middie}=await import("@fastify/middie");
      await app.register(middie);
      const {createServer} = await import("vite");
      const vite=await createServer({
        configFile:resolve("vite.config.ts"),
        server:{middlewareMode:true},
        appType:"spa",
      });
      app.use((request,response,next)=>{
        if(request.url?.startsWith("/api/")||request.url?.startsWith("/mcp")){
          next();return;
        }
        vite.middlewares(request,response,next);
      });
      app.addHook("onClose",async()=>{await vite.close();});
    }
  }
  app.setNotFoundHandler((request,reply)=>{
    reply.code(404).send({success:false,error:{code:"ROUTE_NOT_FOUND"}});
  });
  return app;
}
