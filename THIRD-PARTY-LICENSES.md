# Third-Party Licenses

The Customer Experience (CX) Design Agent is distributed under the Apache License 2.0 (see [LICENSE](LICENSE)).
It uses the open-source packages below. None are bundled in this repository: they are declared in the
`package.json` files and installed from the public npm registry at the versions pinned in the committed
`package-lock.json` files. All licenses are permissive and compatible with Apache-2.0; no package is used
under a copyleft license.

The Python components (mock-backend handler, document converters) use the Python standard library, plus
`boto3` / `urllib3` provided by the AWS Lambda runtime, and `python-docx` (MIT), which the user installs.
None of these are bundled by this project.

## Direct dependencies

| Package | Locked version | License | Role | Declared in |
|---|---|---|---|---|
| `amazon-connect-acxd-sdk` | 0.2.0 | Apache-2.0 | runtime (ACXD SDK) | deploy engine |
| `aws-cdk-lib` | 2.277.0 | Apache-2.0 | runtime (CDK constructs) | mock / connect / adapter CDK |
| `constructs` | 10.8.1 | Apache-2.0 | runtime (CDK base) | mock / connect / adapter CDK |
| `dotenv` | 16.6.1 | BSD-2-Clause | runtime (.env loading) | deploy engine, mock / connect CDK |
| `yaml` | ^2.5.0 | ISC | runtime (reads OpenAPI files) | deploy engine |
| `aws-cdk` | 2.1148.1 | Apache-2.0 | build (CDK CLI) | mock / connect / adapter CDK |
| `cdk-nag` | 2.38.2 | Apache-2.0 | build (CDK security checks) | connect / adapter CDK |
| `typescript` | 5.9.3 | Apache-2.0 | build (TypeScript compiler) | all four |
| `tsx` | 4.23.15 | MIT | build (TypeScript execution) | all four |
| `@types/node` | 22.20.5 / 20.19.43 | MIT | build (type definitions) | all four |

`license-checker` reports `amazon-connect-acxd-sdk` as `Apache*` because its `package.json` has no `license`
field; the package's repository (github.com/amazon-connect/agentic-cx-designer-sdk) is licensed Apache-2.0.

## Transitive dependencies

`license-checker` across the four packages finds 51 packages in total. Besides the licenses above, the tree
contains:

| License | Packages | Notes |
|---|---|---|
| ISC | 3 | Permissive |
| 0BSD | `tslib` | Permissive (public-domain equivalent); via the AWS SDK |
| BlueOak-1.0.0 | `minimatch` | Permissive; bundled inside `aws-cdk-lib` |
| MIT OR GPL-3.0-or-later | `case` | Dual-licensed, used under MIT; bundled inside `aws-cdk-lib` |

The AWS SDK (`@aws-sdk/*`) and Smithy (`@smithy/*`) packages pulled in by `amazon-connect-acxd-sdk` are Apache-2.0.

## Distinct licenses

Apache-2.0, MIT, BSD-2-Clause, ISC, 0BSD, BlueOak-1.0.0 (and MIT for the dual-licensed `case`). All permissive.

## Regenerating this list

After `npm ci` in each of `tools/acxd-deploy-engine`, `tools/acxd-mock-backend/cdk`,
`tools/acxd-connect-backend/cdk` and `tools/acxd-adapter-backend/cdk`:

```
npx license-checker --csv --out licenses.csv
# or a summary:
npx license-checker --summary
```
