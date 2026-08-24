# Publishing to the VS Code Marketplace

The Marketplace runs on Azure DevOps identity. There is no way around that part;
everything else is one command.

## One-time setup

### 1. Azure DevOps organization

Sign in at <https://dev.azure.com> with a Microsoft account (any address works,
including a Gmail one). Create an organization if you have none — the name does
not matter and is never shown to users.

### 2. Personal Access Token

In Azure DevOps: **User settings** (top right) → **Personal access tokens** →
**New Token**.

| Field | Value |
| --- | --- |
| Organization | **All accessible organizations** — not a single org, or publishing fails |
| Expiration | up to 1 year |
| Scopes | **Custom defined** → find **Marketplace** → tick **Manage** |

Copy the token immediately; it is shown once. Treat it as a password: it can
publish and unpublish under your name. Never commit it.

### 3. Publisher

Go to <https://marketplace.visualstudio.com/manage>, sign in with the same
Microsoft account, and **Create publisher**. The **ID** you choose is permanent
and must equal the `publisher` field in `package.json`.

### 4. Log vsce in

```bash
npx @vscode/vsce login <your-publisher-id>
# paste the PAT when prompted
```

The token is stored in your OS keychain, not in this repo.

## Publishing

```bash
npm test                       # do not skip this
npx @vscode/vsce publish       # publishes the version in package.json
```

Or let vsce bump the version for you:

```bash
npx @vscode/vsce publish patch   # 0.3.0 -> 0.3.1
npx @vscode/vsce publish minor   # 0.3.0 -> 0.4.0
```

`vsce publish` runs `vscode:prepublish`, which compiles. It refuses to publish a
version that already exists, so bump first if you re-publish.

Processing takes a few minutes. The listing then appears at
`https://marketplace.visualstudio.com/items?itemName=<publisher>.peacock-color-picker`.

## Before each release

- [ ] `npm test` passes
- [ ] `CHANGELOG.md` has an entry for the new version
- [ ] `package.json` version bumped
- [ ] `npx @vscode/vsce ls` shows only files you meant to ship
- [ ] README renders correctly — it becomes the Marketplace page
- [ ] Install the `.vsix` locally and click through it once

## Publishing from CI

If you would rather release from GitHub Actions, store the PAT as a repository
secret named `VSCE_PAT` and add a workflow that runs on a tag:

```yaml
- run: npx @vscode/vsce publish --pat ${{ secrets.VSCE_PAT }}
```

Do not put the token anywhere else. Rotate it if it is ever printed in a log.

## Open VSX (optional)

VSCodium, Cursor, Gitpod and others pull from <https://open-vsx.org> instead of
the Microsoft Marketplace. Publishing there is separate and free:

```bash
npx ovsx publish peacock-color-picker-<version>.vsix -p <open-vsx-token>
```

## Things that will get a submission rejected

- A `publisher` field that does not match a publisher you own.
- Using someone else's name or logo. This extension names Peacock as a
  dependency, which is fine, but the icon and branding must stay your own — do
  not reuse Peacock's artwork.
- Missing or placeholder `repository`, `license`, or `README`.
