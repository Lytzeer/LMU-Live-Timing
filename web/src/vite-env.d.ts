/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YOUTUBE_STREAM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
