import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(await readFile(
  new URL("../public/config.json", import.meta.url),
  "utf8",
));
const workerContract = JSON.parse(await readFile(
  new URL("./fixtures/worker-profile-lock-policy.json", import.meta.url),
  "utf8",
));
const requiredEntries = ["nearby", "hkmo-date"];
const identityFields = ["gender", "seeking"];

test("Who’s Nearby and HKMO Date GUI identity settings match the Worker policy contract", () => {
  for (const entryId of requiredEntries) {
    const entry = config.entries?.[entryId];
    assert.ok(entry, `public/config.json is missing required entry "${entryId}".`);
    assert.ok(entry.profileSetup, `GUI entry "${entryId}" is missing profileSetup.`);

    const contractEntry = workerContract.entries?.[entryId];
    assert.ok(
      contractEntry,
      `worker-profile-lock-policy.json is missing required entry "${entryId}".`,
    );

    assert.equal(
      entry.botKey,
      contractEntry.botKey,
      `${entryId}: GUI botKey does not match the Worker policy contract.`,
    );

    const guiLockedFields = entry.profileSetup.lockIdentity ? identityFields : [];
    assert.deepEqual(
      guiLockedFields,
      [...contractEntry.lockedFields].sort(),
      `${entryId}: GUI identity lock setting does not match the Worker policy contract.`,
    );
    assert.deepEqual(
      {
        gender: entry.profileSetup.defaultGender,
        seeking: entry.profileSetup.defaultSeeking,
      },
      contractEntry.defaults,
      `${entryId}: GUI identity defaults do not match the Worker policy contract.`,
    );
  }
});
