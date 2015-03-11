'use strict';

var util = require('util');

var extend = require('./extend');

var ASSERTION_MODE_OPTIONAL = { ASSERTION_MODE_OPTIONAL: 1 };
var ASSERTION_MODE_VARARGS = { ASSERTION_MODE_VARARGS: 1 };


var Object_getPrototypeOf = Object.getPrototypeOf;
var Object_prototype = Object.prototype;


// @see http://stackoverflow.com/questions/332422/how-do-i-get-the-name-of-an-objects-type-in-javascript
function getConstructorName(_this) { 
	var funcNameRegex = /function (.{1,})\(/;
	var results = (funcNameRegex).exec((_this).constructor.toString());
	return (results && results.length > 1 ? results[1] : "");
}


function assertArguments(methodName, signatures, values) {
	if (!methodName) {
		throw new Error('Argument "methodName" must be set.');
	}
	if (!util.isArray(signatures)) {
		throw new Error('Argument "signatures" must be an Array.');
	}
	if (!values || typeof values.length !== 'number') {
		throw new Error('Argument "signatures" must be an Array or Arguments.');
	}
	
	// Clone to avoid modifying the original when sorting in-place.
	signatures = [].slice.call(signatures);
	
	// Sort the array of signatures by the number of arguments, descending.
	signatures.sort(function (left, right) {
		return -(left.length - right.length);
	});
	
	var signature = null;
	var callback = null;
	var error = null;
	var matchedSignature = false;
	var value;
	var assertion;
	var ic, i, jc, j;
	
	for (ic = signatures.length, i = 0; i < ic; ++i) {
		signature = signatures[i];
		callback = null;
		
		if (signature.length > 0  && typeof signature[signature.length - 1] === 'function') {
			callback = signature[signature.length - 1];
			signature = [].concat(signature);
			signature.pop();
		}
		
		matchedSignature = (
			values.length <= signature.length
			|| (signature.length > 0 
				&& signature[signature.length - 1].mode === ASSERTION_MODE_VARARGS)
		);
		
		if (matchedSignature) {
			for (jc = signature.length, j = 0; j < jc; ++j) {
				assertion = signature[j];
				
				if (assertion.mode === ASSERTION_MODE_OPTIONAL && j >= values.length) {
					break;
				}
				
				value = values[j];
				
				if (!assertion.check(value)) {
					matchedSignature = false;
					// TODO(sompylasar): Make own error class.
					error = new Error(
						methodName +
						'(' + signature.join(', ') + '): ' +
						'Argument #' + j + ' `' + assertion.argumentName + '` ' +
						'must be of type `' + assertion.cppType + '`, ' +
						'got `' + ((typeof value === 'object' && getConstructorName(value)) || typeof value) + '`.'
					);
					break;
				}
			}
		}
		else {
			error = new Error(
				methodName +
				'(' + signature.join(', ') + '): ' +
				'Too many arguments passed.'
			);
		}
		
		if (matchedSignature) {
			error = null;
			break;
		}
	}
	
	if (error) {
		throw error;
	}
	else {
		if (callback) {
			callback.apply(undefined, values);
		}
	}
}


var baseAssertions = {
	bool: {
		check: function (value) {
			return (typeof value === 'boolean');
		}
	},
	string: {
		check: function (value) {
			return (typeof value === 'string');
		}
	},
	int: {
		check: function (value) {
			return (typeof value === 'number' && Math.floor(value) === value);
		}
	},
	double: {
		check: function (value) {
			return (typeof value === 'number');
		}
	},
	object: {
		check: function (value) {
			return (typeof value === 'object'
				&& (
					value === Object_prototype
					|| Object_getPrototypeOf(value) === Object_prototype
				)
			);
		}
	}
};

function makeAssertion(assertion, cppType, argumentName, mode) {
	if (mode === ASSERTION_MODE_VARARGS) {
		assertion = function () { return true; };
		cppType = '';
		argumentName = '...';
	}
	else if (!cppType || typeof cppType !== 'string') {
		throw new Error('Argument "cppType" must be a non-empty string.');
	}
	
	if (typeof assertion === 'string') {
		assertion = baseAssertions[assertion];
	}
	else if (typeof assertion === 'function') {
		assertion = { check: assertion };
	}
	else {
		throw new Error('Argument "assertion" must be either string or function.');
	}
	
	cppType = cppType || '';
	argumentName = argumentName || '';
	
	return extend(extend({}, assertion), {
		cppType: cppType,
		argumentName: argumentName,
		mode: mode,
		toString: function () {
			return cppType + (cppType && argumentName ? ' ' : '') + argumentName;
		}
	});
}

exports.assert = assertArguments;
exports.assertion = makeAssertion;
exports.ASSERTION_MODE_OPTIONAL = ASSERTION_MODE_OPTIONAL;
exports.ASSERTION_MODE_VARARGS = ASSERTION_MODE_VARARGS;
