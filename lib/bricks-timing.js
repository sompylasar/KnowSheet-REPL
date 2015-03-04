'use strict';

module.exports = function () {
	var timing = {
		startTime: Date.now(),
		endTime: undefined,
		end: function () {
			if (timing.endTime) {
				throw new Error('Timing `end` called twice.');
			}
			timing.endTime = Date.now();
			return timing;
		}
	};
	return timing;
};
