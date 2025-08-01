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

def getEnvForSuite(suiteName, version) {

  def envVars = []

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

  // Add test suite specific environment variables
  switch(suiteName) {
    case 'test':
      envVars.add("COUCHBACKUP_MOCK_SERVER_PORT=${7700 + portOffset}")
      break
    case 'test-network/conditions':
      envVars.add("CLOUDANT_IAM_TOKEN_URL=${SDKS_TEST_IAM_URL}")
      envVars.add("TEST_TIMEOUT_MULTIPLIER=50")
      envVars.add("COUCHBACKUP_MOCK_SERVER_PORT=${7800 + portOffset}")
      break
    case 'test-iam':
      envVars.add("CLOUDANT_IAM_TOKEN_URL=${SDKS_TEST_IAM_URL}")
      envVars.add("COUCHBACKUP_MOCK_SERVER_PORT=${7900 + portOffset}")
      break
    default:
      error("Unknown test suite environment ${suiteName}")
  }

  return envVars
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

def runTest(version, filter=null, testSuite='test') {
  if (filter == null) {
    if (env.TEST_FILTER == null) {
      // The set of default tests includes unit and integration tests, but
      // not ones tagged #slower, #slowest.
      filter = '-i -g \'#slowe\''
    } else {
      filter = env.TEST_FILTER
    }
  }
  def testReportPath = "${testSuite}-${version}-results.xml"
  // Run tests using creds
  withEnv(getEnvForSuite("${testSuite}", version)) {
    withCredentials([usernamePassword(credentialsId: 'testServerLegacy', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD'),
                      usernamePassword(credentialsId: 'artifactory', usernameVariable: 'ARTIFACTORY_USER', passwordVariable: 'ARTIFACTORY_PW'),
                      string(credentialsId: 'testServerIamApiKey', variable: "${(testSuite == 'test-iam' || testSuite == 'test-network/conditions') ? 'COUCHBACKUP_TEST_IAM_API_KEY' : 'IAM_API_KEY'}")]) {
      try {
        // For the IAM tests we want to run the normal 'test' suite, but we
        // want to keep the report named 'test-iam'
        def testRun = (testSuite != 'test-iam') ? testSuite : 'test'
        
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
                export COUCH_BACKEND_URL="${(testSuite == 'test-iam' || testSuite == 'test-network/conditions') ? '${SDKS_TEST_SERVER_URL}' : '${COUCH_LEGACY_URL}'}"
                export COUCH_URL="${(testSuite == 'test-network/conditions') ? 'http://127.0.0.1:8888' : '${COUCH_BACKEND_URL}'}"
                export PROXY_URL='http://127.0.0.1:8474'
                set -x
                ./node_modules/mocha/bin/mocha.js --reporter xunit --reporter-options output=${testReportPath},suiteName=${testSuite} ${filter} ${testRun}
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
      parallel {
        // Stages that run on LTS version from full agent default container
        stage('Lint') {
          steps {
            script{
              sh 'npm run lint'
            }
          }
        }
        stage('Node Active LTS') {
          steps {
            script{
              runTest('active')
            }
          }
        }
        stage('IAM Node Active LTS') {
          steps {
            script{
              runTest('active', '-i -g \'#unit|#slowe\'', 'test-iam')
            }
          }
        }
        stage('Network Node Active LTS') {
          when {
            beforeAgent true
            environment name: 'RUN_TOXY_TESTS', value: 'true'
          }
          steps {
            script{
              runTest('active', '', 'test-network/conditions')
            }
          }
        }
        stage('Node Old Maintenance LTS') {
          steps {
            container('node-old-maintenance-lts') {
              script{
                runTest('old-maintenance')
              }
            }
          }
        }
        stage('Node Maintenance LTS') {
          steps {
            container('node-maintenance-lts') {
              script{
                runTest('maintenance')
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
