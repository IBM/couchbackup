# Contributing

## Issues

Please [read these guidelines](http://ibm.biz/cdt-issue-guide) before opening an issue.
If you still need to open an issue then we ask that you complete the template as
fully as possible.

## Pull requests

We welcome pull requests, but ask contributors to keep in mind the following:

* Only PRs with the template completed will be accepted
* We will not accept PRs for user specific functionality

### Developer Certificate of Origin

In order for us to accept pull-requests, the contributor must sign-off a
[Developer Certificate of Origin (DCO)](DCO1.1.txt). This clarifies the
intellectual property license granted with any contribution. It is for your
protection as a Contributor as well as the protection of IBM and its customers;
it does not change your rights to use your own Contributions for any other purpose.

Please read the agreement and acknowledge it by ticking the appropriate box in the PR
 text, for example:

- [x] Tick to sign-off your agreement to the Developer Certificate of Origin (DCO) 1.1

## General information

### Output and debugging

The [`debug` package](https://www.npmjs.com/package/debug) is used to control
the output and debug statements.

The `DEBUG` environment variable controls the debugging.
* `couchbackup:backup` and `couchbackup:restore` are enabled by default and
produce the CLI stderr output statements.
* `couchbackup` - all debug statements
* `couchbackup:<module>` - to enable the debug statements for a given module

### Code Style

This project uses [semi-standard](https://github.com/Flet/semistandard).
If you `npm install`, you'll get a local [eslint](http://eslint.org/)
configured with our settings which your editor will hopefully pick up.

### AI-generated code policy

Before submitting your pull request, please ensure you've reviewed and adhere to our [AI policy](AI_CODE_POLICY.md).

## Requirements

Node.js and npm, other dependencies will be installed automatically via `npm`
and the `package.json` `dependencies` and `devDependencies`.

### Setup

1. Clone or fork this repository.
2. Code
3. To install the dependencies run:
```sh
npm install
```
4. To use the local copy instead of `couchbackup` run:
```sh
./bin/couchbackup.bin.js
```

## Testing

### Unit tests

Unit tests are in the `test` folder and are run using the command:

```sh
npm test
```

Unit tests should be tagged with `#unit` so that they can be run separately from
the integration tests.

### Integration tests

Integration tests are in files prefixed `ci_` in the `test` folder.
These tests invoke `couchbackup` and `couchrestore` to work with real databases.
The integration tests require credentials to create databases for restoration and
to download the database comparison tool so whilst they do run as part of the
Jenkins CI they cannot be run for all dev environments.

Internal developers with credentials and the compare tool can test the CI
locally by using these environment variables for example:
```
export COUCH_URL=https://...
export COUCH_BACKEND_URL=$COUCH_URL
```

and then run the non-slow integration tests by issuing the command:
```sh
./node_modules/mocha/bin/mocha -i -g '#unit|#slow'
```
