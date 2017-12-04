#!groovy
// Copyright © 2017, 2018 IBM Corp. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

def getEnvForSuite(suiteName) {
  // Base environment variables
  def envVars = [
    "COUCH_BACKEND_URL=https://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_USER}.cloudant.com",
    "DBCOMPARE_NAME=DatabaseCompare",
    "DBCOMPARE_VERSION=1.0.1",
    "NVM_DIR=${env.HOME}/.nvm"
  ]

  // Add test suite specific environment variables
  switch(suiteName) {
    case 'test':
      envVars.add("COUCH_URL=https://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_USER}.cloudant.com")
      break
    case 'toxytests/toxy':
      envVars.add("COUCH_URL=http://localhost:3000") // proxy
      envVars.add("TEST_TIMEOUT_MULTIPLIER=50")
      break
      case 'test-iam':
        envVars.add("COUCH_URL=https://${env.DB_USER}.cloudant.com")
        envVars.add("COUCHBACKUP_TEST_IAM_API_KEY=${env.IAM_API_KEY}")
        break
    default:
      error("Unknown test suite environment ${suiteName}")
  }

  return envVars
}

def setupNodeAndTest(version, filter='', testSuite='test') {
  node {
    // Install NVM
    sh 'wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.2/install.sh | bash'
    // Unstash the built content
    unstash name: 'built'

    // Run tests using creds
    withCredentials([usernamePassword(credentialsId: 'clientlibs-test', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD'),
                      usernamePassword(credentialsId: 'artifactory', usernameVariable: 'ARTIFACTORY_USER', passwordVariable: 'ARTIFACTORY_PW'),
                      string(credentialsId: 'clientlibs-test-iam', variable: 'IAM_API_KEY')]) {
      withEnv(getEnvForSuite("${testSuite}")) {
        try {
          // For the IAM tests we want to run the normal 'test' suite, but we
          // want to keep the report named 'test-iam'
          def testRun = (testSuite != 'test-iam') ? testSuite : 'test'

          // Actions:
          //  1. Load NVM
          //  2. Install/use required Node.js version
          //  3. Install mocha-jenkins-reporter so that we can get junit style output
          //  4. Fetch database compare tool for CI tests
          //  5. Run tests using filter
          sh """
            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
            nvm install ${version}
            nvm use ${version}
            npm install mocha-jenkins-reporter --save-dev
            curl -O -u ${env.ARTIFACTORY_USER}:${env.ARTIFACTORY_PW} https://na.artifactory.swg-devops.com/artifactory/cloudant-sdks-maven-local/com/ibm/cloudant/${env.DBCOMPARE_NAME}/${env.DBCOMPARE_VERSION}/${env.DBCOMPARE_NAME}-${env.DBCOMPARE_VERSION}.zip
            unzip ${env.DBCOMPARE_NAME}-${env.DBCOMPARE_VERSION}.zip
            ./node_modules/mocha/bin/mocha --reporter mocha-jenkins-reporter --reporter-options junit_report_path=./test/test-results.xml,junit_report_stack=true,junit_report_name=${testSuite} ${filter} ${testRun}
          """
        } finally {
          junit '**/*test-results.xml'
        }
      }
    }
  }
}

String getVersionFromPackageJson() {
  packageInfo = readJSON file: 'package.json'
  return packageInfo.version
}

String version = null;
boolean isReleaseVersion = false;

stage('Build') {
  // Checkout, build
  node {
    checkout scm
    version = getVersionFromPackageJson();
    isReleaseVersion = !version.toUpperCase(Locale.ENGLISH).contains('SNAPSHOT')
    sh 'npm install'
    stash name: 'built'
  }
}

stage('QA') {
  // Allow a supplied a test filter, but provide a reasonable default.
  String filter;
  if (env.TEST_FILTER == null) {
    // The set of default tests includes unit and integration tests, but
    // not ones tagged #slower, #slowest.
    filter = '-i -g \'#slowe\''
  } else {
    filter = env.TEST_FILTER
  }

  def axes = [
    Node4x:{ setupNodeAndTest('lts/argon', filter) }, //4.x LTS
    Node6x:{ setupNodeAndTest('lts/boron', filter) }, // 6.x LTS
    Node:{ setupNodeAndTest('node', filter) }, // Current
    // Test IAM on the current Node.js version. Filter out unit tests and the
    // slowest integration tests.
    Iam: { setupNodeAndTest('node', '-i -g \'#unit|#slowe\'', 'test-iam') }
  ]
  // Add unreliable network tests if specified
  if (env.RUN_TOXY_TESTS && env.RUN_TOXY_TESTS.toBoolean()) {
    axes.Network = { setupNodeAndTest('node', '', 'toxytests/toxy') }
  }
  // Run the required axes in parallel
  parallel(axes)
}

// Publish the master branch
stage('Publish') {
  if (env.BRANCH_NAME == "master") {
    node {
      checkout scm // re-checkout to be able to git tag

      // Upload using the ossrh creds (upload destination logic is in build.gradle)
      withCredentials([string(credentialsId: 'npm-mail', variable: 'NPM_EMAIL'),
                       usernamePassword(credentialsId: 'npm-creds', passwordVariable: 'NPM_PASS', usernameVariable: 'NPM_USER')]) {
        // Actions:
        // 1. add the build ID to any snapshot version for uniqueness
        // 2. install login helper
        // 3. login to npm, using environment variables specified above
        // 4. publish the build to NPM adding a snapshot tag if pre-release
        sh """
          ${isReleaseVersion ? '' : ('npm version --no-git-tag-version ' + version + '.' + env.BUILD_ID)}
          sudo npm install -g npm-cli-login
          npm-cli-login
          npm publish ${isReleaseVersion ? '' : '--tag snapshot'}
        """
      }

      // if it is a release build then do the git tagging
      if (isReleaseVersion) {

        // Read the CHANGES.md to get the tag message
        tagMessage = ''
        for (line in readFile('CHANGES.md').readLines()) {
          if (!''.equals(line)) {
            // append the line to the tagMessage
            tagMessage = "${tagMessage}${line}\n"
          } else {
            break
          }
        }

        // Use git to tag the release at the version
        try {
          // Awkward workaround until resolution of https://issues.jenkins-ci.org/browse/JENKINS-28335
          withCredentials([[$class: 'UsernamePasswordMultiBinding', credentialsId: 'github-token', usernameVariable: 'GIT_USERNAME', passwordVariable: 'GIT_PASSWORD']]) {
            sh "git config user.email \"nomail@hursley.ibm.com\""
            sh "git config user.name \"Jenkins CI\""
            sh "git config credential.username ${env.GIT_USERNAME}"
            sh "git config credential.helper '!echo password=\$GIT_PASSWORD; echo'"
            sh "git tag -a ${version} -m '${tagMessage}'"
            sh "git push origin ${version}"
          }
        } finally {
          sh "git config --unset credential.username"
          sh "git config --unset credential.helper"
        }
      }
    }
  }
}
