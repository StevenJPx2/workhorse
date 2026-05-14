import type { ChangelogConfig } from "changelogen";

export default {
  repo: "StevenJPx2/workhorse",
  output: "CHANGELOG.md",
  types: {
    feat: { title: "🚀 Features" },
    fix: { title: "🐛 Bug Fixes" },
    perf: { title: "⚡ Performance" },
    refactor: { title: "♻️ Refactors" },
    docs: { title: "📖 Documentation" },
    build: { title: "📦 Build" },
    chore: { title: "🏡 Chore" },
    test: { title: "✅ Tests" },
  },
} satisfies ChangelogConfig;
