# Third-party notices

The MIT license covers this project's own code, not its dependencies.

| Dependency | License | Use |
| --- | --- | --- |
| JointJS (`@joint/core`) | MPL-2.0 | Interactive schematic renderer |
| CodeMirror and Lezer packages | MIT | Text editing; provided by the Obsidian host in the plugin |
| Milkdown and ProseMirror packages | MIT | Web Markdown notes |
| Nerdamer | MIT | Web symbolic analysis |
| `json-stringify-pretty-compact` | MIT | Document serialization |
| `remark-math` | MIT | Web mathematical Markdown |
| MathJax | Apache-2.0 | Web formula rendering; loaded from jsDelivr |

See [Obsidian bundle notices](apps/obsidian/THIRD_PARTY_LICENSES.md) for its bundled dependencies. Their notices are also preserved in the plugin JavaScript. JointJS is used unmodified; corresponding source for the pinned distribution is available at https://www.npmjs.com/package/@joint/core/v/4.2.4 and https://github.com/clientIO/joint.

Web and library builds include `THIRD_PARTY_LICENSES.txt` with installed runtime dependency license texts. External CDN assets and host-provided packages retain their upstream licenses. The lockfile records exact npm versions; bundled legal comments are retained by the build.
