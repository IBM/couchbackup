# Contributing

## Contributor License Agreement

In order for us to accept pull-requests, the contributor must first complete
a Contributor License Agreement (CLA). This clarifies the intellectual
property license granted with any contribution. It is for your protection as a
Contributor as well as the protection of IBM and its customers; it does not
change your rights to use your own Contributions for any other purpose.

This is a quick process: one option is signing using Preview on a Mac,
then sending a copy to us via email. Signing this agreement covers a few repos
as mentioned in the appendix of the CLA.

You can download the CLAs here:

 - [Individual](http://cloudant.github.io/cloudant-sync-eap/cla/cla-individual.pdf)
 - [Corporate](http://cloudant.github.io/cloudant-sync-eap/cla/cla-corporate.pdf)

If you are an IBMer, please contact us directly as the contribution process is
slightly different.

## Requirements

Node.js and npm, other dependencies will be installed automatically via `npm`
and the `package.json` `dependencies` and `devDependencies`.

## Setup

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

## Code Style

This project uses [semi-standard](https://github.com/Flet/semistandard).
If you `npm install`, you'll get a local [eslint](http://eslint.org/)
configured with our settings which your editor will hopefully pick up.

## Testing

### Adding tests

New tests should be added for all PRs that make code modifications.

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

Internal developers with credentials can test the CI locally by using these
environment variables for example:
```
export COUCH_URL=https://...
export COUCH_BACKEND_URL=$COUCH_URL
export DBCOMPARE_NAME=DatabaseCompare
export DBCOMPARE_VERSION=1.0
```

and then run the non-slow integration tests by issuing the command:
```sh
./node_modules/mocha/bin/mocha -i -g '#unit|#slow'
```
