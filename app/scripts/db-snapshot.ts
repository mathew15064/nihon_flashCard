import { verifiedSqliteCopy } from "../src/lib/sqlite-snapshot";

async function main() {
  const [operation, ...flags] = process.argv.slice(2);
  if (operation !== "backup" && operation !== "restore") {
    throw new Error("Usage: db-snapshot.mjs <backup|restore> --source <existing.sqlite> --target <new.sqlite>");
  }
  const getFlag = (name: string) => {
    const index = flags.indexOf(name);
    return index >= 0 ? flags[index + 1] : undefined;
  };
  const source = getFlag("--source");
  const target = getFlag("--target");
  if (!source || !target) {
    throw new Error("Both --source and --target paths are required");
  }
  // Restore is a verified copy into a NEW database, not a live DB replacement.
  const result = await verifiedSqliteCopy(source, target);
  console.log(JSON.stringify({ operation, destination: target, ...result }));
}

await main().catch(error => {
  console.error(error instanceof Error ? error.message : "SQLITE_SNAPSHOT_FAILED");
  process.exitCode = 1;
});
