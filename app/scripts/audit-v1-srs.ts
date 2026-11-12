import { auditV1Srs } from "../src/lib/legacy-srs-audit";

const args = process.argv.slice(2);
function parseArgs(): { source: string; target: string } {
  if (args.length !== 4 || args[0] !== "--source" || args[2] !== "--target" ||
      !args[1] || !args[3]) {
    throw new Error("READ_ONLY_USAGE: --source <v1-app.db> --target <fastify.sqlite>. --apply is intentionally unsupported.");
  }
  return { source: args[1], target: args[3] };
}
try {
  const { source, target } = parseArgs();
  const report = auditV1Srs(source, target);
  console.log(JSON.stringify(report, null, 2));
  // Exit 0 for a successful inspection even when blockers are present.
} catch (error) {
  console.error(error instanceof Error ? error.message : "V1_AUDIT_FAILED");
  process.exitCode = 1;
}
