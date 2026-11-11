import { config } from "dotenv";
import { resolve } from "node:path";

// Load secrets before importing the SQLite client or application modules.
config({path:resolve(".env.local"),quiet:true});
const {buildApp}=await import("./app.js");
const app=await buildApp();
const port=Number(process.env.PORT||3000);
const host=process.env.HOST||"127.0.0.1";
await app.listen({port,host});
const stop=async()=>{
  await app.close();
  process.exit(0);
};
process.once("SIGINT",stop);
process.once("SIGTERM",stop);
