import { importLegacyVocabulary } from "./legacy-import";

function parseArgs(argv: string[]) {
  const options: {sourcePath?: string; targetPath?: string; apply: boolean; allowSkips: boolean} =
    {apply: false, allowSkips: false};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--allow-skips") options.allowSkips = true;
    else if (arg === "--source" && argv[i + 1]) options.sourcePath = argv[++i];
    else if (arg === "--target" && argv[i + 1]) options.targetPath = argv[++i];
    else throw new Error("Unknown/missing CLI argument: " + arg);
  }
  if (!options.sourcePath || !options.targetPath) {
    throw new Error("Usage: npm run import:legacy -- --source /path/to/app.db --target /path/to/nihon.sqlite [--apply] [--allow-skips]");
  }
  return {sourcePath: options.sourcePath, targetPath: options.targetPath,
    apply: options.apply, allowSkips: options.allowSkips};
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await importLegacyVocabulary(options);
  console.log(JSON.stringify(report, null, 2));
  if (report.skippedInvalid) process.exitCode = options.apply && options.allowSkips ? 0 : 2;
}

main().catch((error) => {
  console.error("Legacy migration failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
