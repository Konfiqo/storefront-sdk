# Konfiqo Storefront SDK

Client packages for building a storefront on Konfiqo commerce.

| Package          | npm                         | What it is                                      |
| ---------------- | --------------------------- | ----------------------------------------------- |
| `packages/sdk`   | `@konfiqo/storefront-sdk`   | Framework-free typed client (browser + Node 20) |
| `packages/react` | `@konfiqo/storefront-react` | Provider, hooks and payment form for React      |

Start with the [SDK README](packages/sdk/README.md), which includes
[building your own storefront](packages/sdk/README.md#build-your-own-storefront)
on a store domain, then the [React README](packages/react/README.md).

## Development

```sh
npm ci
npm run typecheck
npm run lint        # eslint + prettier --check
npm test
npm run build       # sdk, then react
```

## Publish

CI publishes both packages when a tag `sdk-vX.Y.Z` is pushed
(`.github/workflows/publish-npm.yml`). The workflow fails unless `X.Y.Z`
equals the version in both `packages/sdk/package.json` and
`packages/react/package.json`; it then runs `npm ci`, the tests and the
build, and publishes the SDK, then React, in separate steps, with npm
provenance. Only tags on commits reachable from `main` publish, and the job
runs in the `npm-publish` GitHub environment, which holds the `NPM_TOKEN`
secret.

To release, bump the version in both packages (and `SDK_VERSION` in
`packages/sdk/src/index.ts`, and React's SDK peer range), update both
changelogs, merge, then:

```sh
git tag sdk-v0.4.0 && git push origin sdk-v0.4.0
```

If React fails after the SDK published, bump the patch version of both
packages and tag again; never republish an existing version.

## License

MIT
