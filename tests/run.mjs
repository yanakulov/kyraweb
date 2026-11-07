import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = await mkdtemp(join(tmpdir(), "kyraweb-tests-"));
try {
  const outfile = join(dir, "tests.mjs");
  await build({ entryPoints: ["tests/engine.test.ts"], outfile, bundle: true, platform: "node", format: "esm", define: { "import.meta.env.BASE_URL": '"/"' },
    plugins: [{ name: 'test-worklet-url', setup(builder) {
      builder.onResolve({ filter: /\?worker&url$/ }, args => ({ path: args.path, namespace: 'test-worklet-url' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-worklet-url' }, () => ({ contents: 'export default "/test-worklet.js";', loader: 'js' }));
    } }]
  });
  const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
