# Sync Contract

## Status

**FROZEN / PLANNED, NOT IMPLEMENTED IN R3.0.**

Supabase remains canonical operational truth. A later R3 chapter will introduce IndexedDB + Dexie for a durable Pending Safe mutation queue and small resumable context/cache.

Dexie must not become a second canonical database, full offline replica, or disaster backup.

R3.0 contains no mutation queue, synchronization worker, AppliedOperation domain, conflict engine, or offline academic cache. This document exists so later implementation has a durable home without pretending the system already exists.
