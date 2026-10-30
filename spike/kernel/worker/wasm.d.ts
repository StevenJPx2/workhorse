// workerd supplies `.wasm` modules listed in the config as compiled modules.
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
