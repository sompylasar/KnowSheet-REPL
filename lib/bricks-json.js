'use strict';

var inspect = require('util').inspect;

var cppArguments = require('./cpp-arguments');

var JavaScriptJSON = global.JSON;


function Serializable() {
	var _this = this;
	
	Object.defineProperties(_this, {
		serialize: {
			configurable: false,
			enumerable: false,
			writable: false,
			value: function (ar) {
				Object.keys(_this).forEach(function (key) {
					if (typeof _this[key] === 'function') {
						return;
					}
					
					ar[key] = _this[key];
				});
			}
		}
	});
}


function JSON() {
	return cppArguments.assert('JSON', [
		[
			cppArguments.assertion('object', 'T&&', 'object'),
			cppArguments.assertion('string', 'const std::string&', 'name', cppArguments.ASSERTION_MODE_OPTIONAL),
			function (object, name) {
				if (typeof object.serialize !== 'function') {
					throw new Error('JSON: Object is not serializable: ' + inspect(object));
				}
				
				var ar = {};
				
				if (typeof name === 'string') {
					ar[name] = {};
					object.serialize(ar[name]);
				}
				else {
					object.serialize(ar);
				}
				
				return JavaScriptJSON.stringify(ar);
			}
		]
	], arguments);
}


function ParseJSON() {
	return cppArguments.assert('ParseJSON', [
		[
			cppArguments.assertion('string', 'const std::string&', 'str'),
			function (str) {
				var object = JavaScriptJSON.parse(str);
				
				Serializable.call(object);
				
				return object;
			}
		]
	], arguments);
}


exports.Serializable = Serializable;
exports.JSON = JSON;
exports.ParseJSON = ParseJSON;
