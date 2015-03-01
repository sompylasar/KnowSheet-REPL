'use strict';

// The following line enables extended tracking of unhandled promise rejections.
// @see https://github.com/cujojs/when/blob/master/docs/api.md#whenmonitorconsole
require('when/monitor/console');

var when = require('when');

/**
 * Converts an object to a thenable that can be resolved to itself.
 * Adds the `then` function, `promise` and `resolver` properties.
 *
 * @param {Object} _this The object to convert (conversion goes in-place).
 * @return {Object} The converted object (the passed object).
 */
function makeThenable(_this) {
	if (when.isPromiseLike(_this)) {
		throw new Error('Argument "_this" must not be promise-like.');
	}
	
	// Create an internal deferred object that represents the promised `_this`.
	// @see https://github.com/cujojs/when/wiki/Deferred
	var deferred = when.defer();
	
	// The promise API is frozen and does not expose the internal deferred object.
	// @see https://github.com/cujojs/when/wiki/Deferred#consumers
	_this.promise = deferred.promise;
	
	// Proxy the `then` method to make this object promise-like (thenable).
	_this.then = function () {
		return _this.promise.then.apply(_this.promise, arguments);
	};
	
	// The resolver allows to resolve or reject the promise externally without exposing the internal deferred object.
	// @see https://github.com/cujojs/when/wiki/Deferred#producers
	_this.resolver = Object.create(deferred.resolver);
	
	// HACK: We must delete the `then` method before resolving to avoid infinite promise pending if resolved with the same object (`_this`).
	_this.resolver.resolve = function () {
		_this.then = undefined;
		
		return deferred.resolver.resolve.apply(this, arguments);
	};
	
	// Return the converted object for convenience.
	return _this;
}

/**
 * Converts a property to a promise that resolves when the property owner resolves.
 * If the property value has not been not modified before the owner resolved,
 * the property promise resolves to the original property value.
 * Works best with `makeThenable`.
 *
 * @param {Object} _this The owner of the property.
 * @param {string} property The name of the property to convert.
 * @param {Thenable} The promise that replaced the original property.
 */
function makeThenableProperty(_this, property) {
	if (typeof _this !== 'object') {
		throw new Error('Argument "_this" must be an object.');
	}
	if (typeof property !== 'string') {
		throw new Error('Argument "property" must be a string.');
	}
	
	// Use the owner promise from `makeThenable`.
	var ownerPromise = _this.promise;
	
	// Remember the default value to resolve to it if the property value wasn't replaced.
	var defaultValue = _this[property];
	
	// Chain on the owner promise or the owner itself.
	var propertyPromise = _this[property] = when(ownerPromise || _this).then(function () {
		if (_this[property] === propertyPromise) {
			_this[property] = defaultValue;
		}
		return _this[property];
	}, function (err) {
		// WARNING: Return the owner's promise to avoid unhandled rejection warnings.
		// If no owner promise existed, return a new rejected promise.
		return ownerPromise || when.reject(err);
	});
	
	// Return the created promise for convenience.
	return _this[property];
}


module.exports = {
	makeThenable: makeThenable,
	makeThenableProperty: makeThenableProperty
};
