/*jslint node: true */
"use strict";

var angular = require('angular');

angular.module('ngTpeIngenico', [])
    .constant('STATE', {
        'idle': 0,
        'payment_in_progress': 1,
        'print_int_progress': 2
    })
    .constant('STATUS_IN_PAYMENT', 1)
    .factory('$tpeIngenico', ['STATE', 'websocket', '$q', function PaymentFactory(STATE, websocket, $q) {
        var self = this, currentState = STATE.idle;

        /**
        * Payment object is the object sent to the TPE
        * It must respect this structure :
        * {
        *    action:int,
        *    data: {
        *      id: int,
        *      number: string,
        *      total_ttc: float,
        *      total_ht: float (optional),
        *      tva1: float (optional),
        *      tva2: float (optional),
        *      tva3: float (optional),
        *      create_at: string (optional),
        *      checkout_state: string (optional),
        *      delivery: string,
        *      confirmed: boolean (optional),
        *      reseted: boolean (optional),
        *      items: array[
        *          item: {
        *              name: string,
        *              total_ttc: float,
        *              quantity: int,
        *              extras: array[extra:{name:string}] (optional),
        *              items: array(items) (optional)
        *          }
        *      ]
        *    }
        * }
        * @type {Object}
        */
        var paymentObject = {};

        var PaymentException = function (message) {
            this.message = message;
            this.name = 'PaymentException';
        };

        /**
        * Validate payment response
        * @param  {string} jsonResponse
        * @return {object} PaymentResponse
        */
        var validateResponse = function (jsonResponse) {
            var response;

            try {
                response = JSON.parse(jsonResponse);
            } catch (e) {
                throw new PaymentException('Parsing error:', e);
            }

            if (typeof response !== 'object') {
                throw new PaymentException('paymentResponse is not an object');
            }

            // check response object structure
            if (!response.hasOwnProperty('checkout_state')) {
                throw new PaymentException('checkout_state is missing');
            }
            if (!response.hasOwnProperty('checkout_details')) {
                throw new PaymentException('checkout_details is missing');
            }

            return response;
        };

        /**
        * Check paymentObject validity
        * @return {Boolean}
        */
        var validateQuery = function (paymentObject) {
            if (typeof paymentObject !== 'object') {
                throw new PaymentException('paymentObject is not an object');
            }

            // check mandatory fields
            if (!(paymentObject.hasOwnProperty('id')) ||
                    !(paymentObject.hasOwnProperty('number')) ||
                    !(paymentObject.hasOwnProperty('total_ttc')) ||
                    !(paymentObject.hasOwnProperty('delivery')) ||
                    !(paymentObject.hasOwnProperty('items'))) {
                throw new PaymentException('mandatory field is missing');
            }

            // check fields types
            if (typeof paymentObject.id !== 'number' ||
                    typeof paymentObject.number !== 'string' ||
                    typeof paymentObject.total_ttc !== 'number' ||
                    typeof paymentObject.delivery !== 'string' ||
                    !Array.isArray(paymentObject.items)) {
                throw new PaymentException('bad type of field');
            }

            if (paymentObject.id) {
                throw new PaymentException('paymentObject.id can\'t be null');
            }
            if (paymentObject.total_ttc) {
                throw new PaymentException('paymentObject.total_ttc can\'t be null');
            }
            if (paymentObject.items.length <= 0) {
                throw new PaymentException('paymentObject.items can\'t be null');
            }

            return true;
        };

        /**
        * Payment response observer
        */
        var paymentResponseObserver = function () {
            var defer = $q.defer();

            // waiting for response
            if (self.currentState === STATE.idle) {
                defer.reject('idle');
            } else {
                websocket.observeResponse().then(null, null, function (jsonResponse) {
                    try {
                        var paymentResponse = validateResponse(jsonResponse);
                        defer.resolve(paymentResponse);
                    } catch (e) {
                        defer.reject(e);
                    }
                });
            }

            return defer.promise;
        };

        /**
        * Payment request
        * @param  {object} payment
        */
        var paymentRequest = function (payment) {
            var defer = $q.defer();

            try {
                validateQuery(payment);
                self.paymentObject = payment;
                self.currentState = STATE.payment_in_progress;

                websocket.send(JSON.stringify(payment));
                defer.notify('request sent to websocket');

                paymentResponseObserver().then(function (response) {
                    defer.resolve(response);
                }, function errorHandler(e) {
                    defer.reject(e);
                });
            } catch (e) {
                defer.reject(e);
            }

            return defer.promise;
        };

        return {
            currentState: currentState,
            doRequest: paymentRequest,
            observeResponse: null // @todo response observer
        };
    }]);
