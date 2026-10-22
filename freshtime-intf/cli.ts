// node freshtime-intf/cli.ts "<question>" ["<follow-up>" ...]  - parses in order, carrying the session.
import { today } from "../freshtime-core/dates.ts";
import type { Session } from "../freshtime-core/contract.ts";
import { describeIntent, parseIntent } from "./intent.ts";

async function main() {
  let session: Session = { now: today(), ambient: null };
  for (const q of process.argv.slice(2)) {
    const r = await parseIntent(q, session);
    session = r.session;
    console.log(`> ${q}\n  ${describeIntent(r.intent)}\n  ${JSON.stringify(r.intent)}`);
  }
}
main();
