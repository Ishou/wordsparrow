// Design-sync bundle entry — re-exports only the genuine, reusable
// design-system surface (primitives + brand) for claude.ai/design.
// Dot-prefixed and outside src/, so the app's tsc/panda/vite tooling
// never picks it up. Consumed by .ds-sync/package-build.mjs via --entry.
export * from './src/ui/components/primitives';
export * from './src/ui/components/brand';
// PinInput is a real primitive but is not re-exported by primitives/index.ts,
// so it is surfaced here directly for the design-system bundle.
export { PinInput } from './src/ui/components/primitives/PinInput';
