def setupNodeAndTest(version) {
    node {
        // Install nvm
        sh 'wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.2/install.sh | bash'
        // Unstash the built content
        unstash name: 'built'
        // run tests using creds
        withCredentials([[$class: 'UsernamePasswordMultiBinding', credentialsId: 'clientlibs-test', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD'],
                         [$class: 'UsernamePasswordMultiBinding', credentialsId: 'artifactory', usernameVariable: 'ARTIFACTORY_USER', passwordVariable: 'ARTIFACTORY_PW']]) {
            withEnv(["COUCH_URL=https://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_USER}.cloudant.com",
              "NVM_DIR=${env.HOME}/.nvm",
              "DBCOMPARE_VERSION=1.0.0",
              "DBCOMPARE_NAME=DatabaseCompare",
              "TEST_LIMIT=600"]) {
                try {
                    // Run in a single sh to preserve nvm Node version
                    // Load NVM
                    // Install/use required Node.js version
                    // Install mocha-junit-reporter so that we can get junit style output
                    // Run the unit tests
                    // Test the backup
                    sh """
                        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                        nvm install ${version}
                        nvm use ${version}
                        npm install mocha-junit-reporter --save-dev
                        ./node_modules/mocha/bin/mocha test --reporter mocha-junit-reporter
                        cd citest
                        # setup DatabaseCompare
                        curl -O -u ${env.ARTIFACTORY_USER}:${env.ARTIFACTORY_PW} https://na.artifactory.swg-devops.com/artifactory/cloudant-sdks-maven-local/com/ibm/cloudant/${env.DBCOMPARE_NAME}/${env.DBCOMPARE_VERSION}/${env.DBCOMPARE_NAME}-${env.DBCOMPARE_VERSION}.zip
                        unzip ${env.DBCOMPARE_NAME}-${env.DBCOMPARE_VERSION}.zip
                        # run backup and restore tests
                        ../node_modules/mocha/bin/mocha test --reporter mocha-junit-reporter
                    """
                } finally {
                    junit '**/test-results.xml'
                }
            }
        }
    }
}

stage('Build') {
    // Checkout, build
    node {
        checkout scm
        sh 'npm install'
        stash name: 'built'
    }
}

stage('QA') {
    // Use the oldest supported version of Node
    def axes = [ Node4x : {setupNodeAndTest('lts/argon')}] //4.x LTS
    // Add some other versions (possibly just do this for master later)
    axes.putAll(
            Node6x : { setupNodeAndTest('lts/boron') }, // 6.x LTS
            Node : { setupNodeAndTest('node') } // Current
            )
    // Run the required axes in parallel
    parallel(axes)
}
