/*jshint evil: true*/
'use strict';

var inherits = require('util').inherits;

function makeCppException(baseClassConstructor, thisClassConstructorName) {
	function _ctor(ctor, _this, args) {
		// Allow instantiation without `new`.
		if (!(_this instanceof ctor)) {
			_this = Object.create(ctor.prototype);
			_this = ctor.apply(_this, args);
			return _this;
		}
		
		// Native `Error` requires special treatment to inherit from.
		// @see http://stackoverflow.com/a/17936621/1346510
		if (baseClassConstructor === Error) {
			var error = Error.apply(_this, args);
			
			_this.name = error.name = thisClassConstructorName;
			_this.message = error.message;
			
			Object.defineProperty(_this, "stack", {
				get: function () { return error.stack; }
			});
		}
		else {
			baseClassConstructor.apply(_this, args);
			
			_this.name = thisClassConstructorName;
		}
		
		return _this;
	}
	
	function _inherits(ctor) {
		inherits(ctor, baseClassConstructor);
		return ctor;
	}
	
	// HACK: This evil immediately-invoked function below makes a function with a name.
	return new Function('_ctor, _inherits', '' +
		'return _inherits(function ' + thisClassConstructorName + '() {' +
			'return _ctor(' + thisClassConstructorName + ', this, arguments); ' +
		'});' +
	'')(_ctor, _inherits);
}

exports.makeCppException = makeCppException;

// This is the base C++ Exception class made the same way as other exceptions.
exports.Exception = makeCppException(Error, "Exception");
