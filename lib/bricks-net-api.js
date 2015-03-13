'use strict';

exports.URL = require('./bricks-net-url').URL;

exports.DefaultContentType = require('./bricks-net-http-request').DefaultContentType;

exports.HTTPHeaders = require('./bricks-net-http-headers').HTTPHeaders;

exports.HTTPResponse = require('./bricks-net-http-response').HTTPResponse;

exports.HTTPResponseCode = require('./bricks-net-http-codes').HTTPResponseCode;
exports.HTTPResponseCodeAsString = require('./bricks-net-http-codes').HTTPResponseCodeAsString;

exports.GET = require('./bricks-net-http-request').GET;
exports.POST = require('./bricks-net-http-request').POST;
exports.POSTFromFile = require('./bricks-net-http-request').POSTFromFile;

exports.KeepResponseInMemory = require('./bricks-net-http-response').KeepResponseInMemory;
exports.SaveResponseToFile = require('./bricks-net-http-response').SaveResponseToFile;

exports.Request = require('./bricks-net-http-server').Request;
exports.ConnectionClose = require('./bricks-net-http-server').ConnectionClose;
exports.ConnectionKeepAlive = require('./bricks-net-http-server').ConnectionKeepAlive;

exports.HTTP = require('./bricks-net-http').HTTP;

exports.JSON = require('./bricks-json').JSON;
exports.ParseJSON = require('./bricks-json').ParseJSON;


/**
 * Creates a custom inspect function for the API items.
 *
 * @param {string} name The object export name.
 * @param {Function} docuFn The function that will be executed in the context of the instance being documented.
 * @return {Function} The custom inspect function that returns an instance of the `Documentation` object.
 */
function makeInspectDocumentationMethod(name, docuFn) {
	/**
	 * Custom inspect function for an API item.
	 * Returns an instance of the `Documentation` object 
	 * that will be handled in a special way by the pretty-printer.
	 *
	 * For example, if you evaluate just `HTTP`:
	 * `KnowSheet> HTTP`
	 * the interactive shell will print:
	 * `// KnowSheet Bricks HTTP.`
	 *
	 * @see bricks-prettyprint
	 *
	 * @return {Documentation} The documentation object.
	 */
	return function () {
		// TODO(sompylasar): Replace with the actual usage documentation.
		return new (require('./bricks-prettyprint').Documentation)(
			'// KnowSheet Bricks ' + name +
			(docuFn
				? docuFn.call(this, name).split('\n').join('\n// ')
				: ''
			)
		);
	};
}

function makeInspectDocumentationPropertyDescriptors(name, docuFn) {
	return {
		inspect: {
			// Freeze the properties.
			configurable: false,
			enumerable: false,
			writable: false,
			value: makeInspectDocumentationMethod(name, docuFn)
		}
	};
}

// Change the `inspect` and `toString` methods to return the documentation.
for (var x in exports) {
	Object.defineProperties(exports[x], makeInspectDocumentationPropertyDescriptors(x));
}

// Add the documentation to the `HTTPServer` because it is returned from `HTTP(port)`.
var HTTPServer = require('./bricks-net-http-server').HTTPServer;
Object.defineProperties(HTTPServer.prototype,
	makeInspectDocumentationPropertyDescriptors('HTTPServer', function () {
		return ' at port ' + this.port_;
	})
);
