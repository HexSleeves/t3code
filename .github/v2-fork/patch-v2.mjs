// Rebrands an upstream V2 checkout so its desktop build installs beside the
// regular T3 Code app instead of replacing it or sharing its state.
//
// Usage: node patch-v2.mjs <path-to-upstream-checkout>
//
// Every replacement must match exactly `count` times (default 1). If upstream
// moves any of these lines the build fails here, rather than silently shipping
// an app that migrates a ~/.t3/userdata database to the V2 schema.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
// The fork publishing these builds, e.g. HexSleeves/t3code (set by Actions).
const releaseRepository = process.env.GITHUB_REPOSITORY;
if (!root || !releaseRepository) {
  console.error("usage: GITHUB_REPOSITORY=<owner/repo> node patch-v2.mjs <checkout>");
  process.exit(2);
}
// Bundle id in the fork owner's namespace, e.g. com.hexsleeves.t3code.v2. It
// must be registered under the signing team (see setup-macos-signing.sh).
const appId = `com.${releaseRepository.split("/")[0].toLowerCase()}.t3code.v2`;

const edits = [
  {
    // Separate macOS bundle id, so it installs next to T3 Code instead of over it.
    file: "scripts/build-desktop-artifact.ts",
    from: 'const DESKTOP_APP_ID = "com.t3tools.t3code";',
    to: `const DESKTOP_APP_ID = "${appId}";`,
  },
  {
    // Nightly-style versions drive the updater; only the visible name changes.
    // The in-app stage label stays "Nightly": the desktop app validates it
    // against a fixed list ("Alpha" | "Dev" | "Nightly") at startup.
    file: "scripts/build-desktop-artifact.ts",
    from: '"T3 Code (Nightly)"',
    to: '"T3 Code (V2)"',
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
  {
    // SSH environments run the server on the remote host with this home, so
    // it must not be the regular app's ~/.t3 there either (and must not reuse
    // a regular T3 server already running from it).
    file: "packages/ssh/src/tunnel.ts",
    from: '"$HOME/.t3',
    to: '"$HOME/.t3-v2',
    count: 10,
  },
  {
    // SSH environments and CLI updates download server archives matching this
    // app's exact version, which only exist on the fork's releases.
    file: "packages/shared/src/cliRelease.ts",
    from: 'const CLI_RELEASE_REPOSITORY = "pingdotgg/t3code";',
    to: `const CLI_RELEASE_REPOSITORY = "${releaseRepository}";`,
  },
];

let failed = false;
for (const { file, from, to, count = 1 } of edits) {
  const path = join(root, file);
  const source = readFileSync(path, "utf8");
  const found = source.split(from).length - 1;
  if (found !== count) {
    console.error(`::error file=${file}::expected ${count} matches for ${from}, found ${found}`);
    failed = true;
    continue;
  }
  writeFileSync(path, source.replaceAll(from, to));
  console.log(`patched ${file} (${count}x): ${to}`);
}

if (failed) process.exit(1);
