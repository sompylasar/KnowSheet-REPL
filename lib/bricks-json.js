'use strict';

var inspect = require('util').inspect;

var cppArguments = require('./cpp-arguments');


exports.JSON = function () {
	return cppArguments.assert('JSON', [
		[
			cppArguments.assertion('object', 'T&&', 'object'),
			cppArguments.assertion('string', 'const std::string&', 'name', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (object, name) {
				if (typeof object.serialize !== 'function') {
					throw new Error('JSON: Object is not serializable: ' + inspect(object));
				}
		
				if (typeof name === 'string') {
					object = Object.create({
						serialize: function () {
							return object;
						}
					});
			
					object[name] = ret;
				}
		
				return JSON.stringify(object.serialize());
			}
		]
	], arguments);
};

exports.ParseJSON = function () {
	return cppArguments.assert('ParseJSON', [
		[
			cppArguments.assertion('string', 'const std::string&', 'str'),
			function (str) {
				var parsed = JSON.parse(str);
				
				var object = Object.create({
					serialize: function () {
						return object;
					}
				});
				
				for (var x in parsed) {
					object[x] = parsed[x];
				}
				
				return object;
			}
		]
	], arguments);
};
