#!groovy
// Copyright © 2017, 2023 IBM Corp. All rights reserved.
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

// Replaces (or appends) the port in a URL string with newPort.
// Returns a map [port: originalPort, url: rewrittenURL] where
// originalPort is the extracted port string (empty if the URL had no explicit port).
def withPort(url, newPort) {
  // find() returns null when there is no explicit port, whereas matcher[0] throws IndexOutOfBoundsException
  def originalPort = url.find(/:\d+(?=\/|$)/)?.substring(1) ?: ''
  def rewritten = url.replaceFirst(/:\d+(?=\/|$)/, '').replaceFirst(/(https?:\/\/[^\/]+)/, "\$1:${newPort}")
  return [port: originalPort, url: rewritten]
}

def getEnvForSuite(suiteName, version, server, auth) {

  def envVars = []

  def basePort = 7700
  def portOffset = 0
  switch(version) {
    case 'old-maintenance':
      portOffset += 30
      break
    case 'maintenance':
      portOffset += 20
      break
    case 'active':
      portOffset += 10
      break
    default:
      break
  }

  def backendURL
  def couchBackendURL
  def couchURL
  switch("${server}") {
    case 'none':
      envVars.add("COUCHBACKUP_MOCK_SERVER_PORT=${basePort + portOffset}")
      return envVars
    case 'gen2':
      backendURL = env.SDKS_TEST_G2_SERVER_URL
      break
    case 'gen1':
      backendURL = env.SDKS_TEST_SERVER_URL
      envVars.add("CLOUDANT_IAM_TOKEN_URL=${env.SDKS_TEST_IAM_URL}")
      break
  }

  // For legacy auth, add user info parameters into the backendURL.
  // The replacement must contain literal shell syntax so the shell (not Groovy) expands
  // ${DB_USER} and $(node -e ...) when COUCH_URL is re-exported in the sh step.
  if ("${auth}" == 'legacy') {
    backendURL = backendURL.replaceFirst(/(https?:\/\/)/) {
      it[1] + '${DB_USER}:$(node -e \'console.log(encodeURIComponent(process.env.DB_PASSWORD));\')@'
    }
  }

  // Add test suite specific environment variables and offset
  if (suiteName == 'test-network/conditions') {
      // For network tests we override DNS so the COUCH_URL host resolves to toxiproxy
      envVars.add("NODE_OPTIONS=--require ${WORKSPACE}/test-network/toxic-dns-override.js")
      // Add the proxy URL
      envVars.add("PROXY_URL=http://127.0.0.1:8474")
      // Rewrite the backend URL to the two proxy ports; extract the original port for the upstream config
      def couchURLResult = withPort(backendURL, 8888)
      envVars.add("COUCH_UPSTREAM_PORT=${couchURLResult.port}")
      couchURL = couchURLResult.url
      couchBackendURL = withPort(backendURL, 8889).url
      // Scale up test timeouts to account for toxic delays
      envVars.add("TEST_TIMEOUT_MULTIPLIER=50")
  } else {
    // For tests without a toxic proxy both COUCH_URL and COUCH_BACKEND_URL are the backendURL
    couchBackendURL = backendURL
    couchURL = backendURL
  }

  envVars.add("COUCH_BACKEND_URL=${couchBackendURL}")
  envVars.add("COUCH_URL=${couchURL}")

  return envVars
}

