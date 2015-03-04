'use strict';

module.exports = function () {
	var timing = {
		startTime: Date.now(),
		endTime: undefined,
		end: function () {
			if (timing.endTime) { return timing; }
			timing.endTime = Date.now();
			return timing;
		}
	};
	return timing;
};
