'use strict';

var inspect = require('util').inspect;

var cppArguments = require('./cpp-arguments');

var JavaScriptJSON = global.JSON;


function Serializable() {
	Object.defineProperties(this, {
		serialize: {
			configurable: false,
			enumerable: false,
			writable: false,
			value: this.serialize || function (ar) {
				var _this = this;
				
				Object.keys(_this).forEach(function (key) {
					if (typeof _this[key] === 'function') {
						// Ignore functions.
						return;
					}
					
					if (typeof _this[key] === 'object') {
						if (Array.isArray(_this[key])) {
							ar[key] = [].slice.call(_this[key]);
						}
						else if (_this[key] && typeof _this[key].serialize === 'function') {
							ar[key] = {};
							_this[key].serialize(ar[key]);
						}
						else {
							// Ignore objects if they are not serializable.
							return;
						}
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
				
				if (typeof name !== 'string') {
					name = "value0";
				}
				
				var ar = {};
				ar[name] = {};
				object.serialize(ar[name]);
				
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
