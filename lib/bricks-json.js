'use strict';

var when = require('when');


exports.JSON = function (arg) {
	return when(arg).then(function (ret) {
		return JSON.stringify(ret);
	});
};

exports.JSONParse = function (arg) {
	return when(arg).then(function (ret) {
		return JSON.parse(ret);
	});
};
