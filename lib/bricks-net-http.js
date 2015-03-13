'use strict';

var cppArguments = require('./cpp-arguments');

var httpClient = require('./bricks-net-http-client');
var httpServer = require('./bricks-net-http-server');


function HTTP() {
	return cppArguments.assert('HTTP', [
		[
			cppArguments.assertion(httpClient.isRequestParams, 'const T_REQUEST_PARAMS&', 'request_params'),
			cppArguments.assertion(httpClient.isResponseParams, 'const T_RESPONSE_PARAMS&', 'response_params', cppArguments.ASSERTION_MODE_OPTIONAL),
			httpClient.run
		],
		[
			cppArguments.assertion('int', 'int', 'port'),
			httpServer.run
		]
	], arguments);
}


exports.HTTP = HTTP;
