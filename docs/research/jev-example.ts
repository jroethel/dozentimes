const URL = "https://api.typesafe.ai/v1/systemone";

async function jev(body: object) {
  const t0 = performance.now();
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`jev ${res.status}: ${JSON.stringify(json)}`);
  return { json, ms };
}

const state = "My home address is 12 Oak St. I moved there in 2019 and I might move again next year.";
const body = {
  model: "jev-1.13.0",
  state,
  questions: {
    volatility: {
      type: "choice",
      instructions: "How quickly does the fact in this text go stale?",
      criteria: {
        identity: "Almost never changes (name, birthplace)",
        preference: "Changes slowly (tastes, habits)",
        decision: "A choice that may be revisited (plans, commitments)",
        status: "Current situation that changes often (address, job, availability)",
      },
    },
    mentions_move: { type: "noul", instructions: "Does the text mention a possible future move?" },
  },
};
async function main() {
  for (let i = 0; i < 3; i++) {
    const { json, ms } = await jev(body);
    if (i === 0) { console.log(JSON.stringify(body)); console.log(JSON.stringify(json)); }
    console.log(`call ${i + 1}: ${ms} ms, choice=${json.answers.volatility.choice}, conf=${json.answers.volatility.confidence}, noul=${json.answers.mentions_move.noul}`);
  }
}
main();
