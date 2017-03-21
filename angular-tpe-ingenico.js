/*jslint node: true */
"use strict";

angular
.module('ngTpeIngenico', [])
.factory('$tpeIngenico', ['$websocket', '$q', '$timeout', function PaymentFactory($websocket, $q, $timeout) {
    var self = this,
    state = {
        'idle': 1,
        'in_payment': 2
    },
    currentState = state.idle,
    payment_timeout = 120000, // in ms
    ws = $websocket('ws://localhost:8787'),
    nIntervId,
    locked = false,
    wsDefer = $q.defer();

    function reconnect() {
        if (!locked) {
            locked = true;
            ws.reconnect();
        }
    };

    ws.onMessage(function (event) {
        self.response = event.data;
        try {
            var paymentResponse = validateResponse(self.response);
            if (false !== paymentResponse) {
                wsDefer.notify(self.response);
            }
        } catch (e) {
            wsDefer.reject(e);
        }
    });

    ws.onError(function (event) {
        locked = false;
        console.log('connection Error');
        nIntervId = setInterval(reconnect(), 5000);
    });

    ws.onClose(function (event) {
        locked = false;
        console.log('connection closed');
        nIntervId = setInterval(reconnect, 5000);
    });

    ws.onOpen(function () {
        locked = true;
        console.log('connection open');
        clearInterval(nIntervId);
    });

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
        if (!response.hasOwnProperty('checkout_state') ||
        !response.hasOwnProperty('checkout_details')) {
            return false;
        }

        return response;
    };

    /**
    * Check paymentObject validity
    * @return {Boolean}
    */
    var validateQuery = function (queryObject) {
        if (typeof queryObject !== 'object') {
            throw new PaymentException('paymentObject is not an object');
        }

        if (!queryObject.hasOwnProperty('action')) {
            throw new PaymentException('attribute action is missing');
        }

        if (!queryObject.hasOwnProperty('data')) {
            throw new PaymentException('attribute data is missing');
        }

        var paymentObject = queryObject.data;

        // check mandatory fields
        if (!(paymentObject.hasOwnProperty('id')) ||
        !(paymentObject.hasOwnProperty('number')) ||
        !(paymentObject.hasOwnProperty('total_ttc')) ||
        !(paymentObject.hasOwnProperty('items'))) {
            throw new PaymentException('mandatory field is missing');
        }

        if (paymentObject.id <= 0) {
            throw new PaymentException('paymentObject.id can\'t be null');
        }
        if (paymentObject.total_ttc <= 0) {
            throw new PaymentException('paymentObject.total_ttc can\'t be null');
        }
        if (paymentObject.items.length <= 0) {
            throw new PaymentException('paymentObject.items can\'t be null');
        }

        return true;
    };

    var observeResponse = function () {
        return wsDefer.promise;
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
            self.currentState = state.payment_in_progress;

            ws.send(JSON.stringify(payment));

            // n second timeout to manage payment response
            var promiseTimeout = $timeout(function () {
                self.currentState = state.idle;
                defer.reject('response timeout');
            }, payment_timeout);

            observeResponse().then(null, null, function (response) {
                self.currentState = state.idle;
                defer.resolve(response);
            });
        } catch (e) {
            self.currentState = state.idle;
            defer.reject(e);
        }

        return defer.promise;
    };

    return {
        currentState: currentState,
        paymentRequest: paymentRequest
    };
}]);
