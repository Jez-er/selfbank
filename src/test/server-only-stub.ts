// The real `server-only` package throws on import outside a React Server
// Component graph. Tests exercise those modules directly in Node, so vitest
// aliases the package to this no-op.
export {};
