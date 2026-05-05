import { defineCommand } from "@rune-cli/rune";

interface Event {
  readonly id: string;
  readonly type: "build.started" | "build.succeeded" | "build.failed";
  readonly at: string;
}

const events: readonly Event[] = [
  { id: "evt_1", type: "build.started", at: "2026-05-05T00:00:00Z" },
  { id: "evt_2", type: "build.succeeded", at: "2026-05-05T00:00:42Z" },
  { id: "evt_3", type: "build.started", at: "2026-05-05T00:05:00Z" },
  { id: "evt_4", type: "build.failed", at: "2026-05-05T00:05:30Z" },
];

export default defineCommand({
  description: "Stream build events as JSON Lines",
  jsonl: true,
  async *run() {
    for (const event of events) {
      yield event;
    }
  },
});
