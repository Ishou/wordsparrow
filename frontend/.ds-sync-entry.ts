// Design-sync barrel: primitives + brand surface for claude.ai/design; dot-prefix keeps tsc/panda/vite out.
export * from './src/ui/components/primitives';
export * from './src/ui/components/brand';
// PinInput is omitted from primitives/index.ts; surface it directly.
export { PinInput } from './src/ui/components/primitives/PinInput';
