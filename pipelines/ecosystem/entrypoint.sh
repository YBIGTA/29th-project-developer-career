#!/bin/sh
set -u

python -m devcompass_ecosystem.batch
batch_status=$?

python -m devcompass_ecosystem.daily_batch
daily_status=$?

if [ "$batch_status" -ne 0 ]; then
    exit "$batch_status"
fi
exit "$daily_status"
