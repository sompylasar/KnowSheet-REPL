'use strict';

var when = require('when');

exports.URL = require('./bricks-net-api-types').URL;

exports.DefaultContentType = require('./bricks-net-api-types').DefaultContentType;

exports.HTTPHeaders = require('./bricks-net-api-types').HTTPHeaders;

exports.HTTPResponse = require('./bricks-net-api-types').HTTPResponse;

exports.HTTPResponseCode = require('./bricks-net-http-codes').HTTPResponseCode;
exports.HTTPResponseCodeAsString = require('./bricks-net-http-codes').HTTPResponseCodeAsString;

exports.GET = require('./bricks-net-api-types').GET;
exports.POST = require('./bricks-net-api-types').POST;
exports.POSTFromFile = require('./bricks-net-api-types').POSTFromFile;

exports.KeepResponseInMemory = require('./bricks-net-api-types').KeepResponseInMemory;
exports.SaveResponseToFile = require('./bricks-net-api-types').SaveResponseToFile;

exports.HTTP = require('./bricks-net-api-types').HTTP;

exports.JSON = function (arg) {
	return when(arg).then(function (ret) {
		return JSON.stringify(ret);
	});
};

exports.JSONParse = function (arg) {
	return when(arg).then(function (ret) {
		return JSON.parse(ret);
	});
};

/**
 * Custom inspect function for the API items.
 * Returns an instance of the `Documentation` object 
 * that will be handled in a special way by the pretty-printer.
 *
 * @param {string} name The object export name.
 * @param {Object} instance The object being documented.
 * @return {Documentation} The documentation object.
 */
function makeInspectDocumentationMethod(name, instance) {
	return function () {
		// TODO(sompylasar): Replace with the actual usage documentation.
		return new (require('./bricks-prettyprint').Documentation)('// KnowSheet ' + name + '');
	};
}

// Change the `inspect` and `toString` methods to return the documentation.
for (var x in exports) {
	var p = {
		// Freeze the properties.
		configurable: false,
		enumerable: false,
		writable: false,
		value: makeInspectDocumentationMethod(x, exports[x])
	};
	
	Object.defineProperties(exports[x], {
		toString: p,
		inspect: p
	});
}
