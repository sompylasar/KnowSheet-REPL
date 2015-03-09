'use strict';


exports.GetFileExtension = function (file_name) {
	var i = Math.max(
		file_name.lastIndexOf('/'),
		file_name.lastIndexOf('\\'),
		file_name.lastIndexOf('.')
	);
	if (i === -1 || file_name.charAt(i) !== '.') {
		return "";
	}
	else {
		return file_name.substr(i + 1);
	}
};
