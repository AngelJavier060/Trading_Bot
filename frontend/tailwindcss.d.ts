declare module 'tailwindcss' {
  const config: any;
  export default config;
  export interface Config {
    content?: string[];
    theme?: any;
    plugins?: any[];
    [key: string]: any;
  }
}
