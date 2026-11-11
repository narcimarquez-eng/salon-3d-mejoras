/// <reference types="vite/client" />

declare module 'draco3d/draco_encoder_nodejs.js' {
  const createEncoderModule: (opts?: object) => Promise<unknown>;
  export default createEncoderModule;
}
