stage('Build') {
    // Checkout, build
    node {
        checkout scm
        sh 'npm install'
        stash name: 'built'
    }
}

stage('QA') {
    node {
        // Unstash the built content
        unstash name: 'built'
        // run tests using creds
        withCredentials([[$class: 'UsernamePasswordMultiBinding', credentialsId: 'clientlibs-test', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD']]) {
            withEnv(["COUCH_URL=https://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_USER}.cloudant.com"]) {
                try {
                    // install mocha-junit-reporter so that we can get junit style output
                    sh 'npm install mocha'
                    sh 'npm install mocha-junit-reporter --save-dev'
                    // run unit tests
                    sh './node_modules/mocha/bin/mocha test --reporter mocha-junit-reporter'
                    // test backup
                    sh 'cd citest; ./test_backup.sh'
                } finally {
                    junit 'test-results.xml'
                }
            }
        }
    }
}
