'use strict';

function makeVirtualMethod() {
	/* istanbul ignore next */
	return function () {
		throw new Error('VIRTUAL METHOD');
	};
}
function makeNotImplementedMethod() {
	/* istanbul ignore next */
	return function () {
		throw new Error('NOT IMPLEMENTED METHOD');
	};
}

module.exports.makeVirtualMethod = makeVirtualMethod;
module.exports.makeNotImplementedMethod = makeNotImplementedMethod;
