import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// Match the community review's severity split, including its stricter rules for
// new submissions. Keep all findings visible, including shared/Web source.
// https://github.com/obsidianmd/eslint-plugin/blob/master/docs/configuration.md#community-plugin-scanner-configuration
const reviewErrors = new Set([
  "no-eval", "no-implied-eval", "no-new-func",
  "@typescript-eslint/no-implied-eval",
  "no-unsanitized/method", "no-unsanitized/property",
  "obsidianmd/rule-custom-message", // Includes the Function-constructor check.
  "obsidianmd/regex-lookbehind", "obsidianmd/no-forbidden-elements",
  "obsidianmd/settings-tab/no-manual-html-headings",
  "obsidianmd/settings-tab/no-problematic-settings-headings",
  "obsidianmd/sample-names", "obsidianmd/no-sample-code", "obsidianmd/platform",
  "obsidianmd/no-plugin-as-component", "obsidianmd/detach-leaves",
  "obsidianmd/no-static-styles-assignment", "obsidianmd/no-view-references-in-plugin",
  "obsidianmd/no-unsupported-api", "obsidianmd/validate-manifest", "obsidianmd/validate-license"
]);

const reviewConfig = obsidianmd.configs.recommended.map(config => ({
  ...config,
  ...(config.rules && {
    rules: Object.fromEntries(Object.entries(config.rules).map(([rule, setting]) => {
      const [severity, ...options] = Array.isArray(setting) ? setting : [setting];
      if (severity === "off" || severity === 0) return [rule, setting];
      const level = reviewErrors.has(rule) || rule.startsWith("eslint-comments/") ? "error" : "warn";
      return [rule, [level, ...options]];
    }))
  })
}));

export default defineConfig([
  globalIgnores([
    "**/node_modules/**", "**/dist/**", ".codex-run/**", ".chrome-profile/**",
    "**/tests/**", "**/*.test.*", "**/*.spec.*", "**/scripts/**",
    "**/*.mjs", "**/*.cjs", "**/*.mts", "**/*.cts",
    "**/vite.config.*", "**/vitest.config.*"
  ]),
  ...reviewConfig,
  {
    files: ["**/*.ts"],
    rules: {
      // The Community review for 0.1.2 flags empty inline style assignments that plugin 0.6.0 permits.
      "no-restricted-syntax": ["error", {
        selector: "AssignmentExpression[operator='='][left.object.property.name='style'][right.type='Literal'][right.value='']",
        message: "Clear inline CSS with style.removeProperty() for Community review compatibility."
      }]
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
]);
