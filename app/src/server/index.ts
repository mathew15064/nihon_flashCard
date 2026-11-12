// MySQL-only boot: no database or .env file is created at startup.
export {};
const {prepareLocalStorage}=await import("../lib/bootstrap-storage.js");
prepareLocalStorage();
const {activateConfiguredMySQL}=await import("../db/mysql/runtime.js");
await activateConfiguredMySQL();
const {buildApp}=await import("./app.js");
const {showSetupInstructions}=await import("./installation.js");
const app=await buildApp();
showSetupInstructions();
const port=Number(process.env.PORT||3000);
const host=process.env.HOST||"127.0.0.1";
await app.listen({port,host});
const stop=async()=>{
  await app.close();
  process.exit(0);
};
process.once("SIGINT",stop);
process.once("SIGTERM",stop);
