import { cpSync, existsSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticTarget = path.join(standalone, ".next", "static");
const cacheTarget = path.join(standalone, ".next", "cache");
const publicTarget = path.join(standalone, "public");
const testsTarget = path.join(standalone, "tests");
const sourceModules = path.join(root, "node_modules");
const standaloneModules = path.join(standalone, "node_modules");

// Local worktrees may use a linked dependency tree. Release builds keep Next's
// traced runtime dependencies instead of exporting that local symlink.
const selfContainedRelease = process.env.STANDALONE_SELF_CONTAINED === "YES";
if (!selfContainedRelease && existsSync(sourceModules) && lstatSync(sourceModules).isSymbolicLink()) {
  rmSync(standaloneModules, { recursive: true, force: true });
  symlinkSync(path.relative(standalone, realpathSync(sourceModules)), standaloneModules, "dir");
}

mkdirSync(path.dirname(staticTarget), { recursive: true });
rmSync(staticTarget, { recursive: true, force: true });
rmSync(publicTarget, { recursive: true, force: true });
rmSync(testsTarget, { recursive: true, force: true });
cpSync(path.join(root, ".next", "static"), staticTarget, { recursive: true });
mkdirSync(cacheTarget, { recursive: true });
cpSync(path.join(root, "public"), publicTarget, { recursive: true });
mkdirSync(testsTarget, { recursive: true });
cpSync(path.join(root, "tests", "release-smoke.mjs"), path.join(testsTarget, "release-smoke.mjs"));
