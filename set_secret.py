#!/usr/bin/env python3
"""Encrypt TELEGRAM_BOT_TOKEN with repo public key and PUT it as a GitHub Actions secret."""
import base64, json, os, urllib.request

REPO = "mileschan852/WhosNearbyBot"
TOKEN = os.environ["SECRET_GITHUB_PASSWORD"]
SECRET = os.environ["SECRET_TELEGRAM_WHOSNEARBYBOT_TELEGRAM_PASSWORD"]

def api(path, data=None, method="GET"):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/{path}",
        data=json.dumps(data).encode() if data else None,
        method=method,
        headers={
            "Authorization": f"token {TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as r:
        body = r.read()
        return json.loads(body) if body else {}

pk = api("actions/secrets/public-key")

from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PublicKey
from cryptography.hazmat.primitives import serialization
pub = X25519PublicKey.from_public_bytes(base64.b64decode(pk["key"]))
ct = pub.encrypt(SECRET.encode(), b"")
sealed = base64.b64encode(ct).decode()

r = api("actions/secrets/TELEGRAM_BOT_TOKEN",
        {"encrypted_value": sealed, "key_id": pk["key_id"]}, method="PUT")
print("secret TELEGRAM_BOT_TOKEN updated, status OK")
