/// <reference types="vite/client" />

declare module 'monaco-editor/editor/editor.worker.js?worker' {
  const WorkerConstructor: { new (options?: { name?: string }): Worker };
  export default WorkerConstructor;
}

declare module 'monaco-editor/editor/*' {}
declare module 'monaco-editor/languages/*' {}