def getCredsForSuite(server, auth) {
  def creds = []
  switch("${auth}") {
    case 'legacy':
      switch("${server}") {
        case 'gen1':
          creds.add(usernamePassword(credentialsId: 'testServerLegacy', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD'))
          break
      }
      break
    case 'iamkey':
      switch("${server}") {
        case 'gen2':
          creds.add(string(credentialsId: 'testCdpServerIamApiKey', variable: 'COUCHBACKUP_TEST_IAM_API_KEY'))
          break
        case 'gen1':
          creds.add(string(credentialsId: 'testServerIamApiKey', variable: 'COUCHBACKUP_TEST_IAM_API_KEY'))
          break
      }
      break
  }
  return creds
}

def shouldRunQaCombination(version, tests, server, auth) {
  // All combinations are 4-part strings: version:tests:server:auth
  //   server is one of: none (unit tests), gen1, gen2
  //   auth   is one of: none (unit tests), legacy, iamkey
  // Entries with fewer than 4 parts are padded with :none, so shorthand
  // like "active:unit" work naturally.
  def defaultQaMatrixIncludes = '''
    active:unit
    active:e2e:gen1:legacy
    active:e2e:gen1:iamkey
    maintenance:unit
    maintenance:e2e:gen1:legacy
    maintenance:e2e:gen2:iamkey
    old-maintenance:unit
    old-maintenance:e2e:gen1:legacy
  '''
  // defaultQaMatrixIncludes is used for regular branch builds
  // For "big" regression check builds we use the build parameters:
  //    QA_MATRIX_INCLUDE to specify e2e axes and network tests
  //    TEST_FILTER to enable slower tests on the e2e axes
  def matrixIncludes = env.QA_MATRIX_INCLUDE?.trim() ? env.QA_MATRIX_INCLUDE : defaultQaMatrixIncludes

  def combination = "${version}:${tests}:${server}:${auth}".toString()

  // Normalise entries by trimming space or newlines and padding those with fewer than 4 parts with :none
  matrixIncludes = matrixIncludes
    .split('\n')
    .collect { it.trim().toString() }
    .findAll { !it.isEmpty() }
    .collect { def s = it; while (s.count(':') < 3) s = "${s}:none"; s.toString() }

  return matrixIncludes.contains(combination)
}

def runQaCombination(version, tests, server, auth) {
  def suiteName
  def filter
  switch (tests) {
    case 'unit':
      suiteName = 'test'
      reportName = 'unit'
      // Filter to only unit tests
      filter = '-g \'#unit\''
      break
    case 'e2e':
      suiteName = 'test/ci_*.js'
      // Use the env var filter or default to all e2e tests except slow ones (no unit tests)
      filter = env.TEST_FILTER == null ? '-i -g \'#unit|#slowe\'' : env.TEST_FILTER
      break
    case 'network':
      suiteName = 'test-network/conditions'
      // Network tests use an empty string filter because they load specific e2e tests inside the poisons
      filter = ''
      break
    default:
      error("Unknown tests: ${tests}")
  }

  // Run the tests in the correct container
  // Active version is run in the default executor
  // Other versions use a custom container
  if (version == 'active') {
    runTest(version, filter, suiteName, tests, server, auth)
  } else {
    container("node-${version}-lts") {
      runTest(version, filter, suiteName, tests, server, auth)
    }
  }
}

// NB these registry URLs must have trailing slashes

// url of registry for public uploads
def getRegistryPublic() {
    return "https://registry.npmjs.org/"
}

// url of registry for artifactory down
def getRegistryArtifactoryDown() {
    return "${Artifactory.server('taas-artifactory').getUrl()}/api/npm/cloudant-sdks-npm-virtual/"
}

def noScheme(str) {
    return str.substring(str.indexOf(':') + 1)
}

def withNpmEnv(registry, closure) {
  withEnv(['NPMRC_REGISTRY=' + noScheme(registry),
           'NPM_CONFIG_REGISTRY=' + registry,
           'NPM_CONFIG_USERCONFIG=.npmrc-jenkins']) {
    closure()
  }
}

def runTest(version, filter, testSuite, reportName, server, auth) {
  def reportSuiteName = (reportName == 'unit')
    ? "${reportName}-${version}"
    : "${reportName}-${version}-${server}-${auth}"
  def testReportPath = "${reportSuiteName}-results.xml"
  // Use 'network' as lock resource for network tests to make them sequential within the agent.
  // Use reportSuiteName for other tests to allow parallel execution within the agent.
  // Append the BUILD_TAG to ensure parallelism between build agents
  def lockResource = "${reportName == 'network' ? 'network' : reportSuiteName}-${BUILD_TAG}"

  lock(resource: lockResource) {
    withEnv(getEnvForSuite("${testSuite}", version, server, auth)) {
      withCredentials(getCredsForSuite(server, auth)) {
        try {
          withCredentials([usernamePassword(usernameVariable: 'NPMRC_USER', passwordVariable: 'NPMRC_TOKEN', credentialsId: 'artifactory')]) {
            withEnv(['NPMRC_EMAIL=' + env.NPMRC_USER]) {
              withNpmEnv(registryArtifactoryDown) {
                // A note on credential encoding
                // The couchbackup tool requires legacy credentials in the user-info portion of a URL, so creds in the URL must be encoded.
                // Encoding in the Jenkins credentials store is not an option because the creds are also used [unencoded] in other places.
                // Encoding in the couchbackup test code is not an option because the environment variable is used directly by couchbackup during tests.
                // Encoding in this file is not an option because the credential must be interpolated by groovy which is a Jenkins "no no".
                // Ergo we need to encode when we expand the env var in the shell. We do this by running $(node -e ...) as node is always available
                // when we are running couchbackup tests, other utilities that could encode like jq may not always be available.
                // We need to re-export COUCH_URL and COUCH_BACKEND_URL so that these get resolved for legacy credentials cases.
                sh """
                  set +x
                  export COUCH_BACKEND_URL="${env.COUCH_BACKEND_URL ?: ''}"
                  export COUCH_URL="${env.COUCH_URL ?: ''}"
                  set -x
                  ./node_modules/mocha/bin/mocha.js --reporter xunit --reporter-options output=${testReportPath},suiteName=${reportSuiteName} ${filter} ${testSuite}
                """
              }
            }
          }
        } finally {
          junit "**/${testReportPath}"
        }
      }
    }
  }
}

def sdkVersion
def coreVersion
def axiosVersion

pipeline {
  agent {
    kubernetes {
      yaml kubePodTemplate(name: 'couchbackup.yaml')
    }
  }
  options {
    disableConcurrentBuilds()
  }
  stages {
    stage('Detect Secrets') {
      steps {
        detectSecrets()
      }
    }

    stage('Build') {
      when {
        beforeAgent true
        // Skip when building tags as we just want to publish then
        not {
          buildingTag()
        }
      }
      steps {
        withCredentials([usernamePassword(usernameVariable: 'NPMRC_USER', passwordVariable: 'NPMRC_TOKEN', credentialsId: 'artifactory')]) {
          withEnv(['NPMRC_EMAIL=' + env.NPMRC_USER]) {
            withNpmEnv(registryArtifactoryDown) {
              sh 'npm ci --min-release-age=0'
            }
          }
        }
      }
    }
    stage('Update peerDependencies') {
      when {
        beforeAgent true
        changeRequest branch: 'dependabot/npm_and_yarn/ibm-cloud/cloudant-\\d+\\.\\d+\\.\\d+', comparator: 'REGEXP'
        environment name: 'BUILD_NUMBER', value: '1'
        expression {
          sh(returnStatus: true, script: '''
            ! git diff HEAD~1 --name-only | grep -qvE '^package(-lock)?\\.json$' &&
            git diff HEAD~1 -- package.json | grep '^[+-]' | grep -v '^[+-][+-][+-]' | grep -q '@ibm-cloud/cloudant'
          ''') == 0
        }
      }
      steps {
        script {
          sdkVersion = sh(returnStdout: true, script: "jq -r '.dependencies.\"@ibm-cloud/cloudant\"' package.json").trim()
        }
        withCredentials([usernamePassword(usernameVariable: 'NPMRC_USER', passwordVariable: 'NPMRC_TOKEN', credentialsId: 'artifactory')]) {
          withEnv(['NPMRC_EMAIL=' + env.NPMRC_USER]) {
            withNpmEnv(registryArtifactoryDown) {
              script {
                coreVersion = sh(returnStdout: true, script: "npm view @ibm-cloud/cloudant@${sdkVersion} dependencies.ibm-cloud-sdk-core").trim()
                axiosVersion = sh(returnStdout: true, script: "npm view ibm-cloud-sdk-core@${coreVersion} dependencies.axios").trim()
              }
              sh "npm install --save-exact --save-peer axios@${axiosVersion} ibm-cloud-sdk-core@${coreVersion}"
            }
          }
        }
        gitsh('github.com') {
          script {
            def diffStatus = sh(returnStatus: true, script: 'git diff --quiet package.json package-lock.json')
            if (diffStatus == 1) {
              sh 'git add package.json package-lock.json'
              sh "git commit -m 'chore: update peerDependencies for @ibm-cloud/cloudant@${sdkVersion}'"
              sh "git push origin HEAD:${env.CHANGE_BRANCH}"
            } else {
              echo 'No peerDependency changes to commit'
            }
          }
        }
      }
    }
    stage('QA') {
      when {
        beforeAgent true
        // Skip when building tags as we just want to publish then
        not {
          buildingTag()
        }
      }
      stages {
        stage('Lint') {
          steps {
            script{
              sh 'npm run lint'
            }
          }
        }
        stage('SonarQube analysis') {
          when {
            anyOf {
              changeRequest()
              expression { env.BRANCH_IS_PRIMARY }
            }
            not {
              changeRequest branch: 'dependabot*', comparator: 'GLOB'
            }
          }
          steps {
            script {
              def scannerHome = tool 'SonarQubeScanner';
              withSonarQubeEnv(installationName: 'SonarQubeServer') {
                sh "${scannerHome}/bin/sonar-scanner -Dsonar.qualitygate.wait=true -Dsonar.projectKey=couchbackup"
              }
            }
          }
        }
        stage('Mend scan') {
          when {
            expression { env.BRANCH_IS_PRIMARY }
          }
          environment {
            WS_PROJECTNAME='couchbackup'
          }
          steps {
            mendScan()
          }
        }
        stage('Test Matrix') {
          matrix {
            // This matrix defines the possible axes and excludes non-working combinations
            // Running of any particular axis is determined by shouldRunQaCombination
            // by checking the QA_MATRIX_INCLUDE parameter or defaultQaMatrixIncludes
            axes {
              axis {
                name 'NODE_VERSION'
                values 'active', 'maintenance', 'old-maintenance'
              }
              axis {
                name 'TESTS'
                values 'unit', 'e2e', 'network'
              }
              axis {
                name 'SERVER'
                values 'none', 'gen1', 'gen2'
              }
              axis {
                name 'AUTH'
                values 'none', 'legacy', 'iamkey'
              }
            }
            excludes {
              // Unit tests have no server interaction; only SERVER=none is valid
              exclude {
                axis {
                  name 'TESTS'
                  values 'unit'
                }
                axis {
                  name 'SERVER'
                  values 'gen1', 'gen2'
                }
              }
              // e2e and network tests require a real server; SERVER=none is not valid
              exclude {
                axis {
                  name 'TESTS'
                  values 'e2e', 'network'
                }
                axis {
                  name 'SERVER'
                  values 'none'
                }
              }
              // Unit tests have no auth; only AUTH=none is valid
              exclude {
                axis {
                  name 'TESTS'
                  values 'unit'
                }
                axis {
                  name 'AUTH'
                  values 'legacy', 'iamkey'
                }
              }
              // e2e and network tests require auth; AUTH=none is not valid
              exclude {
                axis {
                  name 'TESTS'
                  values 'e2e', 'network'
                }
                axis {
                  name 'AUTH'
                  values 'none'
                }
              }
              // gen2 is IAM-only so legacy auth is not valid
              exclude {
                axis {
                  name 'SERVER'
                  values 'gen2'
                }
                axis {
                  name 'AUTH'
                  values 'legacy'
                }
              }
            }
            when {
              beforeAgent true
              expression {
                shouldRunQaCombination(env.NODE_VERSION, env.TESTS, env.SERVER, env.AUTH)
              }
            }
            stages {
              stage('Run Test') {
                steps {
                  script {
                    runQaCombination(env.NODE_VERSION, env.TESTS, env.SERVER, env.AUTH)
                  }
                }
              }
            }
          }
        }
        stage('Log check') {
          steps {
            findText regexp: '.*EPIPE|DEP0137.*', alsoCheckConsoleOutput: true, unstableIfFound: true
          }
        }
      }
    }
    // Publish the primary branch
    stage('Publish') {
      when {
        beforeAgent true
        anyOf {
          buildingTag()
          branch 'main'
        }
      }
      stages {
        stage('Tag and GH release') {
          when {
            beforeAgent true
            branch 'main'
          }
          steps {
            // Run the gitTagAndPublish which tags/publishes to github for release builds
            // and does a dry run for snapshot builds
            script {
              gitTagAndPublish {
                  versionFile='package.json'
                  releaseApiUrl='https://api.github.com/repos/IBM/couchbackup/releases'
              }
            }
          }
        }
        stage('NPM snapshot publish') {
          when {
            beforeAgent true
            branch 'main'
          }
          steps {
            // Make a snapshot version with the build ID added
            sh "npm version --no-git-tag-version \$(npm version --json | jq -r '.[\"@cloudant/couchbackup\"]')-${env.BUILD_ID}"
            // Upload using the NPM creds
            withCredentials([string(credentialsId: 'npm-mail', variable: 'NPMRC_EMAIL'),
                            usernamePassword(credentialsId: 'npm-creds', passwordVariable: 'NPMRC_TOKEN', usernameVariable: 'NPMRC_USER')]) {
              // publish the snapshot build to NPM
              withNpmEnv(registryPublic) {
                sh 'npm publish --tag snapshot'
              }
            }
          }
        }
        stage('NPM publish') {
          when {
            beforeAgent true
            buildingTag()
          }
          steps {
            // Upload using the NPM creds
            withCredentials([string(credentialsId: 'npm-mail', variable: 'NPMRC_EMAIL'),
                            usernamePassword(credentialsId: 'npm-creds', passwordVariable: 'NPMRC_TOKEN', usernameVariable: 'NPMRC_USER')]) {
              // publish the tag build to NPM
              withNpmEnv(registryPublic) {
                sh 'npm publish'
              }
            }
          }
        }
      }
    }
  }
}
