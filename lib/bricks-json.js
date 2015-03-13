'use strict';

var when = require('when');


exports.JSON = function (object, name) {
	return when(object).then(function (ret) {
		var object = ret;
		if (typeof name === 'string') {
			object = {};
			object[name] = ret;
		}
		return JSON.stringify(object);
	});
};

exports.ParseJSON = function (arg) {
	return when(arg).then(function (ret) {
		return JSON.parse(ret);
	});
};
