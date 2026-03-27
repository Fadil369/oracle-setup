# Performance Analysis

## Current Observations

- Control tower refresh cadence is periodic and includes branch + external probes.
- Snapshot payload is large and includes operational, claim, and runbook data in a single response.
- Reported latencies indicate branch variability (notably high-latency branch behavior).
- Scanner history indicates batch failure patterns (e.g., repeated HTTP 404 chunk failures in historical telemetry).

## Bottleneck Hypotheses

1. Monolithic snapshot response increases payload size and render time.
2. Sequential/large scan batches increase timeout probability.
3. External dependency timeouts (NPHIES) impact user-perceived freshness.
4. Repeated full-state polling rather than delta updates increases load.

## Optimization Plan

1. Introduce split endpoints: summary, claims, runbooks, actions.
2. Add ETag/If-None-Match support and cache control for non-critical sections.
3. Use incremental refresh for mutable sections only.
4. Add adaptive timeout/circuit breaker for unstable upstreams.
5. Add queue-based scan orchestration and dead-letter tracking.
6. Add scanner chunk auto-tuning based on latency and error rate.
7. Emit OpenTelemetry traces for each scan and control-tower refresh cycle.

## Target SLOs

- Control tower summary API p95 < 600 ms.
- Scanner single-claim p95 < 8 s.
- Dashboard refresh success rate >= 99.5%.
- Upstream timeout impact isolation: less than 5% of refresh cycles degraded.
