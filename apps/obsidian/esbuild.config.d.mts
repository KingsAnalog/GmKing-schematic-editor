export interface BuildPluginOptions {
  write?: boolean;
  production?: boolean;
}

export function buildPlugin(options?: BuildPluginOptions): Promise<import("esbuild").BuildResult>;
