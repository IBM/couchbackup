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

def getEnvForSuite(suiteName, version, iamAuth) {

  def envVars = []

  basePort = 7700
  portOffset = 0
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

  // Add test suite specific environment variables and offset
  if (suiteName == 'test-network/conditions') {
      envVars.add("TEST_TIMEOUT_MULTIPLIER=50")
      portOffset = portOffset + 100
  }

  // Add IAM auth specific environment variables and offset
  if (iamAuth) {
    envVars.add("CLOUDANT_IAM_TOKEN_URL=${SDKS_TEST_IAM_URL}")
    portOffset = portOffset + 200
  }

  envVars.add("COUCHBACKUP_MOCK_SERVER_PORT=${basePort + portOffset}")

  return envVars
}

def shouldRunQaCombination(version, iamAuth, tests) {
  // List of version:iamAuth:tests to include
  // version is one of: active, maintenance, old-maintenance
  // iamAuth is true or false (and is irrelevant for unit tests)
  // tests is one of: unit, e2e or network
  // Valid axes (12 combinations):
  // - unit tests: all node versions with iamAuth=false (3)
  // - e2e tests: all node versions with iamAuth=true or false (6)
  // - network tests: all node versions with iamAuth=true (3)
  def defaultQaMatrixIncludes = '''
    active:false:unit
    maintenance:false:unit
    old-maintenance:false:unit
    active:false:e2e
    maintenance:false:e2e
    old-maintenance:false:e2e
    active:true:e2e
  '''
  def matrixIncludes = env.QA_MATRIX_INCLUDE?.trim() ? env.QA_MATRIX_INCLUDE : defaultQaMatrixIncludes
  def combination = "${version}:${iamAuth}:${tests}".toString()

  // Make the multiline string a list of valid combinations
  matrixIncludes = matrixIncludes
    .split('\n')
    .collect { it.trim().toString() }
    .findAll { !it.isEmpty() }

  return matrixIncludes.contains(combination)
}

def runQaCombination(version, iamAuth, tests) {
  iamAuth = iamAuth.toBoolean()
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
      suiteName = 'test'
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
    runTest(version, filter, suiteName, tests, iamAuth)
  } else {
    container("node-${version}-lts") {
      runTest(version, filter, suiteName, tests, iamAuth)
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

def runTest(version, filter, testSuite, reportName, iamAuth) {
  def reportSuiteName = "${reportName}-${iamAuth ? 'iam' : 'legacy'}-${version}"
  def testReportPath = "${reportSuiteName}-results.xml"
  // Use 'network' as lock resource for network tests to make them sequential
  // Use reportSuiteName for other tests to allow parallel execution
  def lockResource = reportName == 'network' ? 'network' : reportSuiteName
  
  lock(resource: lockResource) {
    // Run tests using creds
    withEnv(getEnvForSuite("${testSuite}", version, iamAuth)) {
      withCredentials([usernamePassword(credentialsId: 'testServerLegacy', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD'),
                        usernamePassword(credentialsId: 'artifactory', usernameVariable: 'ARTIFACTORY_USER', passwordVariable: 'ARTIFACTORY_PW'),
                        string(credentialsId: 'testServerIamApiKey', variable: "${iamAuth && testSuite != 'unit' ? 'COUCHBACKUP_TEST_IAM_API_KEY' : 'IAM_API_KEY'}")]) {
        try {
          // Actions:
          // Run tests using filter
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
                sh """
                  set +x
                  export COUCH_LEGACY_URL="https://\${DB_USER}:\$(node -e "console.log(encodeURIComponent(process.env.DB_PASSWORD));")@\${SDKS_TEST_SERVER_HOST}"
                  export COUCH_BACKEND_URL="${iamAuth ? '${SDKS_TEST_SERVER_URL}' : '${COUCH_LEGACY_URL}'}"
                  export COUCH_URL="${(testSuite == 'test-network/conditions') ? 'http://127.0.0.1:8888' : '${COUCH_BACKEND_URL}'}"
                  export PROXY_URL='http://127.0.0.1:8474'
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
              sh 'npm ci'
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
            axes {
              axis {
                name 'NODE_VERSION'
                values 'active', 'maintenance', 'old-maintenance'
              }
              axis {
                name 'IAM_AUTH'
                values 'true', 'false'
              }
              axis {
                name 'TESTS'
                values 'unit', 'e2e', 'network'
              }
            }
            excludes {
              // No handling for basic auth in the toxics http proxy
              exclude {
                axis {
                  name 'TESTS'
                  values 'network'
                }
                axis {
                  name 'IAM_AUTH'
                  values 'false'
                }
              }
              // Auth is not used in unit tests
              exclude {
                axis {
                  name 'TESTS'
                  values 'unit'
                }
                axis {
                  name 'IAM_AUTH'
                  values 'true'
                }
              }
            }
            when {
              beforeAgent true
              expression {
                shouldRunQaCombination(env.NODE_VERSION, env.IAM_AUTH, env.TESTS)
              }
            }
            stages {
              stage('Run Test') {
                steps {
                  script {
                    runQaCombination(env.NODE_VERSION, env.IAM_AUTH, env.TESTS)
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
