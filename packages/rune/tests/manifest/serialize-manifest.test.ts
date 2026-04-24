import { describe, expect, test } from "vite-plus/test";

import {
  generateCommandManifest,
  serializeCommandManifest,
} from "../../src/manifest/generate/generate-manifest";
import { setupCommandsFixtures } from "../helpers";

const { createCommandsFixture } = setupCommandsFixtures();

describe("serializeCommandManifest", () => {
  test("emits 2-space indented JSON that round-trips back to the original manifest", async () => {
    const commandsDirectory = await createCommandsFixture({
      "admin/users/index.ts": "export default {};",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    const serialized = serializeCommandManifest(manifest);

    expect(serialized).toBe(JSON.stringify(manifest, null, 2));
    expect(JSON.parse(serialized)).toEqual(manifest);
  });
});
