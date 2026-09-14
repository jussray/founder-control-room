#!/usr/bin/env bash
set -euo pipefail

GCLOUD_VERSION="584.0.0"
GCLOUD_ARCHIVE="google-cloud-cli-linux-x86_64.tar.gz"
GCLOUD_SHA256="309a8fd47df8d4d5694c798b9d0d8968ae736a58f5dceba60eb2cf520b541460"
GCLOUD_URL="https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/${GCLOUD_ARCHIVE}"
INSTALL_ROOT="${FCR_GCLOUD_INSTALL_ROOT:-$HOME/.local/fcr-google-cloud}"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "Unsupported host for this pinned installer: $(uname -s) $(uname -m). Use Google's official package for the host architecture." >&2
  exit 2
fi

python3 - <<'PY'
import sys
if not ((3, 10) <= sys.version_info[:2] <= (3, 14)):
    raise SystemExit(f"Google Cloud CLI requires Python 3.10-3.14; found {sys.version.split()[0]}")
PY

mkdir -p "$INSTALL_ROOT"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl --fail --location --silent --show-error "$GCLOUD_URL" -o "$TMP_DIR/$GCLOUD_ARCHIVE"
echo "$GCLOUD_SHA256  $TMP_DIR/$GCLOUD_ARCHIVE" | sha256sum --check --status

tar -xf "$TMP_DIR/$GCLOUD_ARCHIVE" -C "$TMP_DIR"
rm -rf "$INSTALL_ROOT/google-cloud-sdk"
mv "$TMP_DIR/google-cloud-sdk" "$INSTALL_ROOT/google-cloud-sdk"
"$INSTALL_ROOT/google-cloud-sdk/install.sh" --quiet --usage-reporting=false --command-completion=false --path-update=false

"$INSTALL_ROOT/google-cloud-sdk/bin/gcloud" version --format='value(Google Cloud SDK)'
echo "Installed pinned Google Cloud CLI ${GCLOUD_VERSION} at $INSTALL_ROOT/google-cloud-sdk"
echo "Add $INSTALL_ROOT/google-cloud-sdk/bin to PATH for this shell/runtime."
