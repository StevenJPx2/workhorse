#!/usr/bin/env bash
# Copies the spike into $1 and makes each side a self-signed ECDSA P-256 certificate for the
# fixed name peer.workhorse. Each side's config pins the other's certificate.
# Usage: setup.sh <dir> [ca|leaf]   "ca" sets basicConstraints CA:TRUE on the self-signed cert.
set -euo pipefail
D=$1
KIND=${2:-ca}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$D"
cp "$HERE/link.js" "$HERE/laptop.capnp" "$HERE/home.capnp" "$D/"

CA=FALSE
if [ "$KIND" = ca ]; then CA=TRUE; fi

for side in laptop home; do
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 3650 \
    -subj "/CN=peer.workhorse" -addext "subjectAltName=DNS:peer.workhorse" \
    -addext "basicConstraints=critical,CA:$CA" \
    -keyout "$D/$side-key.pem" -out "$D/$side-cert.pem"
done

echo "set up $D ($KIND)"
