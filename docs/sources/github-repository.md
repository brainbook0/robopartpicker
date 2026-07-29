# GitHub repository pilot

## State and API contract

`github_repository_pilot` remains disabled and `unreviewed`. The implemented
adapter is fixture-only and performs no network calls. A future approved live
client must send:

```text
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
Authorization: Bearer <token>
```

GitHub's current REST documentation uses API version `2026-03-10`. The
[Git Trees endpoint](https://docs.github.com/en/rest/git/trees) documents the
`truncated` response state and directs clients to bounded non-recursive
subtree requests when recursion truncates. The
[Repository Contents endpoint](https://docs.github.com/en/rest/repos/contents)
documents content-size behavior plus symlink and submodule response shapes.

## Bounded fixture behavior

The adapter:

- retains repository, exact commit, release, and license metadata;
- selects only allowlisted, relevant engineering paths up to 1 MiB each;
- stores path, source blob SHA, size, and role without mirroring file content
  or a repository archive;
- parses one commit-pinned BOM and preserves row evidence locators;
- emits explicit states for truncated trees, oversized files, archives,
  submodules, symlinks, unsafe paths, and missing BOMs;
- rejects API-version or source-identity drift.

The existing interactive `worker/services/project-import.ts` path is unchanged.

## Fixture hashes

| Fixture | SHA-256 |
| --- | --- |
| `repository-with-bom.json` | `93f90a7ea966f9d6aaacd14d6e0ad1101dab52ad3d4ff517024f0f52e15bc365` |
| `repository-missing-bom.json` | `e98cb2adc61ec2e4be3d40b5a9f7302dbee3e6d990060f618c6b129cd763b744` |

## Live-source gate

Live access additionally requires a reviewed GitHub policy revision, a bounded
pagination and serialized-concurrency budget, conditional request state, token
secret configuration, rate-limit handling, and approval for the exact retained
file classes. Whole-repository archive mirroring remains forbidden.
