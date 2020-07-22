module.exports = {
	// retriieve logs
	async getLogs({ homey }) {
		// you can access query parameters like `/?foo=bar` through args.query.foo
		const result = await homey.app.getLogs();
		return result;
	},
	// delete logs
	async deleteLogs({ homey }) {
		// you can access query parameters like `/?foo=bar` through args.query.foo
		const result = await homey.app.deleteLogs();
		return result;
	},
};
