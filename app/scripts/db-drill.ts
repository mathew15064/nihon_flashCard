import { resolve } from "node:path";
import { drillNihonBackup } from "../src/lib/sqlite-drill";

async function main() {
  const flags=process.argv.slice(2);
  if (flags.length !== 4 || flags[0] !== "--source" ||
      flags[2] !== "--scratch-dir" || !flags[1] || !flags[3]) {
    throw new Error("READ_ONLY_DRILL_USAGE: --source <nihon.sqlite> --scratch-dir <existing-private-dir>");
  }
  const source=resolve(flags[1]!);
  const scratchRoot=resolve(flags[3]!);
  const result=await drillNihonBackup(source,scratchRoot,resolve("src/db/migrations"));
  console.log(JSON.stringify(result));
}
await main().catch(error=>{
  console.error(error instanceof Error?error.message:"DRILL_FAILED");
  process.exitCode=1;
});
