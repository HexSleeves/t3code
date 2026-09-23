// Rebrands an upstream V2 checkout so its desktop build installs beside the
// regular T3 Code app instead of replacing it or sharing its state.
//
// Usage: node patch-v2.mjs <path-to-upstream-checkout>
//
// Every replacement must match exactly once. If upstream moves any of these
// lines the build fails here, rather than silently shipping an app that
// migrates ~/.t3/userdata to the V2 schema.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: node patch-v2.mjs <checkout>");
  process.exit(2);
}

const edits = [
  {
    // Separate macOS bundle id, so it installs next to T3 Code instead of over it.
    file: "scripts/build-desktop-artifact.ts",
    from: 'const DESKTOP_APP_ID = "com.t3tools.t3code";',
    to: 'const DESKTOP_APP_ID = "com.t3tools.t3code.v2";',
  },
  {
    // Nightly-style versions drive the updater; only the visible name changes.
    file: "scripts/build-desktop-artifact.ts",
    from: '"T3 Code (Nightly)"',
    to: '"T3 Code (V2)"',
  },
  {
    file: "apps/desktop/src/app/DesktopEnvironment.ts",
    from: '? "Nightly" : "Alpha"',
    to: '? "V2" : "Alpha"',
  },
  {
    // Own Chromium profile, and therefore its own single-instance lock. The
    // legacy name points nowhere so nothing is migrated from another install.
    file: "apps/desktop/src/app/DesktopUserData.ts",
    from: '{ current: "t3code-v2", legacy: "T3 Code (Alpha)" }',
    to: '{ current: "t3code-orchestration-v2", legacy: "t3code-orchestration-v2-no-legacy" }',
  },
  {
    // T3 home: ~/.t3-v2 instead of ~/.t3, so the one-way V2 migration never
    // touches the regular app's database.
    file: "apps/desktop/src/app/DesktopStatePaths.ts",
    from: 'input.joinPath(input.homeDirectory, ".t3"),',
    to: 'input.joinPath(input.homeDirectory, ".t3-v2"),',
  },
  {
    file: "apps/server/src/os-jank.ts",
    from: 'return join(NodeOS.homedir(), ".t3");',
    to: 'return join(NodeOS.homedir(), ".t3-v2");',
  },
];

let failed = false;
for (const { file, from, to } of edits) {
  const path = join(root, file);
  const source = readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) {
    console.error(`::error file=${file}::expected 1 match for ${from}, found ${count}`);
    failed = true;
    continue;
  }
  writeFileSync(path, source.replace(from, to));
  console.log(`patched ${file}: ${to}`);
}

if (failed) process.exit(1);
