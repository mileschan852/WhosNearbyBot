// GitHub Actions secret update: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
const https = require("https");
const sodium = require("/tmp/node_modules/libsodium-wrappers");

const REPO = "mileschan852/WhosNearbyBot";
const TOKEN = process.env.SECRET_GITHUB_PASSWORD;
const SUPABASE_URL = "https://uslxmetypzqnuutbgbkl.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function api(path, data, method) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const req = https.request(
      {
        hostname: "api.github.com",
        path: `/repos/${REPO}/${path}`,
        method: method || "GET",
        headers: {
          Authorization: `token ${TOKEN}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "secret-updater",
          "Content-Length": body ? Buffer.byteLength(body) : 0,
        },
      },
      (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => {
          if (res.statusCode >= 300) return reject(new Error(`${res.statusCode} ${out}`));
          resolve(out ? JSON.parse(out) : {});
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  await sodium.ready;
  const pk = await api("actions/secrets/public-key");
  for (const [name, value] of [["VITE_SUPABASE_URL", SUPABASE_URL], ["VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY]]) {
    const sealed = sodium.crypto_box_seal(
      sodium.from_string(value),
      sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL)
    );
    const b64 = sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
    await api("actions/secrets/" + name, { encrypted_value: b64, key_id: pk.key_id }, "PUT");
    console.log(name + " secret updated");
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
