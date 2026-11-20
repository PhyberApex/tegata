#!/bin/sh
# Boots the backend's real entrypoint the way the image's CMD does and waits
# for the same probe its HEALTHCHECK uses, so a broken Nest DI graph, a bad
# env var, an ESM import that only fails at runtime, or a fresh-database start
# is caught in CI instead of at the container's first boot in production.
#
# POSIX sh on purpose - node:24-alpine (busybox ash) runs it unchanged. The
# probe is whichever of wget (busybox ships it) or curl (a workstation usually
# ships only that) is on PATH; both return non-zero on a non-2xx answer, which
# is what makes them interchangeable here.
#
# Once healthy it sends SIGTERM, as `docker stop` does, and requires the
# process to exit by itself within BOOT_STOP_TIMEOUT_S with status 0 or 143
# (128 + SIGTERM). The image runs Node as PID 1, where the kernel applies no
# default signal action, so a process that installs no handler would ignore
# the signal and be SIGKILLed after Docker's grace period. When TEGATA_DB_PATH
# is set, the SQLite WAL next to it must also be gone or empty afterwards,
# which shows the database was closed rather than cut off.
#
# Usage: scripts/boot-check.sh <start-command> <health-url>
#   BOOT_TIMEOUT_S       seconds to wait for the health probe to go green (default 30)
#   BOOT_POLL_S          seconds between probe attempts (default 1)
#   BOOT_STOP_TIMEOUT_S  seconds to wait for a clean exit after SIGTERM (default 5)

start_cmd=$1
health_url=$2

if [ -z "$start_cmd" ] || [ -z "$health_url" ]; then
  echo 'usage: boot-check.sh <start-command> <health-url>' >&2
  exit 2
fi

if command -v wget >/dev/null 2>&1; then
  probe() { wget -qO- "$1" >/dev/null 2>&1; }
elif command -v curl >/dev/null 2>&1; then
  probe() { curl -fs -o /dev/null "$1"; }
else
  echo 'boot-check.sh needs wget or curl on PATH to probe the health URL' >&2
  exit 2
fi

timeout=${BOOT_TIMEOUT_S:-30}
poll=${BOOT_POLL_S:-1}
stop_timeout=${BOOT_STOP_TIMEOUT_S:-5}
log=$(mktemp)

# exec, so $pid is the process itself and SIGTERM reaches it, not a wrapping shell
sh -c "exec $start_cmd" >"$log" 2>&1 &
pid=$!

waited=0
status=1
while [ "$waited" -lt "$timeout" ]; do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "$start_cmd exited before the health check passed" >&2
    break
  fi
  if probe "$health_url"; then
    status=0
    break
  fi
  sleep "$poll"
  waited=$((waited + poll))
done

if [ "$status" -ne 0 ]; then
  if kill -0 "$pid" 2>/dev/null; then
    echo "$health_url did not become healthy within ${timeout}s" >&2
  fi
else
  kill -TERM "$pid" 2>/dev/null
  # Poll in tenths, so a prompt exit is not rounded up to a whole poll interval
  ticks=0
  while kill -0 "$pid" 2>/dev/null && [ "$ticks" -lt $((stop_timeout * 10)) ]; do
    sleep 0.1
    ticks=$((ticks + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "$start_cmd did not exit within ${stop_timeout}s of SIGTERM" >&2
    status=1
  else
    wait "$pid"
    exit_code=$?
    if [ "$exit_code" -ne 0 ] && [ "$exit_code" -ne 143 ]; then
      echo "$start_cmd exited with status $exit_code after SIGTERM (expected 0 or 143)" >&2
      status=1
    elif [ -n "$TEGATA_DB_PATH" ] && [ -s "$TEGATA_DB_PATH-wal" ]; then
      echo "$TEGATA_DB_PATH-wal is not empty after SIGTERM: the database was not closed" >&2
      status=1
    fi
  fi
fi

if [ "$status" -ne 0 ]; then
  echo "--- last output from $start_cmd ---" >&2
  tail -n 200 "$log" >&2
fi

kill -KILL "$pid" 2>/dev/null
wait "$pid" 2>/dev/null

rm -f "$log"
exit "$status"
