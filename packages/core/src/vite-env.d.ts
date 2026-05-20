/// <reference types="vite/client" />

// Declare raw text imports for Vite
declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*.txt?raw" {
  const content: string;
  export default content;
}
