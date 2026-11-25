# Third-party notices

The MIT license covers this project's own code, not its dependencies.

| Dependency | License | Use |
| --- | --- | --- |
| JointJS (`@joint/core`) | MPL-2.0 | Interactive schematic renderer |
| DOMPurify | Apache-2.0 OR MPL-2.0 | SVG preview sanitization |
| CodeMirror and Lezer packages | MIT | Text editing provided by the Obsidian host |
| Nerdamer | MIT | Web symbolic analysis |
| `json-stringify-pretty-compact` | MIT | Document serialization |
| `@mathjax/src` 4.1.3 and `@mathjax/mathjax-tex-font` 4.1.3 | Apache-2.0 | Local TeX and SVG component for Web Note and Analysis |

See [Obsidian bundle notices](apps/obsidian/THIRD_PARTY_LICENSES.md) for its bundled dependencies. Their notices are also preserved in the plugin JavaScript. JointJS is used unmodified; corresponding source for the pinned distribution is available at https://www.npmjs.com/package/@joint/core/v/4.2.4 and https://github.com/clientIO/joint.

Web and library builds include `THIRD_PARTY_LICENSES.txt` with installed runtime dependency license texts. The Web build includes the MathJax license under `vendor/mathjax/`. The custom combined component preserves upstream legal comments and uses the pinned [official source](https://www.npmjs.com/package/@mathjax/src/v/4.1.3) and [TeX font](https://www.npmjs.com/package/@mathjax/mathjax-tex-font/v/4.1.3) packages. See the [rebuild instructions](apps/web/public/vendor/mathjax/README.md).
