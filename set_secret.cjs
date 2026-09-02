// GitHub Actions secret update using real libsodium sealed box.
const https = require("https");
const sodium = require("/tmp/node_modules/libsodium-wrappers");

const REPO = "mileschan852/WhosNearbyBot";
const TOKEN = process.env.SECRET_GITHUB_PASSWORD;
const SECRET = process.env.SECRET_TELEGRAM_WHOSNEARBYBOT_TELEGRAM_PASSWORD;

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
  const sealed = sodium.crypto_box_seal(
    sodium.from_string(SECRET),
    sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL)
  );
  const b64 = sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
  await api(
    "actions/secrets/TELEGRAM_BOT_TOKEN",
    { encrypted_value: b64, key_id: pk.key_id },
    "PUT"
  );
  console.log("TELEGRAM_BOT_TOKEN secret updated");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
