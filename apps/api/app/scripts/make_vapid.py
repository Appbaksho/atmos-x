"""Generate a VAPID key pair for web push (prompt-v1 §6.13 W2): `python -m app.scripts.make_vapid`.

Prints VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY lines to paste into the root `.env` yourself.
Nothing is written to disk. Keep the private key secret; changing it invalidates existing subscriptions.
"""

from __future__ import annotations

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from py_vapid.utils import b64urlencode


def main() -> None:
    v = Vapid()
    v.generate_keys()
    public = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    private = v.private_key.private_numbers().private_value.to_bytes(32, "big")
    print(f"VAPID_PUBLIC_KEY={b64urlencode(public)}")
    print(f"VAPID_PRIVATE_KEY={b64urlencode(private)}")
    print("VAPID_SUBJECT=mailto:you@your-domain")


if __name__ == "__main__":
    main()
