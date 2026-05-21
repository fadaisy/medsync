/**
 * Conventional Commits enforcement for MedSync.
 * Allowed types match the kickoff doc: feat, fix, chore, docs, security, style, refactor, test, perf, build, ci, revert.
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "chore",
        "docs",
        "security",
        "style",
        "refactor",
        "test",
        "perf",
        "build",
        "ci",
        "revert",
      ],
    ],
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};
