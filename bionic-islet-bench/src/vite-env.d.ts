/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * "1" in the single-file preview build, where the simulation host runs on
   * the main thread instead of in a Web Worker. Declared here, and read with
   * dot access rather than a bracket, so Vite can replace it at build time and
   * drop the branch that is not taken. With a bracket the substitution does
   * not happen, both branches survive, and the engine is bundled twice.
   */
  readonly VITE_INLINE_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
