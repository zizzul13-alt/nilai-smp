# Troubleshooting

## Pending locally
`Pending locally` means IndexedDB commit succeeded but server confirmation has not. Keep the browser profile/storage intact; reconnect or restore authentication so sync can resume. It is not full-offline mode.

## Needs attention
The durable operation remains local. Inspect `last_error_code`; do not delete browser storage before recovery.

## Conflict
The server revision changed after the edit began. R3.2 never silently overwrites it. Keep the local operation for later user resolution; automatic merge is out of scope.

## Logout with pending work
Do not clear IndexedDB. Warn that unsynced work remains on this browser, sign out normally, and ensure a different account cannot query or sync the prior namespace.

## Schema mismatch
Apply source-controlled migrations in order. The browser remains fail-closed until `app_schema_version` is `r3.2-safe-work.1`.
