module.exports = {
	// retriieve logs
	async getLogs({ homey }) {
		const result = await homey.app.getLogs();
		return result;
	},
	// delete logs
	async deleteLogs({ homey }) {
		const result = await homey.app.deleteLogs();
		return result;
	},
	// delete logs
	async forceLive({ homey, query }) {
		const result = await homey.app.forceLive(query);
		return result;
	},
};
