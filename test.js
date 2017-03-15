var angular = require('angular');

angular
    .module('appTest', ['ngTpeIngenico'])
    .run(function () {
        console.log('hello world');
    });
