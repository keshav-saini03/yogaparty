// Empty shim — replaces 'server-only' under vitest so server-only modules can
// be imported (and mocked) from tests. The runtime guard is restored in Next.js
// builds because vitest never executes there.
export {};
