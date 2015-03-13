'use strict';

var cppArguments = require('./cpp-arguments');


function HTTPHeaders() {
	if (!(this instanceof HTTPHeaders)) {
		return new HTTPHeaders();
	}
	
	Object.defineProperties(this, {
		headers: {
			configurable: false,
			enumerable: true,
			writable: false,
			value: []
		}
	});
}
HTTPHeaders.prototype.Set = function () {
	return cppArguments.assert('HTTPHeaders#Set', [
		[
			cppArguments.assertion('string', 'const std::string&', 'key'),
			cppArguments.assertion('string', 'const std::string&', 'value'),
			function (key, value) {
				this.headers.push({
					first: key,
					second: value
				});
				
				return this;
			}
		]
	], arguments, this);
};


module.exports.HTTPHeaders = HTTPHeaders;
