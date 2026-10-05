import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute repository root, independent of the process working directory. */
export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// npm workspaces run package scripts with the package directory as cwd. Always
// load the root environment file so the API, worker, and scripts agree.
config({ path: resolve(repositoryRoot, ".env"), override: false });
